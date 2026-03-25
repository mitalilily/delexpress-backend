"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateDocumentStatus = exports.updateKycStatus = exports.UpdateKYCDetails = void 0;
exports.getUserKycService = getUserKycService;
const drizzle_orm_1 = require("drizzle-orm");
const constants_1 = require("../../utils/constants");
const client_1 = require("../client");
const kyc_1 = require("../schema/kyc");
const classes_1 = require("../../utils/classes");
const userProfile_1 = require("../schema/userProfile");
// Optional image clarity checker
// import { isImageBlurrySharp } from "@/utils/imageBlurriness";
const UpdateKYCDetails = async (userId, details) => {
    const { structure, companyType } = details;
    if (!structure || !(structure in constants_1.requiredKycDetails)) {
        throw new classes_1.HttpError(500, 'Invalid or missing business structure');
    }
    // ✅ Determine required fields based on structure + companyType
    const requiredFieldsMap = structure === 'company' && companyType
        ? constants_1.requiredKycFieldMap[structure][companyType] ?? {}
        : constants_1.requiredKycFieldMap[structure] ?? {};
    // ✅ Detect missing required fields
    const missing = Object.entries(requiredFieldsMap)
        .filter(([field, isRequired]) => isRequired && !details[field])
        .map(([field]) => field);
    if (missing.length) {
        throw new classes_1.HttpError(400, `Missing required fields for ${structure}: ${missing.join(', ')}`);
    }
    const now = new Date();
    await client_1.db.transaction(async (tx) => {
        const [existingKyc] = await tx
            .select()
            .from(kyc_1.kyc)
            .where((0, drizzle_orm_1.eq)(kyc_1.kyc.userId, userId))
            .limit(1)
            .execute();
        const kycPayload = {
            structure,
            companyType,
            updatedAt: now,
            status: 'verification_in_progress',
        };
        const docFields = [
            'aadhaarUrl',
            'panCardUrl',
            'partnershipDeedUrl',
            'companyAddressProofUrl',
            'boardResolutionUrl',
            'cancelledChequeUrl',
            'businessPanUrl',
            'gstCertificateUrl',
            'selfieUrl',
            'cin',
            'gstin',
            'llpAgreementUrl',
        ];
        const fieldToStatusMap = {
            aadhaarUrl: 'aadhaarStatus',
            cancelledChequeUrl: 'cancelledChequeStatus',
            selfieUrl: 'selfieStatus',
            businessPanUrl: 'businessPanStatus',
            llpAgreementUrl: 'llpAgreementStatus',
            companyAddressProofUrl: 'companyAddressProofStatus',
            gstCertificateUrl: 'gstCertificateStatus',
            panCardUrl: 'panCardStatus',
            partnershipDeedUrl: 'partnershipDeedStatus',
            boardResolutionUrl: 'boardResolutionStatus',
            cin: 'cinStatus',
        };
        const mimeFieldsMap = {
            aadhaarUrl: 'aadhaarMime',
            panCardUrl: 'panCardMime',
            llpAgreementUrl: 'llpAgreementMime',
            companyAddressProofUrl: 'companyAddressProofMime',
            selfieUrl: 'selfieMime',
            cancelledChequeUrl: 'cancelledChequeMime',
            boardResolutionUrl: 'boardResolutionMime',
            partnershipDeedUrl: 'partnershipDeedMime',
            businessPanUrl: 'businessPanMime',
            gstCertificateUrl: 'gstCertificateMime',
        };
        for (const field of docFields) {
            const newVal = details[field];
            const oldVal = existingKyc?.[field];
            if (newVal && newVal !== oldVal) {
                kycPayload[field] = newVal;
                const mimeField = mimeFieldsMap[field];
                if (mimeField) {
                    const mime = details[mimeField];
                    if (mime) {
                        kycPayload[mimeField] = mime;
                    }
                }
                const statusField = fieldToStatusMap[field];
                if (statusField) {
                    kycPayload[statusField] = 'pending';
                }
            }
        }
        // ✅ Remove unchanged audit-only fields before checking
        const changedKeys = Object.keys(kycPayload).filter((k) => !['structure', 'companyType', 'updatedAt', 'status'].includes(k));
        if (existingKyc && changedKeys.length > 0) {
            await tx.update(kyc_1.kyc).set(kycPayload).where((0, drizzle_orm_1.eq)(kyc_1.kyc.userId, userId)).execute();
        }
        else if (!existingKyc) {
            await tx
                .insert(kyc_1.kyc)
                .values({
                ...kycPayload,
                userId,
                createdAt: now,
            })
                .execute();
        }
        // ✅ Update domesticKyc in user_profiles
        await tx
            .update(userProfile_1.userProfiles)
            .set({
            domesticKyc: {
                status: 'verification_in_progress',
                updatedAt: now,
            },
        })
            .where((0, drizzle_orm_1.eq)(userProfile_1.userProfiles.userId, userId))
            .execute();
    });
};
exports.UpdateKYCDetails = UpdateKYCDetails;
const isCompanyRequiredFields = (value) => !Array.isArray(value);
const resolveRequiredFields = (structure, companyType) => {
    if (!structure || !(structure in constants_1.requiredKycDetails))
        return [];
    const required = constants_1.requiredKycDetails[structure];
    if (!isCompanyRequiredFields(required))
        return required;
    const companyKey = companyType && companyType in required ? companyType : undefined;
    if (companyKey)
        return required[companyKey] ?? [];
    return [];
};
async function getUserKycService(userId) {
    const w = await client_1.db?.query.kyc.findFirst({
        where: (0, drizzle_orm_1.eq)(kyc_1.kyc.userId, userId),
    });
    if (!w)
        throw new classes_1.HttpError(200, 'KYC not found');
    return w;
}
const updateKycStatus = async (userId, status, reason) => {
    const now = new Date();
    const payload = { status, updatedAt: now };
    if (status === 'verified') {
        // Approving KYC: reset all document statuses to verified and rejection reasons to empty string
        const docFields = [
            'aadhaar',
            'panCard',
            'partnershipDeed',
            'companyAddressProof',
            'boardResolution',
            'cancelledCheque',
            'businessPan',
            'gstCertificate',
            'selfie',
            'llpAgreement',
            'cin',
            'gstin',
        ];
        docFields.forEach((field) => {
            const statusField = `${field}Status`;
            const reasonField = `${field}RejectionReason`;
            payload[statusField] = 'verified';
            payload[reasonField] = undefined;
        });
    }
    if (reason && (status === 'rejected' || status === 'verification_in_progress')) {
        payload.rejectionReason = reason;
    }
    // Update main KYC record
    await client_1.db.update(kyc_1.kyc).set(payload).where((0, drizzle_orm_1.eq)(kyc_1.kyc.userId, userId)).execute();
    // Keep `user_profiles.domesticKyc` in sync so Admin UI shows correct status
    await client_1.db
        .update(userProfile_1.userProfiles)
        .set({
        domesticKyc: {
            status,
            updatedAt: now,
        },
    })
        .where((0, drizzle_orm_1.eq)(userProfile_1.userProfiles.userId, userId))
        .execute();
};
exports.updateKycStatus = updateKycStatus;
const updateDocumentStatus = async (userId, key, status, reason) => {
    const statusField = `${key.replace('Url', 'Status')}`;
    const now = new Date();
    const payload = { [statusField]: status, updatedAt: now };
    if (reason) {
        // Remove 'Url' from key before appending 'RejectionReason'
        const reasonField = `${key.replace('Url', '')}RejectionReason`;
        payload[reasonField] = reason;
    }
    const getStatusField = (field) => {
        if (typeof field !== 'string')
            return null;
        if (field.endsWith('Url')) {
            return `${field.replace('Url', '')}Status`;
        }
        if (field === 'cin')
            return 'cinStatus';
        return null;
    };
    await client_1.db.transaction(async (tx) => {
        await tx.update(kyc_1.kyc).set(payload).where((0, drizzle_orm_1.eq)(kyc_1.kyc.userId, userId)).execute();
        const [updatedKyc] = await tx
            .select()
            .from(kyc_1.kyc)
            .where((0, drizzle_orm_1.eq)(kyc_1.kyc.userId, userId))
            .limit(1)
            .execute();
        if (!updatedKyc)
            return;
        const requiredFields = resolveRequiredFields(updatedKyc.structure, updatedKyc.companyType);
        const requiredStatusFields = requiredFields
            .map((field) => getStatusField(field))
            .filter(Boolean);
        if (!requiredStatusFields.length)
            return;
        const allVerified = requiredStatusFields.every((field) => updatedKyc[field] === 'verified');
        if (allVerified && updatedKyc.status !== 'verified') {
            await tx
                .update(kyc_1.kyc)
                .set({ status: 'verified', updatedAt: now })
                .where((0, drizzle_orm_1.eq)(kyc_1.kyc.userId, userId))
                .execute();
            await tx
                .update(userProfile_1.userProfiles)
                .set({
                domesticKyc: {
                    status: 'verified',
                    updatedAt: now,
                },
            })
                .where((0, drizzle_orm_1.eq)(userProfile_1.userProfiles.userId, userId))
                .execute();
        }
    });
};
exports.updateDocumentStatus = updateDocumentStatus;

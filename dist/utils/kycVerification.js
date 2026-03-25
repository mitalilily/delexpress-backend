"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireKycVerification = requireKycVerification;
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../models/client");
const kyc_1 = require("../models/schema/kyc");
const classes_1 = require("./classes");
/**
 * Check if user's KYC is verified
 * @param userId - User ID to check
 * @throws HttpError if KYC is not verified
 */
async function requireKycVerification(userId) {
    const kycRecord = await client_1.db.select().from(kyc_1.kyc).where((0, drizzle_orm_1.eq)(kyc_1.kyc.userId, userId)).limit(1);
    // If no KYC record exists, throw error
    if (!kycRecord || kycRecord.length === 0) {
        throw new classes_1.HttpError(403, 'KYC verification required. Please complete your KYC verification before creating orders.');
    }
    const userKyc = kycRecord[0];
    // Check if KYC status is verified
    if (userKyc.status !== 'verified') {
        const statusMessages = {
            pending: 'KYC verification is pending. Please complete your KYC verification before creating orders.',
            verification_in_progress: 'KYC verification is in progress. Please wait for approval before creating orders.',
            rejected: 'KYC verification was rejected. Please update your KYC documents and resubmit for verification.',
        };
        throw new classes_1.HttpError(403, statusMessages[userKyc.status] || 'KYC verification is required to create orders.');
    }
}

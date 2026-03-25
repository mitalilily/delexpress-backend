"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMerchantOrderReadiness = getMerchantOrderReadiness;
exports.requireMerchantOrderReadiness = requireMerchantOrderReadiness;
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../models/client");
const paymentOptions_service_1 = require("../models/services/paymentOptions.service");
const kyc_1 = require("../models/schema/kyc");
const pickupAddresses_1 = require("../models/schema/pickupAddresses");
const userProfile_1 = require("../models/schema/userProfile");
const wallet_1 = require("../models/schema/wallet");
const classes_1 = require("./classes");
const REQUIRED_COMPANY_FIELDS = [
    'businessName',
    'companyAddress',
    'companyEmail',
    'companyContactNumber',
    'contactNumber',
    'contactEmail',
    'state',
    'city',
    'pincode',
];
function hasRequiredCompanyInfo(companyInfo) {
    if (!companyInfo)
        return false;
    return REQUIRED_COMPANY_FIELDS.every((field) => {
        const value = companyInfo[field];
        return typeof value === 'string' ? value.trim().length > 0 : Boolean(value);
    });
}
async function getMerchantOrderReadiness(userId) {
    const [profile, kycRecord, pickupCountResult, wallet, paymentSettings] = await Promise.all([
        client_1.db
            .select({
            onboardingComplete: userProfile_1.userProfiles.onboardingComplete,
            approved: userProfile_1.userProfiles.approved,
            companyInfo: userProfile_1.userProfiles.companyInfo,
        })
            .from(userProfile_1.userProfiles)
            .where((0, drizzle_orm_1.eq)(userProfile_1.userProfiles.userId, userId))
            .limit(1),
        client_1.db.select({ status: kyc_1.kyc.status }).from(kyc_1.kyc).where((0, drizzle_orm_1.eq)(kyc_1.kyc.userId, userId)).limit(1),
        client_1.db
            .select({ count: (0, drizzle_orm_1.count)() })
            .from(pickupAddresses_1.pickupAddresses)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(pickupAddresses_1.pickupAddresses.userId, userId), (0, drizzle_orm_1.eq)(pickupAddresses_1.pickupAddresses.isPickupEnabled, true))),
        client_1.db
            .select({ balance: wallet_1.wallets.balance })
            .from(wallet_1.wallets)
            .where((0, drizzle_orm_1.eq)(wallet_1.wallets.userId, userId))
            .limit(1),
        (0, paymentOptions_service_1.getPaymentOptions)(),
    ]);
    const profileRow = profile[0];
    const kycRow = kycRecord[0];
    const walletBalance = Number(wallet[0]?.balance ?? 0);
    const pickupCount = Number(pickupCountResult[0]?.count ?? 0);
    const requiredWalletBalance = Math.max(Number(paymentSettings?.minWalletRecharge ?? 0), 1);
    return {
        onboardingComplete: Boolean(profileRow?.onboardingComplete),
        approved: Boolean(profileRow?.approved),
        hasCompanyInfo: hasRequiredCompanyInfo(profileRow?.companyInfo),
        kycVerified: kycRow?.status === 'verified',
        hasPickupAddress: pickupCount > 0,
        walletReady: walletBalance >= requiredWalletBalance,
        walletBalance,
        requiredWalletBalance,
    };
}
async function requireMerchantOrderReadiness(userId) {
    const readiness = await getMerchantOrderReadiness(userId);
    if (!readiness.onboardingComplete) {
        throw new classes_1.HttpError(403, 'Complete onboarding before creating orders.');
    }
    if (!readiness.hasCompanyInfo) {
        throw new classes_1.HttpError(403, 'Complete your company information before creating orders.');
    }
    if (!readiness.approved) {
        throw new classes_1.HttpError(403, 'Your merchant account is pending approval. Please contact support if this is taking longer than expected.');
    }
    if (!readiness.kycVerified) {
        throw new classes_1.HttpError(403, 'KYC verification is required before creating orders.');
    }
    if (!readiness.hasPickupAddress) {
        throw new classes_1.HttpError(403, 'Add at least one pickup address before creating orders.');
    }
    if (!readiness.walletReady) {
        throw new classes_1.HttpError(403, `Add wallet balance before creating orders. Minimum required balance is Rs ${readiness.requiredWalletBalance}.`);
    }
}

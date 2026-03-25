"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requestProfilePhoneVerificationOTP = exports.verifyProfilePhoneOTP = exports.verifyProfileEmailOTP = exports.requestProfileEmailVerificationOTP = exports.updateUserProfileService = exports.upsertUserProfile = exports.getProfileByUserId = void 0;
exports.changePassword = changePassword;
const drizzle_orm_1 = require("drizzle-orm");
const authController_1 = require("../../controllers/authController");
const classes_1 = require("../../utils/classes");
const constants_1 = require("../../utils/constants");
const emailSender_1 = require("../../utils/emailSender");
const functions_1 = require("../../utils/functions");
const client_1 = require("../client");
const plans_1 = require("../schema/plans");
const userProfile_1 = require("../schema/userProfile");
const userPlans_1 = require("../schema/userPlans");
const users_1 = require("../schema/users");
/**
 * Fetch the profile for a specific userId (returns null if none exists)
 */
const getProfileByUserId = async (userId) => {
    const rows = await client_1.db
        .select({
        profile: userProfile_1.userProfiles,
        currentPlanId: userPlans_1.userPlans.plan_id,
        currentPlanName: plans_1.plans.name,
    })
        .from(userProfile_1.userProfiles)
        .leftJoin(userPlans_1.userPlans, (0, drizzle_orm_1.eq)(userPlans_1.userPlans.userId, userProfile_1.userProfiles.userId))
        .leftJoin(plans_1.plans, (0, drizzle_orm_1.eq)(plans_1.plans.id, userPlans_1.userPlans.plan_id))
        .where((0, drizzle_orm_1.eq)(userProfile_1.userProfiles.userId, userId))
        .limit(1);
    if (!rows[0])
        return null;
    return {
        ...rows[0].profile,
        currentPlanId: rows[0].currentPlanId ?? null,
        currentPlanName: rows[0].currentPlanName ?? null,
    };
};
exports.getProfileByUserId = getProfileByUserId;
/**
 * Upsert OR patch an existing profile in one call.
 * Users can only touch whitelisted fields; flags such as `approved`
 * stay under admin control.
 */
const upsertUserProfile = async (userId, input) => {
    const existing = await (0, exports.getProfileByUserId)(userId);
    // Sanitise input (strip undefined so jsonb merge below is clean)
    const payload = Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined));
    // Merge JSONB blocks (keeps untouched keys intact)
    const merged = {
        ...existing,
        ...payload, // new/updated blocks overwrite existing ones
    };
    const [updated] = await client_1.db
        .update(userProfile_1.userProfiles)
        .set({
        ...merged,
        updatedAt: new Date(),
    })
        .where((0, drizzle_orm_1.eq)(userProfile_1.userProfiles.userId, userId))
        .returning();
    return updated;
};
exports.upsertUserProfile = upsertUserProfile;
/* JSONB columns in user_profiles ― adjust if you add more */
const JSONB_COLUMNS = new Set([
    'companyInfo',
    'domesticKyc',
    'bankDetails',
    'gstDetails',
    'businessType',
    'salesChannels',
]);
/* ──────────────────────── main service ────────────────────── */
const updateUserProfileService = async (userId, data) => {
    /* 1. fetch current */
    const [existing] = await client_1.db
        .select()
        .from(userProfile_1.userProfiles)
        .where((0, drizzle_orm_1.eq)(userProfile_1.userProfiles.userId, userId))
        .limit(1);
    if (!existing)
        return null;
    /* 2. deep merge incoming into existing */
    const merged = (0, functions_1.deepMerge)(existing, data);
    /* 0️⃣ detect email / phone replacements */
    const incomingCInfo = (data.companyInfo ?? {});
    const emailChanged = incomingCInfo.contactEmail && incomingCInfo.contactEmail !== existing.companyInfo.contactEmail;
    const phoneChanged = incomingCInfo.contactNumber &&
        incomingCInfo.contactNumber !== existing.companyInfo.contactNumber;
    if (emailChanged) {
        /* Check user_profiles JSONB                             */
        const [emailProfileConflict] = await client_1.db
            .select({ id: userProfile_1.userProfiles.userId })
            .from(userProfile_1.userProfiles)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.sql) `${userProfile_1.userProfiles.companyInfo}->>'contactEmail' = ${incomingCInfo.contactEmail}`, (0, drizzle_orm_1.ne)(userProfile_1.userProfiles.userId, userId)))
            .limit(1);
        /* Check users.email as well                             */
        const [emailUserConflict] = await client_1.db
            .select({ id: users_1.users.id })
            .from(users_1.users)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(users_1.users.email, incomingCInfo.contactEmail), (0, drizzle_orm_1.ne)(users_1.users.id, userId)))
            .limit(1);
        if (emailProfileConflict || emailUserConflict) {
            throw new classes_1.HttpError(409, 'E‑mail already in use by another account');
        }
        merged.companyInfo = {
            ...merged.companyInfo,
            POCEmailVerified: false,
        };
    }
    if (phoneChanged) {
        const [phoneConflict] = await client_1.db
            .select({ id: userProfile_1.userProfiles.userId })
            .from(userProfile_1.userProfiles)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.sql) `${userProfile_1.userProfiles.companyInfo}->>'contactNumber' = ${incomingCInfo.contactNumber}`, (0, drizzle_orm_1.ne)(userProfile_1.userProfiles.userId, userId)))
            .limit(1);
        if (phoneConflict) {
            throw new classes_1.HttpError(409, 'Phone number already in use by another account');
        }
        merged.companyInfo = {
            ...merged.companyInfo,
            POCPhoneVerified: false,
        };
    }
    /* 3. diff → patch */
    const patch = (0, functions_1.buildPatch)(existing, merged);
    if (Object.keys(patch).length === 0)
        return existing;
    /* 4. split */
    const scalarPatch = {};
    const jsonbMerge = {};
    for (const [col, val] of Object.entries(patch)) {
        if (JSONB_COLUMNS.has(col)) {
            jsonbMerge[col] = val;
        }
        else {
            scalarPatch[col] = val;
        }
    }
    scalarPatch.updatedAt = new Date();
    /* 5. transaction (same body as before) */
    await client_1.db.transaction(async (tx) => {
        if (Object.keys(scalarPatch).length) {
            await tx.update(userProfile_1.userProfiles).set(scalarPatch).where((0, drizzle_orm_1.eq)(userProfile_1.userProfiles.userId, userId));
        }
        if (Object.keys(jsonbMerge).length) {
            const jsonbSet = {};
            for (const [col, val] of Object.entries(jsonbMerge)) {
                jsonbSet[col] =
                    val === null || Array.isArray(val) || typeof val !== 'object'
                        ? val
                        : (0, drizzle_orm_1.sql) `${userProfile_1.userProfiles[col]} || ${JSON.stringify(val)}::jsonb`;
            }
            await tx.update(userProfile_1.userProfiles).set(jsonbSet).where((0, drizzle_orm_1.eq)(userProfile_1.userProfiles.userId, userId));
        }
        /* sync canonical cols */
        const [after] = await tx
            .select()
            .from(userProfile_1.userProfiles)
            .where((0, drizzle_orm_1.eq)(userProfile_1.userProfiles.userId, userId))
            .limit(1);
        const userPayload = {};
        if (incomingCInfo.contactEmail) {
            userPayload.email = after.companyInfo.contactEmail;
            userPayload.emailVerified = after.companyInfo.POCEmailVerified;
        }
        if (incomingCInfo.contactNumber) {
            userPayload.phone = after.companyInfo.contactNumber;
            userPayload.phoneVerified = after.companyInfo.POCPhoneVerified;
        }
        if (Object.keys(userPayload).length) {
            await tx.update(users_1.users).set(userPayload).where((0, drizzle_orm_1.eq)(users_1.users.id, userId));
        }
    });
    /* 6. return fresh row */
    const [updated] = await client_1.db
        .select()
        .from(userProfile_1.userProfiles)
        .where((0, drizzle_orm_1.eq)(userProfile_1.userProfiles.userId, userId))
        .limit(1);
    return updated;
};
exports.updateUserProfileService = updateUserProfileService;
/**
 * Send a verification OTP to either the existing or newly‑updated e‑mail.
 * Rejects if `updatedEmail` is already taken by another profile.
 */
const requestProfileEmailVerificationOTP = async (userId, updatedEmail) => {
    /* 1️⃣ Fetch profile */
    const [profile] = await client_1.db
        .select()
        .from(userProfile_1.userProfiles)
        .where((0, drizzle_orm_1.eq)(userProfile_1.userProfiles.userId, userId))
        .limit(1);
    if (!profile)
        throw new classes_1.HttpError(404, 'Profile not found');
    const currentEmail = profile.companyInfo.contactEmail;
    const isNewEmail = updatedEmail && updatedEmail !== currentEmail;
    /* 2️⃣ Uniqueness check only if it's a new address */
    if (isNewEmail) {
        const [conflict] = await client_1.db
            .select({ id: userProfile_1.userProfiles.userId })
            .from(userProfile_1.userProfiles)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.sql) `${userProfile_1.userProfiles.companyInfo}->>'contactEmail' = ${updatedEmail}`, (0, drizzle_orm_1.ne)(userProfile_1.userProfiles.userId, userId)))
            .limit(1);
        if (conflict)
            throw new classes_1.HttpError(409, 'E‑mail already in use');
    }
    /* 3️⃣ Generate OTP + expiry */
    const otp = (0, functions_1.generate8DigitsVerificationToken)();
    const expiresAt = new Date(Date.now() + constants_1.OTP_EXPIRY);
    const target = isNewEmail ? updatedEmail : currentEmail;
    /* 4️⃣ Persist OTP (+ pendingEmail only if new) */
    await client_1.db
        .update(users_1.users)
        .set({
        emailVerificationToken: otp,
        emailVerificationTokenExpiresAt: expiresAt,
        pendingEmail: isNewEmail ? updatedEmail : null, // ← key line
    })
        .where((0, drizzle_orm_1.eq)(users_1.users.id, userId));
    /* 5️⃣ Send the code */
    await (0, emailSender_1.sendVerificationEmail)(target, otp);
};
exports.requestProfileEmailVerificationOTP = requestProfileEmailVerificationOTP;
const verifyProfileEmailOTP = async (userId, email, otp) => {
    /* 1️⃣ Load row with OTP fields */
    const [user] = await client_1.db.select().from(users_1.users).where((0, drizzle_orm_1.eq)(users_1.users.id, userId)).limit(1);
    if (!user)
        throw new classes_1.HttpError(404, 'Profile not found');
    if (!user.emailVerificationToken ||
        !user.emailVerificationTokenExpiresAt ||
        user.emailVerificationTokenExpiresAt < new Date()) {
        throw new classes_1.HttpError(400, 'OTP expired or not requested');
    }
    if (otp !== user.emailVerificationToken) {
        throw new classes_1.HttpError(401, 'Invalid OTP');
    }
    /* 2️⃣ Decide final e‑mail */
    const finalEmail = email;
    const companyInfoWithEmail = (0, drizzle_orm_1.sql) `jsonb_set(
  ${userProfile_1.userProfiles.companyInfo},
  '{contactEmail}',
  ${JSON.stringify(finalEmail)}::jsonb,
  true
)`;
    const verifiedCompanyInfo = (0, drizzle_orm_1.sql) `jsonb_set(
  ${companyInfoWithEmail},
  '{POCEmailVerified}',
  'true'::jsonb,
  true
)`;
    /* 4️⃣ Transaction: update BOTH tables atomically */
    await client_1.db.transaction(async (tx) => {
        /* user_profiles */
        await tx
            .update(userProfile_1.userProfiles)
            .set({
            companyInfo: verifiedCompanyInfo,
        })
            .where((0, drizzle_orm_1.eq)(userProfile_1.userProfiles.userId, userId));
        /* users */
        await tx
            .update(users_1.users)
            .set({
            email: finalEmail,
            pendingEmail: null,
            emailVerificationToken: null,
            emailVerificationTokenExpiresAt: null,
            emailVerified: true,
        })
            .where((0, drizzle_orm_1.eq)(users_1.users.id, userId));
    });
    return finalEmail;
};
exports.verifyProfileEmailOTP = verifyProfileEmailOTP;
const verifyProfilePhoneOTP = async (userId, phone, otp) => {
    // 1️⃣ Load user
    const [user] = await client_1.db.select().from(users_1.users).where((0, drizzle_orm_1.eq)(users_1.users.id, userId)).limit(1);
    if (!user)
        throw new classes_1.HttpError(404, 'Profile not found');
    if (!user.otp || !user.otpExpiresAt || user.otpExpiresAt < new Date()) {
        throw new classes_1.HttpError(400, 'OTP expired or not requested');
    }
    if (otp !== user.otp) {
        throw new classes_1.HttpError(401, 'Invalid OTP');
    }
    // 2️⃣ Final phone value
    const finalPhone = phone;
    const companyInfoWithPhone = (0, drizzle_orm_1.sql) `jsonb_set(
  ${userProfile_1.userProfiles.companyInfo},
  '{contactPhone}',
  ${JSON.stringify(phone)}::jsonb,
  true
)`;
    const verifiedCompanyInfo = (0, drizzle_orm_1.sql) `jsonb_set(
  ${companyInfoWithPhone},
  '{POCPhoneVerified}',
  'true'::jsonb,
  true
)`;
    // 3️⃣ Transaction to update both tables atomically
    await client_1.db.transaction(async (tx) => {
        // Update user_profiles
        await tx
            .update(userProfile_1.userProfiles)
            .set({
            companyInfo: verifiedCompanyInfo,
        })
            .where((0, drizzle_orm_1.eq)(userProfile_1.userProfiles.userId, userId));
        // Update users
        await tx
            .update(users_1.users)
            .set({
            phone: finalPhone,
            pendingPhone: null,
            otp: null,
            otpExpiresAt: null,
            phoneVerified: true,
        })
            .where((0, drizzle_orm_1.eq)(users_1.users.id, userId));
    });
    return finalPhone;
};
exports.verifyProfilePhoneOTP = verifyProfilePhoneOTP;
/**
 * Send / resend an OTP for verifying (or updating) the user’s phone number.
 * ‑ If `updatedPhone` is provided and differs from the current one, the number
 *   is treated as a *change request* and stored in `pendingPhone` until verified.
 * ‑ Otherwise we’re just re‑verifying the existing phone on file.
 */
const requestProfilePhoneVerificationOTP = async (userId, updatedPhone) => {
    /* ───────────────── 1️⃣  Fetch current profile ───────────────── */
    const [profile] = await client_1.db
        .select()
        .from(userProfile_1.userProfiles)
        .where((0, drizzle_orm_1.eq)(userProfile_1.userProfiles.userId, userId))
        .limit(1);
    if (!profile)
        throw new classes_1.HttpError(404, 'Profile not found');
    const currentPhone = profile.companyInfo.contactNumber; // e.g. “9876543210”
    const rawPhone = updatedPhone ?? currentPhone;
    if (!rawPhone)
        throw new classes_1.HttpError(400, 'Phone number is required');
    /* ───────────────── 2️⃣  Validate + normalise ───────────────── */
    let parsed; // { e164: “+919876543210”, national: “9876543210”, country: “IN” }
    try {
        parsed = (0, functions_1.parsePhone)(rawPhone);
    }
    catch {
        throw new classes_1.HttpError(400, 'Invalid phone number format');
    }
    const isNewPhone = updatedPhone && parsed.national !== currentPhone;
    /* ───────────────── 3️⃣  Uniqueness check (only if new) ─────── */
    if (isNewPhone) {
        const [conflict] = await client_1.db
            .select({ id: userProfile_1.userProfiles.userId })
            .from(userProfile_1.userProfiles)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.sql) `${userProfile_1.userProfiles.companyInfo}->>'contactNumber' = ${parsed.national}`, (0, drizzle_orm_1.ne)(userProfile_1.userProfiles.userId, userId)))
            .limit(1);
        if (conflict)
            throw new classes_1.HttpError(409, 'Phone number already in use');
    }
    /* ───────────────── 4️⃣  Generate OTP + expiry ───────────────── */
    const otp = (0, authController_1.generateOtp)(); // 6‑digit numeric string
    const expiresAt = new Date(Date.now() + constants_1.OTP_EXPIRY);
    /* ───────────────── 5️⃣  Persist token on user row ───────────── */
    await client_1.db
        .update(users_1.users)
        .set({
        otp: otp,
        otpExpiresAt: expiresAt,
        pendingPhone: isNewPhone ? parsed.national : null, // ← only set if changing #
    })
        .where((0, drizzle_orm_1.eq)(users_1.users.id, userId));
    /* ───────────────── 6️⃣  Send OTP via email (instead of SMS) ────── */
    const [user] = await client_1.db.select().from(users_1.users).where((0, drizzle_orm_1.eq)(users_1.users.id, userId)).limit(1);
    if (user?.email) {
        await (0, emailSender_1.sendVerificationEmail)(user.email, otp);
    }
};
exports.requestProfilePhoneVerificationOTP = requestProfilePhoneVerificationOTP;
async function changePassword(userId, newPassword, currentPassword) {
    const [user] = await client_1.db.select().from(users_1.users).where((0, drizzle_orm_1.eq)(users_1.users.id, userId));
    if (!user)
        throw new Error('User not found');
    const hasExistingPassword = !!user.passwordHash;
    // If a password exists, we must validate the current password
    if (hasExistingPassword) {
        if (!currentPassword)
            throw new Error('Current password is required');
        const ok = await (0, functions_1.compare)(currentPassword, user.passwordHash);
        if (!ok)
            throw new Error('Current password is incorrect');
        if (currentPassword === newPassword)
            throw new Error('New password must differ from current password');
    }
    // Strength check (8+ chars, upper, lower, number)
    if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[A-Za-z\d]{8,}/.test(newPassword)) {
        throw new Error('Password must be 8+ characters and include upper, lower, and a number');
    }
    const passwordHash = await (0, functions_1.hash)(newPassword);
    await client_1.db.update(users_1.users).set({ passwordHash }).where((0, drizzle_orm_1.eq)(users_1.users.id, userId));
}

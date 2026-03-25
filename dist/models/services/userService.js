"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteUser = exports.resetUserPassword = exports.updateUserApprovalStatus = exports.saveRefreshToken = exports.handleEmailVerificationRequest = exports.verifyGoogleToken = exports.updateUserChannelIntegration = exports.clearUserEmailToken = exports.clearUserOtpByEmail = exports.clearUserOtp = exports.markPhoneVerified = exports.markEmailVerified = exports.updateUserOtpByEmail = exports.updateUserOtp = exports.updateUser = exports.updateUserVerificationToken = exports.updateUserByEmail = exports.createUser = exports.findUserByEmail = exports.findUserById = exports.findUserByPhone = void 0;
exports.upsertStore = upsertStore;
exports.createUserWithWallet = createUserWithWallet;
exports.getAllUsersWithRoleUser = getAllUsersWithRoleUser;
const client_1 = require("../client");
const platform_1 = require("../schema/platform");
const users_1 = require("../schema/users");
// utils/verifyGoogleToken.ts
const bcrypt = __importStar(require("bcryptjs"));
const drizzle_orm_1 = require("drizzle-orm");
const google_auth_library_1 = require("google-auth-library");
const schema = __importStar(require("../../schema/schema"));
const constants_1 = require("../../utils/constants");
const emailSender_1 = require("../../utils/emailSender");
const functions_1 = require("../../utils/functions");
const stores_1 = require("../schema/stores");
const dotenv = __importStar(require("dotenv"));
const path_1 = __importDefault(require("path"));
// Load correct .env based on NODE_ENV
const env = process.env.NODE_ENV || 'development';
dotenv.config({ path: path_1.default.resolve(__dirname, `../../.env.${env}`) });
const exposeAuthCodes = process.env.EXPOSE_AUTH_CODES !== 'false';
const EMPTY_COMPANY = {
    businessName: '',
    brandName: '',
    city: '',
    companyContactNumber: '',
    pincode: '',
    state: '',
    profilePicture: '',
    POCEmailVerified: false,
    POCPhoneVerified: false,
    companyAddress: '',
    contactPerson: '',
    contactNumber: '',
    contactEmail: '',
    companyEmail: '',
    companyLogoUrl: '',
    website: '',
};
const DEFAULT_PROFILE = {
    onboardingStep: 0,
    monthlyOrderCount: '0-100',
    companyInfo: EMPTY_COMPANY,
    domesticKyc: { status: 'pending', updatedAt: null },
    bankDetails: null,
    gstDetails: null,
    businessType: [], // b2b / b2c / d2c chosen later
    approved: false,
    onboardingComplete: false,
    salesChannels: {},
    profileComplete: false,
};
// ✅ Get user by phone
const findUserByPhone = async (phone) => {
    try {
        const user = await client_1.db.query.users.findFirst({
            where: (users, { eq }) => eq(users.phone, phone),
        });
        return user;
    }
    catch (error) {
        console.error('Database query error:', error);
        return null;
    }
};
exports.findUserByPhone = findUserByPhone;
const findUserById = async (id) => {
    const result = await client_1.db
        .select({
        user: users_1.users,
        profile: schema.userProfiles,
        userPlan: schema.userPlans, // include userPlans
    })
        .from(users_1.users)
        .leftJoin(schema.userProfiles, (0, drizzle_orm_1.eq)(schema.userProfiles.userId, users_1.users.id))
        .leftJoin(schema.userPlans, (0, drizzle_orm_1.eq)(schema.userPlans.userId, users_1.users.id)) // join userPlans to get current plan
        .where((0, drizzle_orm_1.eq)(users_1.users.id, id))
        .limit(1);
    if (!result[0])
        return null;
    // Merge `users`, `userProfile`, and current plan
    return {
        ...result[0].user,
        ...result[0].profile,
        currentPlanId: result[0].userPlan?.plan_id || null, // current assigned plan
    };
};
exports.findUserById = findUserById;
const findUserByEmail = async (email, tx = client_1.db) => {
    return await tx.query.users.findFirst({
        where: (users, { eq }) => eq(users.email, email),
    });
};
exports.findUserByEmail = findUserByEmail;
const createUser = async (data, tx = client_1.db) => {
    const [user] = await tx.insert(users_1.users).values(data).returning();
    return user;
};
exports.createUser = createUser;
const updateUserByEmail = async (email, updateData, tx = client_1.db) => {
    const [updatedUser] = await tx
        .update(users_1.users)
        .set(updateData)
        .where((0, drizzle_orm_1.eq)(users_1.users.email, email))
        .returning();
    return updatedUser;
};
exports.updateUserByEmail = updateUserByEmail;
const updateUserVerificationToken = async (email, token, expiresAt, tx = client_1.db) => {
    const [updatedUser] = await tx
        .update(users_1.users)
        .set({
        emailVerificationToken: token,
        emailVerificationTokenExpiresAt: expiresAt,
    })
        .where((0, drizzle_orm_1.eq)(users_1.users.email, email))
        .returning();
    return updatedUser;
};
exports.updateUserVerificationToken = updateUserVerificationToken;
// ✅ Update user by phone
const updateUser = async (userId, data) => {
    const [user] = await client_1.db.update(users_1.users).set(data).where((0, drizzle_orm_1.eq)(users_1.users.id, userId)).returning();
    return user;
};
exports.updateUser = updateUser;
// updateUserOtp.ts
const updateUserOtp = async (phone, otp, otpExpiresAt) => {
    return await client_1.db.update(users_1.users).set({ otp, otpExpiresAt }).where((0, drizzle_orm_1.eq)(users_1.users.phone, phone));
};
exports.updateUserOtp = updateUserOtp;
// updateUserOtpByEmail.ts - for email-based OTP
const updateUserOtpByEmail = async (email, otp, otpExpiresAt) => {
    const normalized = email.trim().toLowerCase();
    return await client_1.db.update(users_1.users).set({ otp, otpExpiresAt }).where((0, drizzle_orm_1.eq)(users_1.users.email, normalized));
};
exports.updateUserOtpByEmail = updateUserOtpByEmail;
/**
 * Mark a user's e‑mail as verified in both `users` and `user_profiles`.
 */
const markEmailVerified = async (email, tx = client_1.db) => {
    const normalized = email.trim().toLowerCase();
    return tx.transaction(async (tx) => {
        /* 1️⃣  Update `users.emailVerified` and grab the userId */
        const [updatedUser] = await tx
            .update(users_1.users)
            .set({ emailVerified: true })
            .where((0, drizzle_orm_1.eq)(users_1.users.email, normalized))
            .returning({ id: users_1.users.id });
        if (!updatedUser) {
            console.log('No user found for email:', normalized);
            return { usersUpdated: 0, profilesUpdated: 0 };
        }
        /* 2️⃣  Set POCEmailVerified = true inside companyInfo JSONB */
        const result = await tx
            .update(schema.userProfiles)
            .set({
            companyInfo: (0, drizzle_orm_1.sql) `
          jsonb_set(
            "companyInfo",
            '{POCEmailVerified}',
            'true',
            true
          )
        `,
        })
            .where((0, drizzle_orm_1.eq)(schema.userProfiles.userId, updatedUser.id));
        return { usersUpdated: 1, profilesUpdated: result.rowCount };
    });
};
exports.markEmailVerified = markEmailVerified;
const markPhoneVerified = async (phone) => {
    // strip non‑digits so we always compare the raw 10‑digit number
    const sanitized = phone.replace(/\D/g, '');
    return client_1.db.transaction(async (tx) => {
        /* 1️⃣  Update `users.phoneVerified` and grab the userId */
        const [updatedUser] = await tx
            .update(users_1.users)
            .set({ phoneVerified: true })
            .where((0, drizzle_orm_1.eq)(users_1.users.phone, sanitized))
            .returning({ id: users_1.users.id });
        if (!updatedUser) {
            console.log('No user found for phone:', sanitized);
            return { usersUpdated: 0, profilesUpdated: 0 };
        }
        /* 2️⃣  Update nested JSONB key in `user_profiles` */
        const result = await tx
            .update(schema.userProfiles)
            .set({
            companyInfo: (0, drizzle_orm_1.sql) `
          jsonb_set(
            "companyInfo",
            '{POCPhoneVerified}',
            'true',
            true
          )
        `,
        })
            .where((0, drizzle_orm_1.eq)(schema.userProfiles.userId, updatedUser.id));
        return { usersUpdated: 1, profilesUpdated: result.rowCount };
    });
};
exports.markPhoneVerified = markPhoneVerified;
// clearUserOtp.ts
const clearUserOtp = async (phone) => {
    return await client_1.db.update(users_1.users).set({ otp: null, otpExpiresAt: null }).where((0, drizzle_orm_1.eq)(users_1.users.phone, phone));
};
exports.clearUserOtp = clearUserOtp;
// clearUserOtpByEmail.ts - for email-based OTP
const clearUserOtpByEmail = async (email) => {
    const normalized = email.trim().toLowerCase();
    return await client_1.db
        .update(users_1.users)
        .set({ otp: null, otpExpiresAt: null })
        .where((0, drizzle_orm_1.eq)(users_1.users.email, normalized));
};
exports.clearUserOtpByEmail = clearUserOtpByEmail;
const clearUserEmailToken = async (email) => {
    await client_1.db
        .update(users_1.users)
        .set({
        emailVerificationToken: null,
        emailVerificationTokenExpiresAt: null,
    })
        .where((0, drizzle_orm_1.eq)(users_1.users.email, email));
};
exports.clearUserEmailToken = clearUserEmailToken;
const updateUserChannelIntegration = async (userId, platformId, tx = client_1.db) => {
    /* 1️⃣  Look up the platform slug */
    const [platform] = await tx
        .select({ slug: platform_1.platforms.slug })
        .from(platform_1.platforms)
        .where((0, drizzle_orm_1.eq)(platform_1.platforms.id, platformId));
    if (!platform?.slug) {
        throw new Error('Invalid platformId: slug not found');
    }
    /* 2️⃣  Add slug → true inside salesChannels JSONB */
    return tx
        .update(schema.userProfiles)
        .set({
        salesChannels: (0, drizzle_orm_1.sql) `
        jsonb_set(
          coalesce(${schema.userProfiles.salesChannels}, '{}'::jsonb),
          '{${drizzle_orm_1.sql.raw(platform.slug)}}',
          'true'::jsonb,
          true
        )
      `,
    })
        .where((0, drizzle_orm_1.eq)(schema.userProfiles.userId, userId)) // 🔑 correct column
        .returning();
};
exports.updateUserChannelIntegration = updateUserChannelIntegration;
async function upsertStore(shopData, platformId, userId, tx = client_1.db) {
    const { id, name, domain, timezone, country, currency, email, phone, zip, ...rest } = shopData;
    const metadata = {
        email,
        phone,
        zip,
        ...rest,
    };
    const existing = await tx.select().from(stores_1.stores).where((0, drizzle_orm_1.eq)(stores_1.stores.id, id)).limit(1);
    if (existing.length > 0) {
        await tx
            .update(stores_1.stores)
            .set({
            name,
            domain,
            timezone,
            country,
            currency,
            apiKey: shopData.apiKey,
            adminApiAccessToken: shopData.adminApiAccessToken,
            metadata,
            updatedAt: new Date(),
        })
            .where((0, drizzle_orm_1.eq)(stores_1.stores.id, id));
    }
    else {
        await tx.insert(stores_1.stores).values({
            id,
            name,
            userId,
            domain,
            platformId,
            apiKey: shopData.apiKey,
            adminApiAccessToken: shopData.adminApiAccessToken,
            timezone,
            country,
            currency,
            metadata,
            createdAt: new Date(),
            updatedAt: new Date(),
        });
    }
}
const client = new google_auth_library_1.OAuth2Client(process.env.GOOGLE_CLIENT_ID);
const verifyGoogleToken = async (idToken) => {
    const ticket = await client.verifyIdToken({
        idToken,
        audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    if (!payload || !payload.email) {
        throw new Error('Invalid Google token');
    }
    return {
        email: payload.email,
        googleId: payload.sub,
        name: payload.name,
        picture: payload.picture,
    };
};
exports.verifyGoogleToken = verifyGoogleToken;
/**
 * Unified entry‑point for both sign‑up and sign‑in.
 *
 * Behaviour matrix – all the corner‑cases in one place:
 * ┌─────────────────────────┬──────────────┬──────────┬───────────────┐
 * │ Email in DB?            │ Verified?    │ googleId │ Result        │
 * ├─────────────────────────┼──────────────┼──────────┼───────────────┤
 * │ no                      │ n/a          │ yes      │ create account│
 * │ no                      │ n/a          │ no       │ create + email│
 * │ yes                     │ NO           │ yes      │ mark verified │
 * │ yes                     │ NO           │ no       │ refresh token │
 * │ yes                     │ YES          │ yes      │ login / link  │
 * │ yes                     │ YES          │ no       │ login / set-pw│
 * └─────────────────────────┴──────────────┴──────────┴───────────────┘
 */
const handleEmailVerificationRequest = async (email, password, googleId) => {
    return await client_1.db.transaction(async (tx) => {
        const normalizedEmail = email.trim().toLowerCase();
        const token = (0, functions_1.generate8DigitsVerificationToken)();
        const expiresAt = new Date(Date.now() + constants_1.OTP_EXPIRY);
        let shouldSendEmail = false;
        const user = await (0, exports.findUserByEmail)(normalizedEmail, tx);
        if (user) {
            if (user.emailVerified) {
                if (googleId) {
                    if (user.googleId && user.googleId !== googleId) {
                        return {
                            status: 400,
                            data: {
                                error: 'A different Google account is linked to this email.',
                            },
                        };
                    }
                    if (!user.googleId) {
                        await (0, exports.updateUserByEmail)(normalizedEmail, { googleId }, tx);
                    }
                    return {
                        status: 200,
                        data: { message: 'Authenticated with Google', user },
                    };
                }
                if (!password) {
                    return { status: 400, data: { error: 'Password is required.' } };
                }
                if (!user.passwordHash) {
                    const hashed = await bcrypt.hash(password, 10);
                    await (0, exports.updateUserByEmail)(normalizedEmail, { passwordHash: hashed }, tx);
                    return {
                        status: 200,
                        data: {
                            message: 'Password set successfully. You can now log in.',
                            user,
                        },
                    };
                }
                const valid = await bcrypt.compare(password, user.passwordHash);
                if (!valid) {
                    return { status: 400, data: { error: 'Incorrect password.' } };
                }
                return {
                    status: 200,
                    data: { message: '', user },
                };
            }
            // Email exists but NOT verified
            if (googleId) {
                await (0, exports.updateUserByEmail)(normalizedEmail, {
                    googleId,
                    emailVerified: true,
                    emailVerificationToken: null,
                    emailVerificationTokenExpiresAt: null,
                }, tx);
                return {
                    status: 200,
                    data: { message: 'Email verified via Google Sign‑In', user },
                };
            }
            if (!password) {
                return { status: 400, data: { error: 'Password is required.' } };
            }
            if (!user.passwordHash) {
                const hashed = await bcrypt.hash(password, 10);
                await (0, exports.updateUserByEmail)(normalizedEmail, { passwordHash: hashed }, tx);
            }
            else {
                const valid = await bcrypt.compare(password, user.passwordHash);
                if (!valid) {
                    return { status: 400, data: { error: 'Incorrect password.' } };
                }
            }
            await (0, exports.updateUserVerificationToken)(normalizedEmail, token, expiresAt, tx);
            shouldSendEmail = true;
            if (shouldSendEmail && !exposeAuthCodes) {
                (0, emailSender_1.sendVerificationEmail)(normalizedEmail, token).catch(console.error);
            }
            return {
                status: 200,
                data: {
                    message: exposeAuthCodes
                        ? 'Verification code generated'
                        : 'Verification email sent',
                    ...(exposeAuthCodes ? { verificationToken: token } : {}),
                },
            };
        }
        // BRAND NEW USER
        if (googleId) {
            await createUserWithWallet({
                email: normalizedEmail,
                phone: '',
                passwordHash: password ? await bcrypt.hash(password, 10) : null,
                googleId,
                emailVerified: true,
                onboardingStep: 0,
            });
            return { status: 201, data: { message: 'Account created via Google' } };
        }
        if (!password) {
            return { status: 400, data: { error: 'Password is required.' } };
        }
        await createUserWithWallet({
            email: normalizedEmail,
            phone: '',
            passwordHash: await bcrypt.hash(password, 10),
            googleId: null,
            emailVerificationToken: token,
            emailVerificationTokenExpiresAt: expiresAt,
            emailVerified: false,
            onboardingStep: 0,
        });
        shouldSendEmail = true;
        if (shouldSendEmail && !exposeAuthCodes) {
            (0, emailSender_1.sendVerificationEmail)(normalizedEmail, token).catch(console.error);
        }
        return {
            status: 201,
            data: {
                message: exposeAuthCodes ? 'Verification code generated' : 'Verification email sent',
                ...(exposeAuthCodes ? { verificationToken: token } : {}),
            },
        };
    });
};
exports.handleEmailVerificationRequest = handleEmailVerificationRequest;
const saveRefreshToken = async (userId, token, ttlMs, previousToken = null) => {
    const isClearing = token === null;
    const expiresAt = isClearing ? (0, drizzle_orm_1.sql) `NULL` : new Date(Date.now() + ttlMs);
    const previousExpiresAt = previousToken ? new Date(Date.now() + ttlMs) : (0, drizzle_orm_1.sql) `NULL`;
    return client_1.db
        .update(users_1.users)
        .set({
        refreshToken: isClearing ? (0, drizzle_orm_1.sql) `NULL` : token,
        refreshTokenExpiresAt: expiresAt,
        previousRefreshToken: isClearing ? (0, drizzle_orm_1.sql) `NULL` : previousToken,
        previousRefreshTokenExpiresAt: previousToken ? previousExpiresAt : (0, drizzle_orm_1.sql) `NULL`,
    })
        .where((0, drizzle_orm_1.eq)(users_1.users.id, userId))
        .returning({ id: users_1.users.id });
};
exports.saveRefreshToken = saveRefreshToken;
async function createUserWithWallet(data, txn = client_1.db) {
    return txn?.transaction(async (tx) => {
        // 1) insert user
        const [user] = await tx
            .insert(users_1.users)
            .values(data)
            .returning();
        // 2) insert wallet
        await tx.insert(schema.wallets).values({
            userId: user.id,
            balance: (0, drizzle_orm_1.sql) `0`, // numeric requires string or SQL literal
        });
        // 3) assign default plan (Basic)
        const [basicPlan] = await tx
            .select()
            .from(schema.plans)
            .where((0, drizzle_orm_1.eq)(schema.plans.name, 'Basic'))
            .limit(1);
        if (basicPlan) {
            await tx.insert(schema.userPlans).values({
                userId: user.id,
                plan_id: basicPlan.id,
                is_active: true,
            });
        }
        else {
            console.warn(`⚠️ Basic plan not found for user ${user.id}. Plan assignment skipped.`);
        }
        // 4) create default billing preferences
        await tx.insert(schema.billingPreferences).values({
            userId: user.id,
            frequency: 'monthly',
            autoGenerate: true,
            customFrequencyDays: null,
        });
        // 5) create default label preferences
        await tx.insert(schema.labelPreferences).values({
            user_id: user.id,
            printer_type: 'thermal',
            char_limit: 25,
            max_items: 3,
            powered_by: 'DelExpress',
            order_info: {
                orderId: true,
                invoiceNumber: true,
                orderDate: false,
                invoiceDate: false,
                orderBarcode: true,
                invoiceBarcode: true,
                rtoRoutingCode: true,
                declaredValue: true,
                cod: true,
                awb: true,
                terms: true,
            },
            shipper_info: {
                shipperPhone: true,
                gstin: true,
                shipperAddress: true,
                rtoAddress: false,
                sellerBrandName: true,
                brandLogo: true,
            },
            product_info: {
                itemName: true,
                productCost: true,
                productQuantity: true,
                skuCode: false,
                dimension: false,
                deadWeight: false,
                otherCharges: true,
            },
            brand_logo: null,
        });
        // 6) create default invoice preferences
        await tx.insert(schema.invoicePreferences).values({
            userId: user.id,
            prefix: 'INV',
            suffix: '',
            template: 'classic',
            includeLogo: true,
            includeSignature: true,
            logoFile: null,
            signatureFile: null,
        });
        const companyInfo = {
            ...DEFAULT_PROFILE.companyInfo, // keeps required fields
            contactEmail: data.email ?? '',
            contactNumber: data.phone ?? '',
            profilePicture: data?.profilePicture,
        };
        await tx.insert(schema.userProfiles).values({
            ...DEFAULT_PROFILE, // << first spread defaults
            userId: user.id,
            companyInfo, // << then override / extend
        });
        return user;
    });
}
async function getAllUsersWithRoleUser({ page, perPage, search = '', sortBy = 'createdAt', sortOrder = 'desc', businessTypes = [], onboardingComplete, approved, }) {
    const offset = (page - 1) * perPage;
    const filters = [(0, drizzle_orm_1.eq)(users_1.users.role, 'customer')];
    // Search filter across multiple fields (null-safe with coalesce)
    if (search.trim()) {
        const pattern = `%${search.trim()}%`;
        filters.push((0, drizzle_orm_1.or)((0, drizzle_orm_1.ilike)((0, drizzle_orm_1.sql) `coalesce(${schema.userProfiles.companyInfo} ->> 'brandName', '')`, pattern), // Brand name
        (0, drizzle_orm_1.ilike)((0, drizzle_orm_1.sql) `coalesce(${schema.userProfiles.companyInfo} ->> 'contactPerson', '')`, pattern), (0, drizzle_orm_1.ilike)((0, drizzle_orm_1.sql) `coalesce(${schema.userProfiles.companyInfo} ->> 'contactEmail', '')`, pattern), (0, drizzle_orm_1.ilike)((0, drizzle_orm_1.sql) `coalesce(${schema.userProfiles.companyInfo} ->> 'contactNumber', '')`, pattern), (0, drizzle_orm_1.ilike)((0, drizzle_orm_1.sql) `coalesce(${schema.userProfiles.companyInfo} ->> 'businessName', '')`, pattern)));
    }
    // Business type filter
    if (businessTypes.length > 0) {
        filters.push((0, drizzle_orm_1.sql) `EXISTS (
      SELECT 1 
      FROM jsonb_array_elements_text(${schema.userProfiles.businessType}) AS bt
      WHERE bt = ANY(ARRAY[${drizzle_orm_1.sql.join(businessTypes.map((b) => (0, drizzle_orm_1.sql) `${b}`), (0, drizzle_orm_1.sql) `,`)}]::text[])
    )`);
    }
    // Onboarding complete filter (example: step 4 is complete)
    if (onboardingComplete && typeof onboardingComplete === 'string') {
        if (onboardingComplete === 'true') {
            filters.push((0, drizzle_orm_1.eq)(schema.userProfiles.onboardingComplete, true));
        }
        else {
            filters.push((0, drizzle_orm_1.eq)(schema.userProfiles.onboardingComplete, false));
        }
    }
    if (approved && typeof approved === 'string') {
        if (approved === 'true') {
            filters.push((0, drizzle_orm_1.eq)(schema.userProfiles.approved, true));
        }
        else {
            filters.push((0, drizzle_orm_1.eq)(schema.userProfiles.approved, false));
        }
    }
    // Sort mapping
    const sortColumns = {
        createdAt: users_1.users.createdAt,
        email: users_1.users.email,
        role: users_1.users.role,
        companyName: (0, drizzle_orm_1.sql) `coalesce(${schema.userProfiles.companyInfo} ->> 'businessName', ${schema.userProfiles.companyInfo} ->> 'brandName', '')`,
        contactPerson: (0, drizzle_orm_1.sql) `${schema.userProfiles.companyInfo} ->> 'contactPerson'`,
    };
    const sortColumn = sortColumns[sortBy] ?? users_1.users.createdAt;
    // Query data
    const data = await client_1.db
        .select({
        id: users_1.users.id,
        email: users_1.users.email,
        role: users_1.users.role,
        createdAt: users_1.users.createdAt,
        companyName: (0, drizzle_orm_1.sql) `coalesce(${schema.userProfiles.companyInfo} ->> 'businessName', ${schema.userProfiles.companyInfo} ->> 'brandName', '')`,
        businessType: schema.userProfiles.businessType,
        approved: schema.userProfiles.approved,
        onboardingStep: schema.userProfiles.onboardingStep,
        contactPerson: (0, drizzle_orm_1.sql) `${schema.userProfiles.companyInfo} ->> 'contactPerson'`,
        contactNumber: (0, drizzle_orm_1.sql) `${schema.userProfiles.companyInfo} ->> 'contactNumber'`,
    })
        .from(users_1.users)
        .leftJoin(schema.userProfiles, (0, drizzle_orm_1.eq)(schema.userProfiles.userId, users_1.users.id))
        .where((0, drizzle_orm_1.and)(...filters))
        .orderBy(sortOrder === 'asc' ? (0, drizzle_orm_1.asc)(sortColumn) : (0, drizzle_orm_1.desc)(sortColumn))
        .limit(perPage)
        .offset(offset);
    // Count total
    const totalCountResult = await client_1.db
        .select({ count: (0, drizzle_orm_1.sql) `count(*)` })
        .from(users_1.users)
        .leftJoin(schema.userProfiles, (0, drizzle_orm_1.eq)(schema.userProfiles.userId, users_1.users.id))
        .where((0, drizzle_orm_1.and)(...filters));
    return {
        data,
        totalCount: Number(totalCountResult[0]?.count || 0),
    };
}
const updateUserApprovalStatus = async (userId, approved) => {
    const [updated] = await client_1.db
        .update(schema.userProfiles)
        .set({ approved })
        .where((0, drizzle_orm_1.eq)(schema.userProfiles.userId, userId))
        .returning();
    return updated;
};
exports.updateUserApprovalStatus = updateUserApprovalStatus;
function generateTempPassword(length = 12) {
    // Simpler, more user‑friendly temporary password:
    // - Alphanumeric only (no symbols)
    // - Avoid visually confusing characters (0/O, 1/l/I)
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
    let password = '';
    for (let i = 0; i < length; i++) {
        password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
}
const resetUserPassword = async (userId) => {
    const tempPassword = generateTempPassword();
    const hashedPassword = await bcrypt.hash(tempPassword, 10);
    await client_1.db.update(users_1.users).set({ passwordHash: hashedPassword }).where((0, drizzle_orm_1.eq)(users_1.users.id, userId));
    const [user] = await client_1.db.select().from(users_1.users).where((0, drizzle_orm_1.eq)(users_1.users.id, userId));
    if (user?.email) {
        await (0, emailSender_1.sendTempPasswordEmail)(user.email, tempPassword);
    }
    return tempPassword;
};
exports.resetUserPassword = resetUserPassword;
const deleteUser = async (userId) => {
    // Delete user and all related data in a transaction
    await client_1.db.transaction(async (tx) => {
        // Delete related data first (to avoid foreign key constraints)
        // Delete user profile
        await tx.delete(schema.userProfiles).where((0, drizzle_orm_1.eq)(schema.userProfiles.userId, userId));
        // Delete user wallet
        await tx.delete(schema.wallets).where((0, drizzle_orm_1.eq)(schema.wallets.userId, userId));
        // Delete pickup addresses (if any)
        const userAddresses = await tx
            .select({ id: schema.addresses.id })
            .from(schema.addresses)
            .where((0, drizzle_orm_1.eq)(schema.addresses.userId, userId));
        for (const address of userAddresses) {
            await tx
                .delete(schema.pickupAddresses)
                .where((0, drizzle_orm_1.eq)(schema.pickupAddresses.addressId, address.id));
        }
        // Delete addresses
        await tx.delete(schema.addresses).where((0, drizzle_orm_1.eq)(schema.addresses.userId, userId));
        // Delete bank accounts
        await tx.delete(schema.bankAccounts).where((0, drizzle_orm_1.eq)(schema.bankAccounts.userId, userId));
        // Delete KYC data
        await tx.delete(schema.kyc).where((0, drizzle_orm_1.eq)(schema.kyc.userId, userId));
        // Finally, delete the user
        await tx.delete(users_1.users).where((0, drizzle_orm_1.eq)(users_1.users.id, userId));
    });
    console.log(`✅ User ${userId} and all related data deleted successfully`);
};
exports.deleteUser = deleteUser;

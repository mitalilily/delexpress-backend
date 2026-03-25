"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.users = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
exports.users = (0, pg_core_1.pgTable)('users', {
    id: (0, pg_core_1.uuid)('id').defaultRandom().primaryKey(),
    /** Login identifiers */
    email: (0, pg_core_1.varchar)('email', { length: 100 }).unique(),
    phone: (0, pg_core_1.varchar)('phone', { length: 20 }).unique(),
    googleId: (0, pg_core_1.varchar)('googleId', { length: 64 }).unique(),
    pendingEmail: (0, pg_core_1.varchar)('pendingEmail', { length: 100 }),
    pendingPhone: (0, pg_core_1.varchar)('pendingPhone', { length: 20 }),
    /** Auth stuff */
    passwordHash: (0, pg_core_1.varchar)('passwordHash', { length: 200 }),
    refreshToken: (0, pg_core_1.varchar)('refreshToken', { length: 500 }),
    refreshTokenExpiresAt: (0, pg_core_1.timestamp)('refreshTokenExpiresAt'),
    previousRefreshToken: (0, pg_core_1.varchar)('previousRefreshToken', { length: 500 }),
    previousRefreshTokenExpiresAt: (0, pg_core_1.timestamp)('previousRefreshTokenExpiresAt'),
    /** Verification & role */
    emailVerified: (0, pg_core_1.boolean)('emailVerified').default(false),
    phoneVerified: (0, pg_core_1.boolean)('phoneVerified').default(false),
    accountVerified: (0, pg_core_1.boolean)('accountVerified').default(false),
    role: (0, pg_core_1.varchar)('role', { length: 20 }).default('customer'),
    /** Misc */
    profilePicture: (0, pg_core_1.varchar)('profilePicture', { length: 512 }),
    otp: (0, pg_core_1.varchar)('otp', { length: 6 }),
    otpExpiresAt: (0, pg_core_1.timestamp)('otpExpiresAt', { withTimezone: true }),
    emailVerificationToken: (0, pg_core_1.varchar)('emailVerificationToken', { length: 8 }),
    emailVerificationTokenExpiresAt: (0, pg_core_1.timestamp)('emailVerificationTokenExpiresAt', {
        withTimezone: true,
    }),
    /** House‑keeping */
    createdAt: (0, pg_core_1.timestamp)('createdAt', { withTimezone: true }).defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)('updatedAt', { withTimezone: true })
        .defaultNow()
        .$onUpdateFn(() => new Date()),
});

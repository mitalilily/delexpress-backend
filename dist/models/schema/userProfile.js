"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.userProfiles = void 0;
// db/schema/userProfiles.ts
const pg_core_1 = require("drizzle-orm/pg-core");
const users_1 = require("./users");
exports.userProfiles = (0, pg_core_1.pgTable)("user_profiles", {
    id: (0, pg_core_1.uuid)("id").primaryKey().defaultRandom(),
    /* link back to users 1‑to‑1 */
    userId: (0, pg_core_1.uuid)("userId")
        .references(() => users_1.users.id, { onDelete: "cascade" })
        .unique()
        .notNull(),
    onboardingStep: (0, pg_core_1.integer)("onboardingStep").notNull().default(1),
    monthlyOrderCount: (0, pg_core_1.varchar)("monthlyOrderCount").default("0-100"),
    salesChannels: (0, pg_core_1.jsonb)("salesChannels"),
    /* OBJECT BLOCKS (jsonb) --------------------------------------------- */
    companyInfo: (0, pg_core_1.jsonb)("companyInfo").$type().notNull(),
    domesticKyc: (0, pg_core_1.jsonb)("domesticKyc").$type().default(null),
    bankDetails: (0, pg_core_1.jsonb)("bankDetails").$type().default(null),
    gstDetails: (0, pg_core_1.jsonb)("gstDetails").$type().default(null),
    /* Business‑type mix & misc ------------------------------------------ */
    businessType: (0, pg_core_1.jsonb)("business_type")
        .$type()
        .notNull(),
    /* Approval flags ----------------------------------------------------- */
    approved: (0, pg_core_1.boolean)("approved").default(false).notNull(),
    rejectionReason: (0, pg_core_1.text)("rejectionReason"),
    onboardingComplete: (0, pg_core_1.boolean)("onboardingComplete").notNull().default(false),
    profileComplete: (0, pg_core_1.boolean)("profileComplete").default(false),
    approvedAt: (0, pg_core_1.timestamp)("approvedAt", { withTimezone: true }),
    /* Timestamps --------------------------------------------------------- */
    submittedAt: (0, pg_core_1.timestamp)("submittedAt", { withTimezone: true })
        .defaultNow()
        .notNull(),
    updatedAt: (0, pg_core_1.timestamp)("updatedAt", { withTimezone: true })
        .defaultNow()
        .$onUpdate(() => new Date()),
});

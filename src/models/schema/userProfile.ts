// db/schema/userProfiles.ts
import {
  pgTable,
  uuid,
  jsonb,
  boolean,
  timestamp,
  text,
  varchar,
  integer,
} from "drizzle-orm/pg-core";
import { users } from "./users";
import {
  CompanyInfo,
  DomesticKyc,
  BankDetails,
  GstDetails,
} from "../../types/profileBlocks.types";

export const userProfiles = pgTable("user_profiles", {
  id: uuid("id").primaryKey().defaultRandom(),

  /* link back to users 1‑to‑1 */
  userId: uuid("userId")
    .references(() => users.id, { onDelete: "cascade" })
    .unique()
    .notNull(),

  onboardingStep: integer("onboardingStep").notNull().default(1),
  monthlyOrderCount: varchar("monthlyOrderCount").default("0-100"),
  salesChannels: jsonb("salesChannels"),
  /* OBJECT BLOCKS (jsonb) --------------------------------------------- */
  companyInfo: jsonb("companyInfo").$type<CompanyInfo>().notNull(),

  domesticKyc: jsonb("domesticKyc").$type<DomesticKyc | null>().default(null),

  bankDetails: jsonb("bankDetails").$type<BankDetails | null>().default(null),

  gstDetails: jsonb("gstDetails").$type<GstDetails | null>().default(null),

  /* Business‑type mix & misc ------------------------------------------ */
  businessType: jsonb("business_type")
    .$type<("b2c" | "d2c" | "b2b")[]>()
    .notNull(),

  /* Approval flags ----------------------------------------------------- */
  approved: boolean("approved").default(false).notNull(),
  rejectionReason: text("rejectionReason"),
  onboardingComplete: boolean("onboardingComplete").notNull().default(false),
  profileComplete: boolean("profileComplete").default(false),
  approvedAt: timestamp("approvedAt", { withTimezone: true }),

  /* Timestamps --------------------------------------------------------- */
  submittedAt: timestamp("submittedAt", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updatedAt", { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date()),
});

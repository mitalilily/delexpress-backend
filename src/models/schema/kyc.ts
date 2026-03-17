import {
  pgTable,
  varchar,
  text,
  timestamp,
  pgEnum,
  uuid,
} from "drizzle-orm/pg-core";
import { users } from "./users";

export const kycStatusEnum = pgEnum("bank_account_status", [
  "pending",
  "verification_in_progress",
  "verified",
  "rejected",
]);

export const businessStructureEnum = pgEnum("business_structure_enum", [
  "individual",
  "company",
  "partnership_firm",
  "sole_proprietor",
]);

export const kycDocStatusEnum = pgEnum("kyc_doc_status", [
  "pending",
  "verified",
  "rejected",
]);

export const kyc = pgTable("kyc", {
  // ─── Primary Key ───────────────────────────────────────────────
  id: uuid("id").primaryKey().defaultRandom(),

  // ─── Relations ────────────────────────────────────────────────
  userId: uuid("userId")
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: "cascade" }),

  structure: businessStructureEnum("structure").default("company"),

  gstin: varchar("gstin", { length: 20 }),
  cin: varchar("cin", { length: 25 }),

  // ─── Files ────────────────────────────────────────────────────
  selfieUrl: text("selfieUrl"),
  panCardUrl: text("panCardUrl"),
  aadhaarUrl: text("aadhaarUrl"),
  cancelledChequeUrl: text("cancelledChequeUrl"),
  boardResolutionUrl: text("boardResolutionUrl"),
  partnershipDeedUrl: text("partnershipDeedUrl"),
  llpAgreementUrl: text("  llpAgreementUrl"),

  // ─── Field Status ─────────────────────────────────────────────
  selfieStatus: kycDocStatusEnum("selfieStatus").default("pending").notNull(),
  selfieRejectionReason: text("selfieRejectionReason"),

  panCardStatus: kycDocStatusEnum("panCardStatus").default("pending").notNull(),
  panCardRejectionReason: text("panCardRejectionReason"),

  aadhaarStatus: kycDocStatusEnum("aadhaarStatus").default("pending").notNull(),
  aadhaarRejectionReason: text("aadhaarRejectionReason"),

  cancelledChequeStatus: kycDocStatusEnum("cancelledChequeStatus")
    .default("pending")
    .notNull(),
  companyAddressProofStatus: kycDocStatusEnum("companyAddressProofStatus")
    .default("pending")
    .notNull(),
  cancelledChequeRejectionReason: text("cancelledChequeRejectionReason")
    .default("pending")
    .notNull(),

  boardResolutionStatus: kycDocStatusEnum("boardResolutionStatus")
    .default("pending")
    .notNull(),
  boardResolutionRejectionReason: text("boardResolutionRejectionReason"),

  partnershipDeedStatus: kycDocStatusEnum("partnershipDeedStatus")
    .default("pending")
    .notNull(),
  partnershipDeedRejectionReason: text("partnershipDeedRejectionReason"),

  aadhaarMime: varchar("aadhaarMime", { length: 100 }),
  panCardMime: varchar("panCardMime", { length: 100 }),
  selfieMime: varchar("selfieMime", { length: 100 }),
  cancelledChequeMime: varchar("cancelledChequeMime", { length: 100 }),
  boardResolutionMime: varchar("boardResolutionMime", { length: 100 }),
  partnershipDeedMime: varchar("partnershipDeedMime", { length: 100 }),
  llpAgreementMime: varchar("llpAgreementMime", { length: 100 }),
  companyAddressProofMime: varchar("companyAddressProofMime", { length: 100 }),

  cinStatus: kycDocStatusEnum("cinStatus").default("pending").notNull(),
  cinRejectionReason: text("cinRejectionReason"),

  llpAgreementStatus: kycDocStatusEnum("llpAgreementStatus")
    .default("pending")
    .notNull(),
  llpAgreementRejectionReason: text("llpAgreementRejectionReason"),
  // ─── KYC Global Status ─────────────────────────────────────────
  status: kycStatusEnum("status").default("pending").notNull(),

  companyType: varchar("companyType", { length: 50 }),

  businessPanUrl: text("businessPanUrl"),
  companyAddressProofUrl: text("companyAddressProofUrl"),
  gstCertificateUrl: text("gstCertificateUrl"),

  businessPanMime: varchar("businessPanMime", { length: 100 }),
  gstCertificateMime: varchar("gstCertificateMime", { length: 100 }),

  businessPanStatus: kycDocStatusEnum("businessPanStatus")
    .default("pending")
    .notNull(),
  gstCertificateStatus: kycDocStatusEnum("gstCertificateStatus")
    .default("pending")
    .notNull(),

  businessPanRejectionReason: text("businessPanRejectionReason"),
  gstCertificateRejectionReason: text("gstCertificateRejectionReason"),

  // 🔁 Legacy fallback reason (optional - you can delete this if not needed)
  rejectionReason: text("rejectionReason"),

  // ─── Timestamps ───────────────────────────────────────────────
  createdAt: timestamp("createdAt", { withTimezone: true }).defaultNow(),
  updatedAt: timestamp("updatedAt", { withTimezone: true }).defaultNow(),
});

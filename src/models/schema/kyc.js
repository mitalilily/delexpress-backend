"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.kyc = exports.kycDocStatusEnum = exports.businessStructureEnum = exports.kycStatusEnum = void 0;
var pg_core_1 = require("drizzle-orm/pg-core");
var users_1 = require("./users");
exports.kycStatusEnum = (0, pg_core_1.pgEnum)("bank_account_status", [
    "pending",
    "verification_in_progress",
    "verified",
    "rejected",
]);
exports.businessStructureEnum = (0, pg_core_1.pgEnum)("business_structure_enum", [
    "individual",
    "company",
    "partnership_firm",
    "sole_proprietor",
]);
exports.kycDocStatusEnum = (0, pg_core_1.pgEnum)("kyc_doc_status", [
    "pending",
    "verified",
    "rejected",
]);
exports.kyc = (0, pg_core_1.pgTable)("kyc", {
    // ─── Primary Key ───────────────────────────────────────────────
    id: (0, pg_core_1.uuid)("id").primaryKey().defaultRandom(),
    // ─── Relations ────────────────────────────────────────────────
    userId: (0, pg_core_1.uuid)("userId")
        .notNull()
        .unique()
        .references(function () { return users_1.users.id; }, { onDelete: "cascade" }),
    structure: (0, exports.businessStructureEnum)("structure").default("company"),
    gstin: (0, pg_core_1.varchar)("gstin", { length: 20 }),
    cin: (0, pg_core_1.varchar)("cin", { length: 25 }),
    // ─── Files ────────────────────────────────────────────────────
    selfieUrl: (0, pg_core_1.text)("selfieUrl"),
    panCardUrl: (0, pg_core_1.text)("panCardUrl"),
    aadhaarUrl: (0, pg_core_1.text)("aadhaarUrl"),
    cancelledChequeUrl: (0, pg_core_1.text)("cancelledChequeUrl"),
    boardResolutionUrl: (0, pg_core_1.text)("boardResolutionUrl"),
    partnershipDeedUrl: (0, pg_core_1.text)("partnershipDeedUrl"),
    llpAgreementUrl: (0, pg_core_1.text)("  llpAgreementUrl"),
    // ─── Field Status ─────────────────────────────────────────────
    selfieStatus: (0, exports.kycDocStatusEnum)("selfieStatus").default("pending").notNull(),
    selfieRejectionReason: (0, pg_core_1.text)("selfieRejectionReason"),
    panCardStatus: (0, exports.kycDocStatusEnum)("panCardStatus").default("pending").notNull(),
    panCardRejectionReason: (0, pg_core_1.text)("panCardRejectionReason"),
    aadhaarStatus: (0, exports.kycDocStatusEnum)("aadhaarStatus").default("pending").notNull(),
    aadhaarRejectionReason: (0, pg_core_1.text)("aadhaarRejectionReason"),
    cancelledChequeStatus: (0, exports.kycDocStatusEnum)("cancelledChequeStatus")
        .default("pending")
        .notNull(),
    companyAddressProofStatus: (0, exports.kycDocStatusEnum)("companyAddressProofStatus")
        .default("pending")
        .notNull(),
    cancelledChequeRejectionReason: (0, pg_core_1.text)("cancelledChequeRejectionReason")
        .default("pending")
        .notNull(),
    boardResolutionStatus: (0, exports.kycDocStatusEnum)("boardResolutionStatus")
        .default("pending")
        .notNull(),
    boardResolutionRejectionReason: (0, pg_core_1.text)("boardResolutionRejectionReason"),
    partnershipDeedStatus: (0, exports.kycDocStatusEnum)("partnershipDeedStatus")
        .default("pending")
        .notNull(),
    partnershipDeedRejectionReason: (0, pg_core_1.text)("partnershipDeedRejectionReason"),
    aadhaarMime: (0, pg_core_1.varchar)("aadhaarMime", { length: 100 }),
    panCardMime: (0, pg_core_1.varchar)("panCardMime", { length: 100 }),
    selfieMime: (0, pg_core_1.varchar)("selfieMime", { length: 100 }),
    cancelledChequeMime: (0, pg_core_1.varchar)("cancelledChequeMime", { length: 100 }),
    boardResolutionMime: (0, pg_core_1.varchar)("boardResolutionMime", { length: 100 }),
    partnershipDeedMime: (0, pg_core_1.varchar)("partnershipDeedMime", { length: 100 }),
    llpAgreementMime: (0, pg_core_1.varchar)("llpAgreementMime", { length: 100 }),
    companyAddressProofMime: (0, pg_core_1.varchar)("companyAddressProofMime", { length: 100 }),
    cinStatus: (0, exports.kycDocStatusEnum)("cinStatus").default("pending").notNull(),
    cinRejectionReason: (0, pg_core_1.text)("cinRejectionReason"),
    llpAgreementStatus: (0, exports.kycDocStatusEnum)("llpAgreementStatus")
        .default("pending")
        .notNull(),
    llpAgreementRejectionReason: (0, pg_core_1.text)("llpAgreementRejectionReason"),
    // ─── KYC Global Status ─────────────────────────────────────────
    status: (0, exports.kycStatusEnum)("status").default("pending").notNull(),
    companyType: (0, pg_core_1.varchar)("companyType", { length: 50 }),
    businessPanUrl: (0, pg_core_1.text)("businessPanUrl"),
    companyAddressProofUrl: (0, pg_core_1.text)("companyAddressProofUrl"),
    gstCertificateUrl: (0, pg_core_1.text)("gstCertificateUrl"),
    businessPanMime: (0, pg_core_1.varchar)("businessPanMime", { length: 100 }),
    gstCertificateMime: (0, pg_core_1.varchar)("gstCertificateMime", { length: 100 }),
    businessPanStatus: (0, exports.kycDocStatusEnum)("businessPanStatus")
        .default("pending")
        .notNull(),
    gstCertificateStatus: (0, exports.kycDocStatusEnum)("gstCertificateStatus")
        .default("pending")
        .notNull(),
    businessPanRejectionReason: (0, pg_core_1.text)("businessPanRejectionReason"),
    gstCertificateRejectionReason: (0, pg_core_1.text)("gstCertificateRejectionReason"),
    // 🔁 Legacy fallback reason (optional - you can delete this if not needed)
    rejectionReason: (0, pg_core_1.text)("rejectionReason"),
    // ─── Timestamps ───────────────────────────────────────────────
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true }).defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)("updatedAt", { withTimezone: true }).defaultNow(),
});

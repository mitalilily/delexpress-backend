import { Request } from "express";

export interface BusinessInfo {
  brandName: string;
  gstNumber?: string;
  panNumber?: string;
  businessCategory?: string; // e.g., D2C, marketplace, manufacturer
  websiteUrl?: string;
}

export interface LocationInfo {
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  pincode: string;
  country: string;
  latitude?: number;
  longitude?: number;
}

export interface SalesChannels {
  amazon?: string; // store URL or seller ID
  flipkart?: string; // store URL or seller ID
  shopify?: string;
  woocommerce?: string;
  customWebsite?: string;
  // add any other sales channels here
}

export interface ShippingPreferences {
  preferredCouriers: string[]; // e.g. ["FedEx", "DHL"]
  packagingType: "standard" | "custom" | "eco-friendly";
  deliverySpeedPreference?: "standard" | "express" | "overnight";
  returnPickupRequired?: boolean;
}

export interface PaymentDetails {
  bankAccountNumber: string;
  ifscCode: string;
  upiId?: string;
  paymentGateway?: string; // e.g. "Razorpay", "Paytm"
  taxId?: string; // GST or equivalent
}

export interface Documents {
  gstCertificateUrl?: string;
  panCardUrl?: string;
  businessLicenseUrl?: string;
  otherDocsUrls?: string[]; // any additional document URLs
}

export interface IGetUserAuthInfoRequest extends Request {
  user: string; // or any other type
}

export interface IUser {
  /* --- identifiers --- */
  id: string; // uuid (PK)
  adminId?: string; // uuid → nullable FK to users.id

  /* --- basic info --- */
  phone?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  emailVerified?: boolean;
  phoneVerified?: boolean;

  role?: "customer" | "admin" | string; // default "customer"
  googleId?: string | null;

  /* --- profile / onboarding --- */
  businessType?: string;
  profileCompletion?: "pending" | "partial" | "complete" | string;
  onboardingStep: number; // NOT NULL
  onboardingComplete: boolean; // NOT NULL default false

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  businessInfo?: Record<string, any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  locationInfo?: Record<string, any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  salesChannels?: Record<string, any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  shippingPreferences?: Record<string, any>;
  profilePicture?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  paymentDetails?: Record<string, any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  documents?: Record<string, any>;
  monthlyOrderCount?: string; // e.g. "0-100"

  /* --- auth --- */
  passwordHash?: string | null;
  refreshToken?: string | null;
  refreshTokenExpiresAt?: Date | null;
  previousRefreshToken?: string | null;
  previousRefreshTokenExpiresAt?: Date | null;
  otp?: string | null;
  otpExpiresAt?: Date | null;
  emailVerificationToken?: string | null;
  emailVerificationTokenExpiresAt?: Date | null;

  accountVerified?: boolean;

  /* --- timestamps --- */
  createdAt?: Date;
  updatedAt?: Date;
}

export type BusinessStructure =
  | "individual"
  | "company"
  | "partnership_firm"
  | "sole_proprietor";

export type CompanyType =
  | "private_limited"
  | "public_limited"
  | "one_person_company"
  | "llp"
  | "section_8_company";

export interface KycDetails {
  /* ─ Primary / relations ─ */
  id: string; // uuid
  userId: string; // uuid → users.id FK
  structure: BusinessStructure;
  companyType: CompanyType;

  /* ─ File URLs or R2 object keys ─ */
  gstin?: string;
  cin?: string;
  selfieUrl?: string;

  aadhaarUrl?: string;
  businessPanUrl?: string;
  companyAddressProofUrl?: string;
  gstCertificateUrl?: string;
  panCardUrl?: string;
  partnershipDeedUrl?: string;
  llpAgreementUrl?: string;
  boardResolutionUrl?: string;

  cancelledChequeUrl?: string;

  /* ─ Optional MIME types ─ */
  selfieMime?: string;
  panCardMime?: string;
  aadhaarMime?: string;
  cancelledChequeMime?: string;
  businessPanMime?: string;
  gstCertificateMime: string;
  llpAgreementMime: string;
  companyAddressProofMime?: string;

  boardResolutionMime?: string;
  partnershipDeedMime?: string;

  /* ─ Per-field status ─ */
  selfieStatus?: "pending" | "verified" | "rejected";
  panCardStatus?: "pending" | "verified" | "rejected";
  businessPanStatus: "pending" | "verified" | "rejected";
  aadhaarStatus?: "pending" | "verified" | "rejected";
  gstCertificateStatus?: "pending" | "verified" | "rejected";
  cancelledChequeStatus?: "pending" | "verified" | "rejected";
  boardResolutionStatus?: "pending" | "verified" | "rejected";
  partnershipDeedStatus?: "pending" | "verified" | "rejected";
  cinStatus?: "pending" | "verified" | "rejected";
  llpAgreementStatus: "pending" | "verified" | "rejected";
  companyAddressProofStatus?: "pending" | "verified" | "rejected";

  /* ─ Rejection reasons ─ */
  selfieRejectionReason?: string;
  panCardRejectionReason?: string;
  aadhaarRejectionReason?: string;
  cancelledChequeRejectionReason?: string;
  boardResolutionRejectionReason?: string;
  partnershipDeedRejectionReason?: string;
  llpAgreementRejectionReason?: string;
  cinRejectionReason?: string;

  /* ─ Workflow ─ */
  rejectionReason?: string; // global rejection reason (optional)
  status: "verification_in_progress" | "pending" | "verified" | "rejected";

  /* ─ Timestamps ─ */
  createdAt?: Date;
  updatedAt?: Date;
}

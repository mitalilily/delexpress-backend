// types/profileBlocks.ts
export type CompanyStatus =
  | "ONBOARDING"
  | "UNDER_REVIEW"
  | "ACTIVE"
  | "INACTIVE";

export interface CompanyInfo {
  businessName: string;
  contactPerson: string;
  POCEmailVerified: boolean;
  POCPhoneVerified: boolean;
  companyAddress: string;
  pincode: string;
  state: string;
  city: string;
  profilePicture?: string;
  contactNumber: string;
  contactEmail: string;
  companyContactNumber: string;
  brandName: string;
  companyEmail: string;
  companyLogoUrl?: string;
  website?: string;
}

export type BusinessType = "b2b" | "b2c" | "d2c";

export interface IUserProfileDB {
  id: string;
  userId: string;

  onboardingStep: number;
  monthlyOrderCount: string;
  onboardingComplete: boolean;
  profileComplete: boolean;

  salesChannels: Record<string, any>;

  companyInfo: CompanyInfo;
  domesticKyc: DomesticKyc | null;
  bankDetails: BankDetails | null;
  gstDetails: GstDetails | null;
  businessType: BusinessType[];

  approved: boolean;
  approvedAt: string | null;
  rejectionReason: string | null;
  currentPlanId?: string | null;
  currentPlanName?: string | null;

  submittedAt: string;
  updatedAt: string;
}

export interface DomesticKyc {
  status: "pending" | "rejected" | "verification_in_progress" | "verified";
  updatedAt: Date | null;
}

export interface BankAccount {
  accountHolder: string;
  accountNumber?: string;
  ifsc?: string;
  bankName?: string;
  isPrimary: boolean;
  branch?: string;
  fundAccountId?: string | null;
  accountType?: "SAVINGS" | "CURRENT";
  upiId?: string;
  chequeImageUrl?: string;
  status: "verified" | "pending" | "rejected"; // ✅ verified/unverified status
  rejectionReason?: string;
}

export interface BankDetails {
  count: number; // how many accounts exist
  primaryAccount: BankAccount | null;
}
export interface GstDetails {
  gstNumber: string; // 15‑char GSTIN
  legalName?: string;
  registrationDate?: string; // ISO date
  state?: string;
  documentUrl?: string; // GST cert PDF/image
}

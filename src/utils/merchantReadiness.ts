import { and, count, eq } from 'drizzle-orm'
import { db } from '../models/client'
import { getPaymentOptions } from '../models/services/paymentOptions.service'
import { kyc } from '../models/schema/kyc'
import { pickupAddresses } from '../models/schema/pickupAddresses'
import { userProfiles } from '../models/schema/userProfile'
import { wallets } from '../models/schema/wallet'
import { CompanyInfo } from '../types/profileBlocks.types'
import { HttpError } from './classes'

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
] as const

function hasRequiredCompanyInfo(companyInfo: CompanyInfo | null | undefined) {
  if (!companyInfo) return false

  return REQUIRED_COMPANY_FIELDS.every((field) => {
    const value = companyInfo[field]
    return typeof value === 'string' ? value.trim().length > 0 : Boolean(value)
  })
}

export async function getMerchantOrderReadiness(userId: string) {
  const [profile, kycRecord, pickupCountResult, wallet, paymentSettings] = await Promise.all([
    db
      .select({
        onboardingComplete: userProfiles.onboardingComplete,
        approved: userProfiles.approved,
        companyInfo: userProfiles.companyInfo,
      })
      .from(userProfiles)
      .where(eq(userProfiles.userId, userId))
      .limit(1),
    db.select({ status: kyc.status }).from(kyc).where(eq(kyc.userId, userId)).limit(1),
    db
      .select({ count: count() })
      .from(pickupAddresses)
      .where(
        and(eq(pickupAddresses.userId, userId), eq(pickupAddresses.isPickupEnabled, true)),
      ),
    db
      .select({ balance: wallets.balance })
      .from(wallets)
      .where(eq(wallets.userId, userId))
      .limit(1),
    getPaymentOptions(),
  ])

  const profileRow = profile[0]
  const kycRow = kycRecord[0]
  const walletBalance = Number(wallet[0]?.balance ?? 0)
  const pickupCount = Number(pickupCountResult[0]?.count ?? 0)
  const requiredWalletBalance = Math.max(Number(paymentSettings?.minWalletRecharge ?? 0), 1)

  return {
    onboardingComplete: Boolean(profileRow?.onboardingComplete),
    approved: Boolean(profileRow?.approved),
    hasCompanyInfo: hasRequiredCompanyInfo(profileRow?.companyInfo as CompanyInfo | null | undefined),
    kycVerified: kycRow?.status === 'verified',
    hasPickupAddress: pickupCount > 0,
    walletReady: walletBalance >= requiredWalletBalance,
    walletBalance,
    requiredWalletBalance,
  }
}

export async function requireMerchantOrderReadiness(userId: string): Promise<void> {
  const readiness = await getMerchantOrderReadiness(userId)

  if (!readiness.onboardingComplete) {
    throw new HttpError(
      403,
      'Complete onboarding before creating orders.',
    )
  }

  if (!readiness.hasCompanyInfo) {
    throw new HttpError(
      403,
      'Complete your company information before creating orders.',
    )
  }

  if (!readiness.approved) {
    throw new HttpError(
      403,
      'Your merchant account is pending approval. Please contact support if this is taking longer than expected.',
    )
  }

  if (!readiness.kycVerified) {
    throw new HttpError(
      403,
      'KYC verification is required before creating orders.',
    )
  }

  if (!readiness.hasPickupAddress) {
    throw new HttpError(
      403,
      'Add at least one pickup address before creating orders.',
    )
  }

  if (!readiness.walletReady) {
    throw new HttpError(
      403,
      `Add wallet balance before creating orders. Minimum required balance is Rs ${readiness.requiredWalletBalance}.`,
    )
  }
}

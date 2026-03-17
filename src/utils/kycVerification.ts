import { eq } from 'drizzle-orm'
import { db } from '../models/client'
import { kyc } from '../models/schema/kyc'
import { HttpError } from './classes'

/**
 * Check if user's KYC is verified
 * @param userId - User ID to check
 * @throws HttpError if KYC is not verified
 */
export async function requireKycVerification(userId: string): Promise<void> {
  const kycRecord = await db.select().from(kyc).where(eq(kyc.userId, userId)).limit(1)

  // If no KYC record exists, throw error
  if (!kycRecord || kycRecord.length === 0) {
    throw new HttpError(
      403,
      'KYC verification required. Please complete your KYC verification before creating orders.',
    )
  }

  const userKyc = kycRecord[0]

  // Check if KYC status is verified
  if (userKyc.status !== 'verified') {
    const statusMessages: Record<string, string> = {
      pending:
        'KYC verification is pending. Please complete your KYC verification before creating orders.',
      verification_in_progress:
        'KYC verification is in progress. Please wait for approval before creating orders.',
      rejected:
        'KYC verification was rejected. Please update your KYC documents and resubmit for verification.',
    }

    throw new HttpError(
      403,
      statusMessages[userKyc.status] || 'KYC verification is required to create orders.',
    )
  }
}

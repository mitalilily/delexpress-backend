import { eq } from 'drizzle-orm'
import { CompanyType, KycDetails } from '../../types/users.types'
import { requiredKycDetails, requiredKycFieldMap } from '../../utils/constants'
import { db } from '../client'
import { kyc } from '../schema/kyc'

import { HttpError } from '../../utils/classes'
import { userProfiles } from '../schema/userProfile'

// Optional image clarity checker
// import { isImageBlurrySharp } from "@/utils/imageBlurriness";

export const UpdateKYCDetails = async (userId: string, details: KycDetails): Promise<void> => {
  const { structure, companyType } = details

  if (!structure || !(structure in requiredKycDetails)) {
    throw new HttpError(500, 'Invalid or missing business structure')
  }

  // ✅ Determine required fields based on structure + companyType
  const requiredFieldsMap =
    structure === 'company' && companyType
      ? (
          requiredKycFieldMap[structure] as Record<
            CompanyType,
            Partial<Record<keyof KycDetails, boolean>>
          >
        )[companyType] ?? {}
      : (requiredKycFieldMap[structure] as Partial<Record<keyof KycDetails, boolean>>) ?? {}

  // ✅ Detect missing required fields
  const missing = Object.entries(requiredFieldsMap)
    .filter(([field, isRequired]) => isRequired && !details[field as keyof KycDetails])
    .map(([field]) => field)

  if (missing.length) {
    throw new HttpError(400, `Missing required fields for ${structure}: ${missing.join(', ')}`)
  }

  const now = new Date()

  await db.transaction(async (tx) => {
    const [existingKyc] = await tx
      .select()
      .from(kyc)
      .where(eq(kyc.userId, userId))
      .limit(1)
      .execute()

    const kycPayload: Partial<KycDetails> = {
      structure,
      companyType,
      updatedAt: now,
      status: 'verification_in_progress',
    }

    const docFields: (keyof KycDetails)[] = [
      'aadhaarUrl',
      'panCardUrl',
      'partnershipDeedUrl',
      'companyAddressProofUrl',
      'boardResolutionUrl',
      'cancelledChequeUrl',
      'businessPanUrl',
      'gstCertificateUrl',
      'selfieUrl',
      'cin',
      'gstin',
      'llpAgreementUrl',
    ]

    const fieldToStatusMap: Partial<Record<keyof KycDetails, keyof KycDetails>> = {
      aadhaarUrl: 'aadhaarStatus',
      cancelledChequeUrl: 'cancelledChequeStatus',
      selfieUrl: 'selfieStatus',
      businessPanUrl: 'businessPanStatus',
      llpAgreementUrl: 'llpAgreementStatus',
      companyAddressProofUrl: 'companyAddressProofStatus',
      gstCertificateUrl: 'gstCertificateStatus',
      panCardUrl: 'panCardStatus',
      partnershipDeedUrl: 'partnershipDeedStatus',
      boardResolutionUrl: 'boardResolutionStatus',
      cin: 'cinStatus',
    }

    const mimeFieldsMap: Partial<Record<keyof KycDetails, keyof KycDetails>> = {
      aadhaarUrl: 'aadhaarMime',
      panCardUrl: 'panCardMime',
      llpAgreementUrl: 'llpAgreementMime',
      companyAddressProofUrl: 'companyAddressProofMime',
      selfieUrl: 'selfieMime',
      cancelledChequeUrl: 'cancelledChequeMime',
      boardResolutionUrl: 'boardResolutionMime',
      partnershipDeedUrl: 'partnershipDeedMime',
      businessPanUrl: 'businessPanMime',
      gstCertificateUrl: 'gstCertificateMime',
    }

    for (const field of docFields) {
      const newVal = details[field] as any
      const oldVal = existingKyc?.[field]

      if (newVal && newVal !== oldVal) {
        kycPayload[field] = newVal

        const mimeField = mimeFieldsMap[field]
        if (mimeField) {
          const mime = (details as any)[mimeField]
          if (mime) {
            kycPayload[mimeField] = mime
          }
        }

        const statusField = fieldToStatusMap[field]
        if (statusField) {
          kycPayload[statusField] = 'pending' as any
        }
      }
    }

    // ✅ Remove unchanged audit-only fields before checking
    const changedKeys = Object.keys(kycPayload).filter(
      (k) => !['structure', 'companyType', 'updatedAt', 'status'].includes(k),
    )

    if (existingKyc && changedKeys.length > 0) {
      await tx.update(kyc).set(kycPayload).where(eq(kyc.userId, userId)).execute()
    } else if (!existingKyc) {
      await tx
        .insert(kyc)
        .values({
          ...kycPayload,
          userId,
          createdAt: now,
        } as KycDetails)
        .execute()
    }

    // ✅ Update domesticKyc in user_profiles
    await tx
      .update(userProfiles)
      .set({
        domesticKyc: {
          status: 'verification_in_progress',
          updatedAt: now,
        },
      })
      .where(eq(userProfiles.userId, userId))
      .execute()
  })
}

type RequiredKycFields = (keyof KycDetails)[] | Record<CompanyType, (keyof KycDetails)[]>

const isCompanyRequiredFields = (
  value: RequiredKycFields,
): value is Record<CompanyType, (keyof KycDetails)[]> => !Array.isArray(value)

const resolveRequiredFields = (
  structure?: KycDetails['structure'] | null,
  companyType?: string | null,
): (keyof KycDetails)[] => {
  if (!structure || !(structure in requiredKycDetails)) return []
  const required = requiredKycDetails[structure] as RequiredKycFields
  if (!isCompanyRequiredFields(required)) return required
  const companyKey =
    companyType && companyType in required ? (companyType as CompanyType) : undefined
  if (companyKey) return required[companyKey] ?? []
  return []
}

export async function getUserKycService(userId: string) {
  const w = await db?.query.kyc.findFirst({
    where: eq(kyc.userId, userId),
  })
  if (!w) throw new HttpError(200, 'KYC not found')
  return w
}

export const updateKycStatus = async (
  userId: string,
  status: 'pending' | 'verified' | 'rejected' | 'verification_in_progress',
  reason?: string,
) => {
  const now = new Date()
  const payload: Partial<KycDetails> = { status, updatedAt: now }

  if (status === 'verified') {
    // Approving KYC: reset all document statuses to verified and rejection reasons to empty string
    const docFields = [
      'aadhaar',
      'panCard',
      'partnershipDeed',
      'companyAddressProof',
      'boardResolution',
      'cancelledCheque',
      'businessPan',
      'gstCertificate',
      'selfie',
      'llpAgreement',
      'cin',
      'gstin',
    ]

    docFields.forEach((field) => {
      const statusField = `${field}Status` as keyof KycDetails
      const reasonField = `${field}RejectionReason` as keyof KycDetails
      payload[statusField] = 'verified' as any
      payload[reasonField] = undefined
    })
  }

  if (reason && (status === 'rejected' || status === 'verification_in_progress')) {
    payload.rejectionReason = reason
  }

  // Update main KYC record
  await db.update(kyc).set(payload).where(eq(kyc.userId, userId)).execute()

  // Keep `user_profiles.domesticKyc` in sync so Admin UI shows correct status
  await db
    .update(userProfiles)
    .set({
      domesticKyc: {
        status,
        updatedAt: now,
      },
    })
    .where(eq(userProfiles.userId, userId))
    .execute()
}

export const updateDocumentStatus = async (
  userId: string,
  key: string,
  status: string,
  reason?: string,
) => {
  const statusField = `${key.replace('Url', 'Status')}`

  const now = new Date()
  const payload: any = { [statusField]: status, updatedAt: now }

  if (reason) {
    // Remove 'Url' from key before appending 'RejectionReason'
    const reasonField = `${key.replace('Url', '')}RejectionReason`
    payload[reasonField] = reason
  }

  const getStatusField = (field: keyof KycDetails): keyof KycDetails | null => {
    if (typeof field !== 'string') return null
    if (field.endsWith('Url')) {
      return `${field.replace('Url', '')}Status` as keyof KycDetails
    }
    if (field === 'cin') return 'cinStatus'
    return null
  }

  await db.transaction(async (tx) => {
    await tx.update(kyc).set(payload).where(eq(kyc.userId, userId)).execute()

    const [updatedKyc] = await tx
      .select()
      .from(kyc)
      .where(eq(kyc.userId, userId))
      .limit(1)
      .execute()

    if (!updatedKyc) return

    const requiredFields = resolveRequiredFields(updatedKyc.structure, updatedKyc.companyType)
    const requiredStatusFields = requiredFields
      .map((field) => getStatusField(field))
      .filter(Boolean) as (keyof KycDetails)[]

    if (!requiredStatusFields.length) return

    const allVerified = requiredStatusFields.every((field) => updatedKyc[field] === 'verified')
    if (allVerified && updatedKyc.status !== 'verified') {
      await tx
        .update(kyc)
        .set({ status: 'verified', updatedAt: now })
        .where(eq(kyc.userId, userId))
        .execute()
      await tx
        .update(userProfiles)
        .set({
          domesticKyc: {
            status: 'verified',
            updatedAt: now,
          },
        })
        .where(eq(userProfiles.userId, userId))
        .execute()
    }
  })
}

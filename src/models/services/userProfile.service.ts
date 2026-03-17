import { and, eq, ne, sql } from 'drizzle-orm'
import { generateOtp } from '../../controllers/authController'
import { CompanyInfo, IUserProfileDB } from '../../types/profileBlocks.types'
import { HttpError } from '../../utils/classes'
import { OTP_EXPIRY } from '../../utils/constants'
import { sendVerificationEmail } from '../../utils/emailSender'
import {
  buildPatch,
  compare,
  deepMerge,
  generate8DigitsVerificationToken,
  hash,
  parsePhone,
} from '../../utils/functions'
import { db } from '../client'
import { plans } from '../schema/plans'
import { userProfiles } from '../schema/userProfile'
import { userPlans } from '../schema/userPlans'
import { users } from '../schema/users'

/**
 * Fetch the profile for a specific userId (returns null if none exists)
 */
export const getProfileByUserId = async (userId: string) => {
  const rows = await db
    .select({
      profile: userProfiles,
      currentPlanId: userPlans.plan_id,
      currentPlanName: plans.name,
    })
    .from(userProfiles)
    .leftJoin(userPlans, eq(userPlans.userId, userProfiles.userId))
    .leftJoin(plans, eq(plans.id, userPlans.plan_id))
    .where(eq(userProfiles.userId, userId))
    .limit(1)

  if (!rows[0]) return null

  return {
    ...rows[0].profile,
    currentPlanId: rows[0].currentPlanId ?? null,
    currentPlanName: rows[0].currentPlanName ?? null,
  }
}

/**
 * Upsert OR patch an existing profile in one call.
 * Users can only touch whitelisted fields; flags such as `approved`
 * stay under admin control.
 */
export const upsertUserProfile = async (userId: string, input: IUserProfileDB) => {
  const existing = await getProfileByUserId(userId)

  // Sanitise input (strip undefined so jsonb merge below is clean)
  const payload: any = Object.fromEntries(
    Object.entries(input).filter(([, v]) => v !== undefined),
  ) as IUserProfileDB

  // Merge JSONB blocks (keeps untouched keys intact)
  const merged = {
    ...existing,
    ...payload, // new/updated blocks overwrite existing ones
  }

  const [updated] = await db
    .update(userProfiles)
    .set({
      ...merged,
      updatedAt: new Date(),
    })
    .where(eq(userProfiles.userId, userId))
    .returning()

  return updated
}

/* JSONB columns in user_profiles ― adjust if you add more */
const JSONB_COLUMNS = new Set([
  'companyInfo',
  'domesticKyc',
  'bankDetails',
  'gstDetails',
  'businessType',
  'salesChannels',
])

/* ──────────────────────── main service ────────────────────── */

export const updateUserProfileService = async (userId: string, data: Record<string, any>) => {
  /* 1. fetch current */
  const [existing] = await db
    .select()
    .from(userProfiles)
    .where(eq(userProfiles.userId, userId))
    .limit(1)

  if (!existing) return null

  /* 2. deep merge incoming into existing */
  const merged = deepMerge(existing, data as any)

  /* 0️⃣ detect email / phone replacements */
  const incomingCInfo = (data.companyInfo ?? {}) as Partial<CompanyInfo>
  const emailChanged =
    incomingCInfo.contactEmail && incomingCInfo.contactEmail !== existing.companyInfo.contactEmail
  const phoneChanged =
    incomingCInfo.contactNumber &&
    incomingCInfo.contactNumber !== existing.companyInfo.contactNumber

  if (emailChanged) {
    /* Check user_profiles JSONB                             */
    const [emailProfileConflict] = await db
      .select({ id: userProfiles.userId })
      .from(userProfiles)
      .where(
        and(
          sql`${userProfiles.companyInfo}->>'contactEmail' = ${incomingCInfo.contactEmail}`,
          ne(userProfiles.userId, userId),
        ),
      )
      .limit(1)

    /* Check users.email as well                             */
    const [emailUserConflict] = await db
      .select({ id: users.id })
      .from(users)
      .where(and(eq(users.email, incomingCInfo.contactEmail!), ne(users.id, userId)))
      .limit(1)

    if (emailProfileConflict || emailUserConflict) {
      throw new HttpError(409, 'E‑mail already in use by another account')
    }
    merged.companyInfo = {
      ...merged.companyInfo,
      POCEmailVerified: false,
    }
  }

  if (phoneChanged) {
    const [phoneConflict] = await db
      .select({ id: userProfiles.userId })
      .from(userProfiles)
      .where(
        and(
          sql`${userProfiles.companyInfo}->>'contactNumber' = ${incomingCInfo.contactNumber}`,
          ne(userProfiles.userId, userId),
        ),
      )
      .limit(1)

    if (phoneConflict) {
      throw new HttpError(409, 'Phone number already in use by another account')
    }
    merged.companyInfo = {
      ...merged.companyInfo,
      POCPhoneVerified: false,
    }
  }
  /* 3. diff → patch */
  const patch = buildPatch(existing, merged)
  if (Object.keys(patch).length === 0) return existing

  /* 4. split */
  const scalarPatch: Record<string, unknown> = {}
  const jsonbMerge: Record<string, unknown> = {}

  for (const [col, val] of Object.entries(patch)) {
    if (JSONB_COLUMNS.has(col)) {
      jsonbMerge[col] = val
    } else {
      scalarPatch[col] = val
    }
  }
  scalarPatch.updatedAt = new Date()

  /* 5. transaction (same body as before) */
  await db.transaction(async (tx) => {
    if (Object.keys(scalarPatch).length) {
      await tx.update(userProfiles).set(scalarPatch).where(eq(userProfiles.userId, userId))
    }

    if (Object.keys(jsonbMerge).length) {
      const jsonbSet: Record<string, any> = {}
      for (const [col, val] of Object.entries(jsonbMerge)) {
        jsonbSet[col] =
          val === null || Array.isArray(val) || typeof val !== 'object'
            ? val
            : sql`${(userProfiles as any)[col]} || ${JSON.stringify(val)}::jsonb`
      }
      await tx.update(userProfiles).set(jsonbSet).where(eq(userProfiles.userId, userId))
    }

    /* sync canonical cols */
    const [after] = await tx
      .select()
      .from(userProfiles)
      .where(eq(userProfiles.userId, userId))
      .limit(1)

    const userPayload: Partial<typeof users.$inferInsert> = {}
    if (incomingCInfo.contactEmail) {
      userPayload.email = after.companyInfo.contactEmail
      userPayload.emailVerified = after.companyInfo.POCEmailVerified
    }
    if (incomingCInfo.contactNumber) {
      userPayload.phone = after.companyInfo.contactNumber
      userPayload.phoneVerified = after.companyInfo.POCPhoneVerified
    }
    if (Object.keys(userPayload).length) {
      await tx.update(users).set(userPayload).where(eq(users.id, userId))
    }
  })

  /* 6. return fresh row */
  const [updated] = await db
    .select()
    .from(userProfiles)
    .where(eq(userProfiles.userId, userId))
    .limit(1)

  return updated
}

/**
 * Send a verification OTP to either the existing or newly‑updated e‑mail.
 * Rejects if `updatedEmail` is already taken by another profile.
 */
export const requestProfileEmailVerificationOTP = async (
  userId: string,
  updatedEmail?: string,
): Promise<void> => {
  /* 1️⃣ Fetch profile */
  const [profile] = await db
    .select()
    .from(userProfiles)
    .where(eq(userProfiles.userId, userId))
    .limit(1)

  if (!profile) throw new HttpError(404, 'Profile not found')

  const currentEmail = profile.companyInfo.contactEmail
  const isNewEmail = updatedEmail && updatedEmail !== currentEmail

  /* 2️⃣ Uniqueness check only if it's a new address */
  if (isNewEmail) {
    const [conflict] = await db
      .select({ id: userProfiles.userId })
      .from(userProfiles)
      .where(
        and(
          sql`${userProfiles.companyInfo}->>'contactEmail' = ${updatedEmail}`,
          ne(userProfiles.userId, userId),
        ),
      )
      .limit(1)

    if (conflict) throw new HttpError(409, 'E‑mail already in use')
  }

  /* 3️⃣ Generate OTP + expiry */
  const otp = generate8DigitsVerificationToken()
  const expiresAt = new Date(Date.now() + OTP_EXPIRY)
  const target = isNewEmail ? updatedEmail! : currentEmail

  /* 4️⃣ Persist OTP (+ pendingEmail only if new) */
  await db
    .update(users)
    .set({
      emailVerificationToken: otp,
      emailVerificationTokenExpiresAt: expiresAt,
      pendingEmail: isNewEmail ? updatedEmail : null, // ← key line
    })
    .where(eq(users.id, userId))

  /* 5️⃣ Send the code */
  await sendVerificationEmail(target, otp)
}

export const verifyProfileEmailOTP = async (
  userId: string,
  email: string,
  otp: string,
): Promise<any> => {
  /* 1️⃣ Load row with OTP fields */
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1)

  if (!user) throw new HttpError(404, 'Profile not found')

  if (
    !user.emailVerificationToken ||
    !user.emailVerificationTokenExpiresAt ||
    user.emailVerificationTokenExpiresAt < new Date()
  ) {
    throw new HttpError(400, 'OTP expired or not requested')
  }

  if (otp !== user.emailVerificationToken) {
    throw new HttpError(401, 'Invalid OTP')
  }

  /* 2️⃣ Decide final e‑mail */
  const finalEmail = email

  const companyInfoWithEmail = sql`jsonb_set(
  ${userProfiles.companyInfo},
  '{contactEmail}',
  ${JSON.stringify(finalEmail)}::jsonb,
  true
)`

  const verifiedCompanyInfo = sql`jsonb_set(
  ${companyInfoWithEmail},
  '{POCEmailVerified}',
  'true'::jsonb,
  true
)`

  /* 4️⃣ Transaction: update BOTH tables atomically */
  await db.transaction(async (tx) => {
    /* user_profiles */
    await tx
      .update(userProfiles)
      .set({
        companyInfo: verifiedCompanyInfo,
      })
      .where(eq(userProfiles.userId, userId))

    /* users */
    await tx
      .update(users)
      .set({
        email: finalEmail,
        pendingEmail: null,
        emailVerificationToken: null,
        emailVerificationTokenExpiresAt: null,
        emailVerified: true,
      })
      .where(eq(users.id, userId))
  })

  return finalEmail
}

export const verifyProfilePhoneOTP = async (
  userId: string,
  phone: string,
  otp: string,
): Promise<any> => {
  // 1️⃣ Load user
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1)

  if (!user) throw new HttpError(404, 'Profile not found')

  if (!user.otp || !user.otpExpiresAt || user.otpExpiresAt < new Date()) {
    throw new HttpError(400, 'OTP expired or not requested')
  }

  if (otp !== user.otp) {
    throw new HttpError(401, 'Invalid OTP')
  }

  // 2️⃣ Final phone value
  const finalPhone = phone

  const companyInfoWithPhone = sql`jsonb_set(
  ${userProfiles.companyInfo},
  '{contactPhone}',
  ${JSON.stringify(phone)}::jsonb,
  true
)`

  const verifiedCompanyInfo = sql`jsonb_set(
  ${companyInfoWithPhone},
  '{POCPhoneVerified}',
  'true'::jsonb,
  true
)`

  // 3️⃣ Transaction to update both tables atomically
  await db.transaction(async (tx) => {
    // Update user_profiles
    await tx
      .update(userProfiles)
      .set({
        companyInfo: verifiedCompanyInfo,
      })
      .where(eq(userProfiles.userId, userId))

    // Update users
    await tx
      .update(users)
      .set({
        phone: finalPhone,
        pendingPhone: null,
        otp: null,
        otpExpiresAt: null,
        phoneVerified: true,
      })
      .where(eq(users.id, userId))
  })

  return finalPhone
}

/**
 * Send / resend an OTP for verifying (or updating) the user’s phone number.
 * ‑ If `updatedPhone` is provided and differs from the current one, the number
 *   is treated as a *change request* and stored in `pendingPhone` until verified.
 * ‑ Otherwise we’re just re‑verifying the existing phone on file.
 */
export const requestProfilePhoneVerificationOTP = async (
  userId: string,
  updatedPhone?: string,
): Promise<void> => {
  /* ───────────────── 1️⃣  Fetch current profile ───────────────── */
  const [profile] = await db
    .select()
    .from(userProfiles)
    .where(eq(userProfiles.userId, userId))
    .limit(1)

  if (!profile) throw new HttpError(404, 'Profile not found')

  const currentPhone = profile.companyInfo.contactNumber // e.g. “9876543210”
  const rawPhone = updatedPhone ?? currentPhone

  if (!rawPhone) throw new HttpError(400, 'Phone number is required')

  /* ───────────────── 2️⃣  Validate + normalise ───────────────── */
  let parsed // { e164: “+919876543210”, national: “9876543210”, country: “IN” }
  try {
    parsed = parsePhone(rawPhone)
  } catch {
    throw new HttpError(400, 'Invalid phone number format')
  }

  const isNewPhone = updatedPhone && parsed.national !== currentPhone

  /* ───────────────── 3️⃣  Uniqueness check (only if new) ─────── */
  if (isNewPhone) {
    const [conflict] = await db
      .select({ id: userProfiles.userId })
      .from(userProfiles)
      .where(
        and(
          sql`${userProfiles.companyInfo}->>'contactNumber' = ${parsed.national}`,
          ne(userProfiles.userId, userId),
        ),
      )
      .limit(1)

    if (conflict) throw new HttpError(409, 'Phone number already in use')
  }

  /* ───────────────── 4️⃣  Generate OTP + expiry ───────────────── */
  const otp = generateOtp() // 6‑digit numeric string
  const expiresAt = new Date(Date.now() + OTP_EXPIRY)

  /* ───────────────── 5️⃣  Persist token on user row ───────────── */
  await db
    .update(users)
    .set({
      otp: otp,
      otpExpiresAt: expiresAt,
      pendingPhone: isNewPhone ? parsed.national : null, // ← only set if changing #
    })
    .where(eq(users.id, userId))

  /* ───────────────── 6️⃣  Send OTP via email (instead of SMS) ────── */
  const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1)
  if (user?.email) {
    await sendVerificationEmail(user.email, otp)
  }
}

export async function changePassword(
  userId: string,
  newPassword: string,
  currentPassword?: string, // optional when the user never had a password
) {
  const [user] = await db.select().from(users).where(eq(users.id, userId))
  if (!user) throw new Error('User not found')

  const hasExistingPassword = !!user.passwordHash

  // If a password exists, we must validate the current password
  if (hasExistingPassword) {
    if (!currentPassword) throw new Error('Current password is required')

    const ok = await compare(currentPassword, user.passwordHash!)
    if (!ok) throw new Error('Current password is incorrect')

    if (currentPassword === newPassword)
      throw new Error('New password must differ from current password')
  }

  // Strength check (8+ chars, upper, lower, number)
  if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[A-Za-z\d]{8,}/.test(newPassword)) {
    throw new Error('Password must be 8+ characters and include upper, lower, and a number')
  }

  const passwordHash = await hash(newPassword)

  await db.update(users).set({ passwordHash }).where(eq(users.id, userId))
}

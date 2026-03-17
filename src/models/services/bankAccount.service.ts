import { and, eq, ne, sql } from 'drizzle-orm'
import { BankAccount } from '../../types/profileBlocks.types'
import { HttpError } from '../../utils/classes'
import { db } from '../client'
import { bankAccounts } from '../schema/bankAccounts'
import { userProfiles } from '../schema/userProfile'
import { pennyDropVerifyLive } from './razorpayPennydrop.service'
// import { UpiverificationResult } from "../../types/generic.types";
// import { razorpayApi } from "../../utils/razorpay";
// import { AxiosError } from "axios";
// import { cashfreeApi } from "../../utils/cashfree";

// Razorpay Penny Drop Verification
export const addBankAccount = async (
  userId: string,
  data: any,
  mode: 'manual' | 'pennyDrop' = 'manual',
) => {
  const {
    bankName,
    branch,
    upiId,
    accountNumber,
    accountType,
    chequeImageUrl,
    ifsc,
    accountHolder,
  } = data

  const isUPIMode = !!upiId && !accountNumber
  const isBankMode = !!accountNumber

  if (isUPIMode) {
    if (!accountHolder || !upiId) throw new HttpError(400, 'UPI ID and account holder are required')
  } else if (isBankMode) {
    const missing = [
      !bankName && 'bankName',
      !branch && 'branch',
      !ifsc && 'ifsc',
      !accountType && 'accountType',
      !accountNumber && 'accountNumber',
      !accountHolder && 'accountHolder',
      // !chequeImageUrl && "chequeImageUrl",
    ].filter(Boolean)

    if (missing.length) throw new HttpError(400, `Missing required fields: ${missing.join(', ')}`)
  } else {
    throw new HttpError(400, 'Provide either upiId or full bank details')
  }

  return db.transaction(async (tx) => {
    const duplicate = await tx
      .select()
      .from(bankAccounts)
      .where(
        isUPIMode
          ? and(eq(bankAccounts.userId, userId), eq(bankAccounts.upiId, upiId))
          : and(
              eq(bankAccounts.userId, userId),
              eq(bankAccounts.accountNumber, accountNumber),
              eq(bankAccounts.ifsc, ifsc),
            ),
      )
      .limit(1)

    if (duplicate.length > 0) {
      throw new HttpError(409, 'This UPI ID or Bank Account is already added')
    }

    const existing = await tx.select().from(bankAccounts).where(eq(bankAccounts.userId, userId))

    const hasPrimary = existing.some((b) => b.isPrimary)

    let status: BankAccount['status'] = 'pending'
    let fundAccountId: string | null = null

    if (mode === 'pennyDrop' && isBankMode) {
      const result = await pennyDropVerifyLive({
        name: accountHolder,
        ifsc,
        accountNumber,
      })

      fundAccountId = result.fundAccountId
      status = 'pending' // Always pending — webhook updates later
    }

    const [inserted] = await tx
      .insert(bankAccounts)
      .values({
        userId,
        bankName: bankName ?? '',
        branch: branch ?? '',
        upiId: upiId ?? null,
        accountNumber: accountNumber ?? null,
        accountType: accountType ?? '',
        chequeImageUrl: chequeImageUrl ?? '',
        ifsc: ifsc ?? '',
        accountHolder,
        fundAccountId,
        isPrimary: hasPrimary ? false : true,
        status,
      })
      .returning()

    const updated = [...existing, inserted]
    const primary = updated.find((b) => b.isPrimary) || null

    await tx
      .update(userProfiles)
      .set({
        bankDetails: {
          count: updated.length,
          primaryAccount: primary as BankAccount,
        },
      })
      .where(eq(userProfiles.userId, userId))
  })
}

export const getBankAccounts = async (userId: string) => {
  const accounts = await db.select().from(bankAccounts).where(eq(bankAccounts.userId, userId))

  if (!accounts.length) {
    // You could throw an error here:
    // throw new HttpError(404, "No bank accounts found");

    // But since you want to return an empty array instead:
    return []
  }

  return accounts
}

export async function markBankVerified(fundAccountId: string): Promise<void> {
  await db.transaction(async (tx) => {
    // 1. Update status
    const [updated] = await tx
      .update(bankAccounts)
      .set({ status: 'verified', rejectionReason: null })
      .where(eq(bankAccounts.fundAccountId, fundAccountId))
      .returning()

    if (!updated) return // no record found—ignore

    // 2. Recompute bankDetails summary for that user
    const all = await tx.select().from(bankAccounts).where(eq(bankAccounts.userId, updated.userId))

    const primary = all.find((b) => b.isPrimary) || null

    await tx
      .update(userProfiles)
      .set({
        bankDetails: {
          count: all.length,
          primaryAccount: primary as BankAccount | null,
        },
      })
      .where(eq(userProfiles.userId, updated.userId))
  })
}

/**
 * Mark a bank account as rejected with reason.
 * ─────────────────────────────────────────────────────
 * 1. status → "rejected"
 * 2. Store rejectionReason
 */
export async function markBankRejected(
  fundAccountId: string,
  reason: string | null,
): Promise<void> {
  await db
    .update(bankAccounts)
    .set({ status: 'rejected', rejectionReason: reason ?? 'Validation failed' })
    .where(eq(bankAccounts.fundAccountId, fundAccountId))
}

// export async function validateVPA(vpa: string) {
//   try {
//     const { data } = await cashfreeApi.post("/payout/v1/validateVPA", { vpa });
//     console.log("DATA", data);

//     return {
//       isValid: data.isValid,
//       vpa: data.vpa,
//       accountHolder: data.accountHolder ?? null,
//     };
//   } catch (err) {
//     throw new Error("Cashfree VPA validation failed");
//   }
// }

/**
 * Update a user’s bank account.
 * Ensures:
 * - Uniqueness of UPI/accountNumber per user
 * - Only one primary account
 * - Resets verification if key data changes
 */

export async function updateBankAccount(
  userId: string,
  accountId: string,
  patch: Partial<BankAccount>,
) {
  return db.transaction(async (tx) => {
    /* ------------------------------------------------------------ 1. Fetch existing */
    const [existing] = await tx
      .select()
      .from(bankAccounts)
      .where(and(eq(bankAccounts.id, accountId), eq(bankAccounts.userId, userId)))
      .limit(1)

    if (!existing) throw new Error('Bank account not found')

    /* ------------------------------------------------------------ 2. Uniqueness checks */
    if (patch.upiId && patch.upiId !== existing.upiId) {
      const [{ count }] = await tx
        .select({ count: sql<number>`count(*)` })
        .from(bankAccounts)
        .where(
          and(
            eq(bankAccounts.upiId, patch.upiId),
            eq(bankAccounts.userId, userId),
            ne(bankAccounts.id, accountId),
          ),
        )
      if (count > 0) throw new Error('UPI ID already in use')
    }

    if (patch.accountNumber && patch.accountNumber !== existing.accountNumber) {
      const [{ count }] = await tx
        .select({ count: sql<number>`count(*)` })
        .from(bankAccounts)
        .where(
          and(
            eq(bankAccounts.accountNumber, patch.accountNumber),
            eq(bankAccounts.userId, userId),
            ne(bankAccounts.id, accountId),
          ),
        )
      if (count > 0) throw new Error('Account number already in use')
    }

    /* ------------------------------------------------------------ 3. Detect sensitive changes */
    const coreChanged =
      (patch.upiId && patch.upiId !== existing.upiId) ||
      (patch.accountNumber && patch.accountNumber !== existing.accountNumber) ||
      (patch.ifsc && patch.ifsc !== existing.ifsc)

    const nextStatus = coreChanged ? 'pending' : existing.status

    /* ------------------------------------------------------------ 4. Ensure single primary */
    if (patch.isPrimary === true && existing.isPrimary === false) {
      await tx
        .update(bankAccounts)
        .set({ isPrimary: false })
        .where(and(eq(bankAccounts.userId, userId), eq(bankAccounts.isPrimary, true)))
    }

    /* ------------------------------------------------------------ 5. Build & apply update (fundAccountId untouched) */
    const updatePayload: Partial<BankAccount> = {
      ...patch,
      status: nextStatus,
    }
    delete updatePayload.fundAccountId // keep whatever is already there

    await tx
      .update(bankAccounts)
      .set(updatePayload)
      .where(and(eq(bankAccounts.id, accountId), eq(bankAccounts.userId, userId)))

    /* ------------------------------------------------------------ 6. Refresh user_profiles.bankDetails */
    const all = await tx.select().from(bankAccounts).where(eq(bankAccounts.userId, userId))

    const primary = all.find((b) => b.isPrimary) ?? null

    await tx
      .update(userProfiles)
      .set({
        bankDetails: {
          count: all.length,
          primaryAccount: primary as BankAccount | null,
        },
      })
      .where(eq(userProfiles.userId, userId))

    /* ------------------------------------------------------------ 7. Return latest */
    const [updated] = await tx
      .select()
      .from(bankAccounts)
      .where(eq(bankAccounts.id, accountId))
      .limit(1)

    return updated
  })
}

export async function deleteBankAccount(userId: string, accountId: string) {
  // 1. Fetch record
  const [account] = await db
    .select()
    .from(bankAccounts)
    .where(and(eq(bankAccounts.id, accountId), eq(bankAccounts.userId, userId)))
    .limit(1)

  if (!account) throw new Error('Bank account not found')

  if (account.isPrimary && account.status === 'verified') {
    throw new Error(
      'Cannot delete a primary verified account. Please set another account as primary first.',
    )
  }

  // 2. Delete
  await db
    .delete(bankAccounts)
    .where(and(eq(bankAccounts.id, accountId), eq(bankAccounts.userId, userId)))

  return { id: accountId }
}

export const getBankAccountsByUserId = async (userId: string) => {
  const accounts = await db.select().from(bankAccounts).where(eq(bankAccounts.userId, userId))

  if (!accounts.length) {
    // return empty array if none found
    return []
  }

  return accounts
}

export async function updateBankAccountStatusById(
  userId: string,
  accountId: string,
  status: 'pending' | 'verified' | 'rejected',
  rejectionReason?: string | null,
): Promise<void> {
  // 1. Fetch the bank account, verify ownership
  const [account] = await db
    .select()
    .from(bankAccounts)
    .where(and(eq(bankAccounts.id, accountId), eq(bankAccounts.userId, userId)))
    .limit(1)

  if (!account) {
    throw new HttpError(404, 'Bank account not found for this user')
  }

  // 2. Update status and rejection reason
  await db
    .update(bankAccounts)
    .set({
      status,
      rejectionReason: status === 'rejected' ? rejectionReason ?? 'Validation failed' : null,
    })
    .where(and(eq(bankAccounts.id, accountId), eq(bankAccounts.userId, userId)))

  // 3. Refresh user's bankDetails summary in userProfiles
  const allAccounts = await db.select().from(bankAccounts).where(eq(bankAccounts.userId, userId))

  const primaryAccount = allAccounts.find((acc) => acc.isPrimary) || null

  await db
    .update(userProfiles)
    .set({
      bankDetails: {
        count: allAccounts.length,
        primaryAccount: primaryAccount as BankAccount | null,
      },
    })
    .where(eq(userProfiles.userId, userId))
}

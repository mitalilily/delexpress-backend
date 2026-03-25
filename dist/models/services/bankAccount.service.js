"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getBankAccountsByUserId = exports.getBankAccounts = exports.addBankAccount = void 0;
exports.markBankVerified = markBankVerified;
exports.markBankRejected = markBankRejected;
exports.updateBankAccount = updateBankAccount;
exports.deleteBankAccount = deleteBankAccount;
exports.updateBankAccountStatusById = updateBankAccountStatusById;
const drizzle_orm_1 = require("drizzle-orm");
const classes_1 = require("../../utils/classes");
const client_1 = require("../client");
const bankAccounts_1 = require("../schema/bankAccounts");
const userProfile_1 = require("../schema/userProfile");
const razorpayPennydrop_service_1 = require("./razorpayPennydrop.service");
// import { UpiverificationResult } from "../../types/generic.types";
// import { razorpayApi } from "../../utils/razorpay";
// import { AxiosError } from "axios";
// import { cashfreeApi } from "../../utils/cashfree";
// Razorpay Penny Drop Verification
const addBankAccount = async (userId, data, mode = 'manual') => {
    const { bankName, branch, upiId, accountNumber, accountType, chequeImageUrl, ifsc, accountHolder, } = data;
    const isUPIMode = !!upiId && !accountNumber;
    const isBankMode = !!accountNumber;
    if (isUPIMode) {
        if (!accountHolder || !upiId)
            throw new classes_1.HttpError(400, 'UPI ID and account holder are required');
    }
    else if (isBankMode) {
        const missing = [
            !bankName && 'bankName',
            !branch && 'branch',
            !ifsc && 'ifsc',
            !accountType && 'accountType',
            !accountNumber && 'accountNumber',
            !accountHolder && 'accountHolder',
            // !chequeImageUrl && "chequeImageUrl",
        ].filter(Boolean);
        if (missing.length)
            throw new classes_1.HttpError(400, `Missing required fields: ${missing.join(', ')}`);
    }
    else {
        throw new classes_1.HttpError(400, 'Provide either upiId or full bank details');
    }
    return client_1.db.transaction(async (tx) => {
        const duplicate = await tx
            .select()
            .from(bankAccounts_1.bankAccounts)
            .where(isUPIMode
            ? (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(bankAccounts_1.bankAccounts.userId, userId), (0, drizzle_orm_1.eq)(bankAccounts_1.bankAccounts.upiId, upiId))
            : (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(bankAccounts_1.bankAccounts.userId, userId), (0, drizzle_orm_1.eq)(bankAccounts_1.bankAccounts.accountNumber, accountNumber), (0, drizzle_orm_1.eq)(bankAccounts_1.bankAccounts.ifsc, ifsc)))
            .limit(1);
        if (duplicate.length > 0) {
            throw new classes_1.HttpError(409, 'This UPI ID or Bank Account is already added');
        }
        const existing = await tx.select().from(bankAccounts_1.bankAccounts).where((0, drizzle_orm_1.eq)(bankAccounts_1.bankAccounts.userId, userId));
        const hasPrimary = existing.some((b) => b.isPrimary);
        let status = 'pending';
        let fundAccountId = null;
        if (mode === 'pennyDrop' && isBankMode) {
            const result = await (0, razorpayPennydrop_service_1.pennyDropVerifyLive)({
                name: accountHolder,
                ifsc,
                accountNumber,
            });
            fundAccountId = result.fundAccountId;
            status = 'pending'; // Always pending — webhook updates later
        }
        const [inserted] = await tx
            .insert(bankAccounts_1.bankAccounts)
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
            .returning();
        const updated = [...existing, inserted];
        const primary = updated.find((b) => b.isPrimary) || null;
        await tx
            .update(userProfile_1.userProfiles)
            .set({
            bankDetails: {
                count: updated.length,
                primaryAccount: primary,
            },
        })
            .where((0, drizzle_orm_1.eq)(userProfile_1.userProfiles.userId, userId));
    });
};
exports.addBankAccount = addBankAccount;
const getBankAccounts = async (userId) => {
    const accounts = await client_1.db.select().from(bankAccounts_1.bankAccounts).where((0, drizzle_orm_1.eq)(bankAccounts_1.bankAccounts.userId, userId));
    if (!accounts.length) {
        // You could throw an error here:
        // throw new HttpError(404, "No bank accounts found");
        // But since you want to return an empty array instead:
        return [];
    }
    return accounts;
};
exports.getBankAccounts = getBankAccounts;
async function markBankVerified(fundAccountId) {
    await client_1.db.transaction(async (tx) => {
        // 1. Update status
        const [updated] = await tx
            .update(bankAccounts_1.bankAccounts)
            .set({ status: 'verified', rejectionReason: null })
            .where((0, drizzle_orm_1.eq)(bankAccounts_1.bankAccounts.fundAccountId, fundAccountId))
            .returning();
        if (!updated)
            return; // no record found—ignore
        // 2. Recompute bankDetails summary for that user
        const all = await tx.select().from(bankAccounts_1.bankAccounts).where((0, drizzle_orm_1.eq)(bankAccounts_1.bankAccounts.userId, updated.userId));
        const primary = all.find((b) => b.isPrimary) || null;
        await tx
            .update(userProfile_1.userProfiles)
            .set({
            bankDetails: {
                count: all.length,
                primaryAccount: primary,
            },
        })
            .where((0, drizzle_orm_1.eq)(userProfile_1.userProfiles.userId, updated.userId));
    });
}
/**
 * Mark a bank account as rejected with reason.
 * ─────────────────────────────────────────────────────
 * 1. status → "rejected"
 * 2. Store rejectionReason
 */
async function markBankRejected(fundAccountId, reason) {
    await client_1.db
        .update(bankAccounts_1.bankAccounts)
        .set({ status: 'rejected', rejectionReason: reason ?? 'Validation failed' })
        .where((0, drizzle_orm_1.eq)(bankAccounts_1.bankAccounts.fundAccountId, fundAccountId));
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
async function updateBankAccount(userId, accountId, patch) {
    return client_1.db.transaction(async (tx) => {
        /* ------------------------------------------------------------ 1. Fetch existing */
        const [existing] = await tx
            .select()
            .from(bankAccounts_1.bankAccounts)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(bankAccounts_1.bankAccounts.id, accountId), (0, drizzle_orm_1.eq)(bankAccounts_1.bankAccounts.userId, userId)))
            .limit(1);
        if (!existing)
            throw new Error('Bank account not found');
        /* ------------------------------------------------------------ 2. Uniqueness checks */
        if (patch.upiId && patch.upiId !== existing.upiId) {
            const [{ count }] = await tx
                .select({ count: (0, drizzle_orm_1.sql) `count(*)` })
                .from(bankAccounts_1.bankAccounts)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(bankAccounts_1.bankAccounts.upiId, patch.upiId), (0, drizzle_orm_1.eq)(bankAccounts_1.bankAccounts.userId, userId), (0, drizzle_orm_1.ne)(bankAccounts_1.bankAccounts.id, accountId)));
            if (count > 0)
                throw new Error('UPI ID already in use');
        }
        if (patch.accountNumber && patch.accountNumber !== existing.accountNumber) {
            const [{ count }] = await tx
                .select({ count: (0, drizzle_orm_1.sql) `count(*)` })
                .from(bankAccounts_1.bankAccounts)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(bankAccounts_1.bankAccounts.accountNumber, patch.accountNumber), (0, drizzle_orm_1.eq)(bankAccounts_1.bankAccounts.userId, userId), (0, drizzle_orm_1.ne)(bankAccounts_1.bankAccounts.id, accountId)));
            if (count > 0)
                throw new Error('Account number already in use');
        }
        /* ------------------------------------------------------------ 3. Detect sensitive changes */
        const coreChanged = (patch.upiId && patch.upiId !== existing.upiId) ||
            (patch.accountNumber && patch.accountNumber !== existing.accountNumber) ||
            (patch.ifsc && patch.ifsc !== existing.ifsc);
        const nextStatus = coreChanged ? 'pending' : existing.status;
        /* ------------------------------------------------------------ 4. Ensure single primary */
        if (patch.isPrimary === true && existing.isPrimary === false) {
            await tx
                .update(bankAccounts_1.bankAccounts)
                .set({ isPrimary: false })
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(bankAccounts_1.bankAccounts.userId, userId), (0, drizzle_orm_1.eq)(bankAccounts_1.bankAccounts.isPrimary, true)));
        }
        /* ------------------------------------------------------------ 5. Build & apply update (fundAccountId untouched) */
        const updatePayload = {
            ...patch,
            status: nextStatus,
        };
        delete updatePayload.fundAccountId; // keep whatever is already there
        await tx
            .update(bankAccounts_1.bankAccounts)
            .set(updatePayload)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(bankAccounts_1.bankAccounts.id, accountId), (0, drizzle_orm_1.eq)(bankAccounts_1.bankAccounts.userId, userId)));
        /* ------------------------------------------------------------ 6. Refresh user_profiles.bankDetails */
        const all = await tx.select().from(bankAccounts_1.bankAccounts).where((0, drizzle_orm_1.eq)(bankAccounts_1.bankAccounts.userId, userId));
        const primary = all.find((b) => b.isPrimary) ?? null;
        await tx
            .update(userProfile_1.userProfiles)
            .set({
            bankDetails: {
                count: all.length,
                primaryAccount: primary,
            },
        })
            .where((0, drizzle_orm_1.eq)(userProfile_1.userProfiles.userId, userId));
        /* ------------------------------------------------------------ 7. Return latest */
        const [updated] = await tx
            .select()
            .from(bankAccounts_1.bankAccounts)
            .where((0, drizzle_orm_1.eq)(bankAccounts_1.bankAccounts.id, accountId))
            .limit(1);
        return updated;
    });
}
async function deleteBankAccount(userId, accountId) {
    // 1. Fetch record
    const [account] = await client_1.db
        .select()
        .from(bankAccounts_1.bankAccounts)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(bankAccounts_1.bankAccounts.id, accountId), (0, drizzle_orm_1.eq)(bankAccounts_1.bankAccounts.userId, userId)))
        .limit(1);
    if (!account)
        throw new Error('Bank account not found');
    if (account.isPrimary && account.status === 'verified') {
        throw new Error('Cannot delete a primary verified account. Please set another account as primary first.');
    }
    // 2. Delete
    await client_1.db
        .delete(bankAccounts_1.bankAccounts)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(bankAccounts_1.bankAccounts.id, accountId), (0, drizzle_orm_1.eq)(bankAccounts_1.bankAccounts.userId, userId)));
    return { id: accountId };
}
const getBankAccountsByUserId = async (userId) => {
    const accounts = await client_1.db.select().from(bankAccounts_1.bankAccounts).where((0, drizzle_orm_1.eq)(bankAccounts_1.bankAccounts.userId, userId));
    if (!accounts.length) {
        // return empty array if none found
        return [];
    }
    return accounts;
};
exports.getBankAccountsByUserId = getBankAccountsByUserId;
async function updateBankAccountStatusById(userId, accountId, status, rejectionReason) {
    // 1. Fetch the bank account, verify ownership
    const [account] = await client_1.db
        .select()
        .from(bankAccounts_1.bankAccounts)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(bankAccounts_1.bankAccounts.id, accountId), (0, drizzle_orm_1.eq)(bankAccounts_1.bankAccounts.userId, userId)))
        .limit(1);
    if (!account) {
        throw new classes_1.HttpError(404, 'Bank account not found for this user');
    }
    // 2. Update status and rejection reason
    await client_1.db
        .update(bankAccounts_1.bankAccounts)
        .set({
        status,
        rejectionReason: status === 'rejected' ? rejectionReason ?? 'Validation failed' : null,
    })
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(bankAccounts_1.bankAccounts.id, accountId), (0, drizzle_orm_1.eq)(bankAccounts_1.bankAccounts.userId, userId)));
    // 3. Refresh user's bankDetails summary in userProfiles
    const allAccounts = await client_1.db.select().from(bankAccounts_1.bankAccounts).where((0, drizzle_orm_1.eq)(bankAccounts_1.bankAccounts.userId, userId));
    const primaryAccount = allAccounts.find((acc) => acc.isPrimary) || null;
    await client_1.db
        .update(userProfile_1.userProfiles)
        .set({
        bankDetails: {
            count: allAccounts.length,
            primaryAccount: primaryAccount,
        },
    })
        .where((0, drizzle_orm_1.eq)(userProfile_1.userProfiles.userId, userId));
}

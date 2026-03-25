"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.removeBankAccount = exports.editBankAccount = exports.getBankAccountsHandler = exports.addBankAccountHandler = void 0;
const bankAccount_service_1 = require("../models/services/bankAccount.service");
const addBankAccountHandler = async (req, res) => {
    try {
        const userId = req.user.sub;
        const mode = req.body.mode ?? 'manual';
        await (0, bankAccount_service_1.addBankAccount)(userId, req.body, mode);
        return res.status(201).json({ message: 'Bank account added' });
    }
    catch (err) {
        const e = err;
        console.error(e);
        return res.status(e.statusCode ?? 500).json({ error: e.message });
    }
};
exports.addBankAccountHandler = addBankAccountHandler;
const getBankAccountsHandler = async (req, res) => {
    try {
        const userId = req.user.sub;
        const accounts = await (0, bankAccount_service_1.getBankAccounts)(userId);
        return res.status(200).json({ accounts });
    }
    catch (error) {
        console.error(error);
        return res.status(500).json({ error: 'Failed to fetch accounts' });
    }
};
exports.getBankAccountsHandler = getBankAccountsHandler;
// export const verifyUpiController = async (
//   req: any,
//   res: Response
// ): Promise<any> => {
//   const { vpa } = req.body;
//   if (!vpa) return res.status(400).json({ message: "VPA is required" });
//   try {
//     const result = await validateVPA(vpa);
//     res.json(result);
//   } catch (err) {
//     res.status(500).json({ message: (err as Error).message });
//   }
// };
/**
 * PATCH /api/bank-account/:id
 * Authenticated user can update their own bank account.
 * fundAccountId is ignored, and status is auto-handled.
 */
const editBankAccount = async (req, res) => {
    const userId = req.user.sub; // from requireAuth middleware
    const accountId = req.params.id;
    const patch = req.body;
    // 🧼 Allow only editable fields
    const allowedFields = [
        'bankName',
        'branch',
        'accountHolder',
        'upiId',
        'accountNumber',
        'accountType',
        'ifsc',
        'chequeImageUrl',
        'isPrimary',
    ];
    const sanitized = {};
    for (const key of allowedFields) {
        if (patch[key] !== undefined)
            sanitized[key] = patch[key];
    }
    try {
        const updated = await (0, bankAccount_service_1.updateBankAccount)(userId, accountId, sanitized);
        return res.json({ account: updated });
    }
    catch (err) {
        console.error('Bank account update error:', err);
        return res.status(400).json({ message: err.message });
    }
};
exports.editBankAccount = editBankAccount;
const removeBankAccount = async (req, res) => {
    const userId = req.user.sub; // from requireAuth middleware
    const { id } = req.params;
    try {
        await (0, bankAccount_service_1.deleteBankAccount)(userId, id);
        return res.status(204).send(); // No Content
    }
    catch (err) {
        return res.status(400).json({ message: err.message });
    }
};
exports.removeBankAccount = removeBankAccount;

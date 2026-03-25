"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getWalletTransactionsController = exports.getUserWalletBalance = void 0;
const wallet_service_1 = require("../models/services/wallet.service");
const walletTopupService_1 = require("../models/services/walletTopupService");
const getUserWalletBalance = async (req, res) => {
    try {
        const userId = req.user?.sub;
        if (!userId)
            return res.status(401).json({ error: 'Unauthorized' });
        const balance = await (0, walletTopupService_1.walletOfUser)(userId);
        res.status(200).json({ message: 'success', data: { ...balance } });
    }
    catch (error) {
        console.error('Wallet balance error:', error);
        res.status(404).json({ error: 'Wallet not found' });
    }
};
exports.getUserWalletBalance = getUserWalletBalance;
const getWalletTransactionsController = async (req, res) => {
    try {
        const userId = req.user?.sub; // assuming you set user in middleware
        if (!userId)
            return res.status(401).json({ message: 'Unauthorized' });
        const { limit = 50, page = 1, type, // 'credit' | 'debit'
        dateFrom, // ISO string
        dateTo, // ISO string
         } = req.query;
        const offset = (Number(page) - 1) * Number(limit);
        const transactions = await (0, wallet_service_1.getUserWalletTransactions)({
            userId,
            limit: Number(limit),
            offset,
            type: type,
            dateFrom: dateFrom ? new Date(dateFrom) : undefined,
            dateTo: dateTo ? new Date(dateTo) : undefined,
        });
        return res.status(200).json(transactions);
    }
    catch (err) {
        console.error('Error fetching wallet transactions:', err);
        return res.status(500).json({ message: 'Something went wrong', error: err.message });
    }
};
exports.getWalletTransactionsController = getWalletTransactionsController;

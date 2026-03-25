"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.adjustWalletBalance = exports.getWalletTransactions = exports.getWallet = exports.listWallets = void 0;
const adminWallet_service_1 = require("../../models/services/adminWallet.service");
const wallet_service_1 = require("../../models/services/wallet.service");
const listWallets = async (req, res) => {
    try {
        const page = parseInt(req.query.page || '1');
        const limit = parseInt(req.query.limit || '20');
        const search = req.query.search || '';
        const sortBy = req.query.sortBy ||
            'updatedAt';
        const sortOrder = req.query.sortOrder || 'desc';
        const result = await (0, adminWallet_service_1.getAllWallets)({
            page,
            limit,
            search,
            sortBy,
            sortOrder,
        });
        res.status(200).json({ success: true, ...result });
    }
    catch (error) {
        console.error('Error fetching wallets:', error);
        res.status(500).json({ success: false, message: 'Server error fetching wallets' });
    }
};
exports.listWallets = listWallets;
const getWallet = async (req, res) => {
    try {
        const { userId } = req.params;
        if (!userId) {
            return res.status(400).json({ success: false, message: 'User ID is required' });
        }
        const wallet = await (0, adminWallet_service_1.getWalletByUserId)(userId);
        res.status(200).json({ success: true, data: wallet });
    }
    catch (error) {
        console.error('Error fetching wallet:', error);
        if (error.message === 'Wallet not found for this user') {
            return res.status(404).json({ success: false, message: error.message });
        }
        res.status(500).json({ success: false, message: 'Server error fetching wallet' });
    }
};
exports.getWallet = getWallet;
const getWalletTransactions = async (req, res) => {
    try {
        const { userId } = req.params;
        if (!userId) {
            return res.status(400).json({ success: false, message: 'User ID is required' });
        }
        const page = parseInt(req.query.page || '1');
        const limit = parseInt(req.query.limit || '50');
        const type = req.query.type;
        const dateFrom = req.query.dateFrom ? new Date(req.query.dateFrom) : undefined;
        const dateTo = req.query.dateTo ? new Date(req.query.dateTo) : undefined;
        const result = await (0, adminWallet_service_1.getWalletTransactionsByUserId)({
            userId,
            page,
            limit,
            type,
            dateFrom,
            dateTo,
        });
        res.status(200).json({ success: true, ...result });
    }
    catch (error) {
        console.error('Error fetching wallet transactions:', error);
        if (error.message === 'Wallet not found for this user') {
            return res.status(404).json({ success: false, message: error.message });
        }
        res.status(500).json({ success: false, message: 'Server error fetching wallet transactions' });
    }
};
exports.getWalletTransactions = getWalletTransactions;
const adjustWalletBalance = async (req, res) => {
    try {
        const { userId } = req.params;
        const { type, amount, reason, notes } = req.body;
        if (!userId || !type || !amount || !reason) {
            return res.status(400).json({
                success: false,
                message: 'userId, type, amount, and reason are required',
            });
        }
        if (type !== 'credit' && type !== 'debit') {
            return res.status(400).json({
                success: false,
                message: 'type must be either "credit" or "debit"',
            });
        }
        const amountNum = parseFloat(amount);
        if (isNaN(amountNum) || amountNum <= 0) {
            return res.status(400).json({
                success: false,
                message: 'amount must be a positive number',
            });
        }
        // Get wallet
        const wallet = await (0, adminWallet_service_1.getWalletByUserId)(userId);
        // Create transaction
        await (0, wallet_service_1.createWalletTransaction)({
            walletId: wallet.id,
            amount: amountNum,
            type: type,
            reason: reason,
            ref: `admin_adjustment_${Date.now()}`,
            meta: {
                adjustedBy: req.user?.sub,
                notes: notes || '',
                timestamp: new Date().toISOString(),
            },
        });
        // Get updated wallet
        const updatedWallet = await (0, adminWallet_service_1.getWalletByUserId)(userId);
        res.status(200).json({
            success: true,
            message: `Wallet ${type === 'credit' ? 'credited' : 'debited'} successfully`,
            data: updatedWallet,
        });
    }
    catch (error) {
        console.error('Error adjusting wallet balance:', error);
        if (error.message === 'Wallet not found for this user') {
            return res.status(404).json({ success: false, message: error.message });
        }
        if (error.message === 'Insufficient wallet balance') {
            return res.status(400).json({ success: false, message: error.message });
        }
        res.status(500).json({ success: false, message: 'Server error adjusting wallet balance' });
    }
};
exports.adjustWalletBalance = adjustWalletBalance;

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPaymentOptionsController = getPaymentOptionsController;
exports.updatePaymentOptionsController = updatePaymentOptionsController;
const paymentOptions_service_1 = require("../models/services/paymentOptions.service");
/**
 * Get payment options settings (public endpoint)
 * GET /api/payment-options
 */
async function getPaymentOptionsController(req, res) {
    try {
        const settings = await (0, paymentOptions_service_1.getPaymentOptions)();
        return res.json({
            codEnabled: settings.codEnabled,
            prepaidEnabled: settings.prepaidEnabled,
            minWalletRecharge: settings.minWalletRecharge ?? 0,
        });
    }
    catch (error) {
        console.error('Error getting payment options:', error);
        return res.status(500).json({ error: error.message || 'Failed to fetch payment options' });
    }
}
/**
 * Update payment options settings (admin only)
 * PUT /api/admin/payment-options
 */
async function updatePaymentOptionsController(req, res) {
    try {
        const { codEnabled, prepaidEnabled, minWalletRecharge } = req.body;
        if (codEnabled === undefined &&
            prepaidEnabled === undefined &&
            (minWalletRecharge === undefined || minWalletRecharge === null)) {
            return res
                .status(400)
                .json({ error: 'At least one field (codEnabled, prepaidEnabled, minWalletRecharge) must be provided' });
        }
        if (minWalletRecharge !== undefined && minWalletRecharge !== null) {
            const value = Number(minWalletRecharge);
            if (!Number.isFinite(value) || value < 0) {
                return res.status(400).json({ error: 'minWalletRecharge must be a non-negative number' });
            }
        }
        const updates = {};
        if (codEnabled !== undefined) {
            updates.codEnabled = Boolean(codEnabled);
        }
        if (prepaidEnabled !== undefined) {
            updates.prepaidEnabled = Boolean(prepaidEnabled);
        }
        if (minWalletRecharge !== undefined && minWalletRecharge !== null) {
            updates.minWalletRecharge = Number(minWalletRecharge);
        }
        const settings = await (0, paymentOptions_service_1.updatePaymentOptions)(updates);
        return res.json({
            success: true,
            settings: {
                codEnabled: settings.codEnabled,
                prepaidEnabled: settings.prepaidEnabled,
                minWalletRecharge: settings.minWalletRecharge ?? 0,
            },
        });
    }
    catch (error) {
        console.error('Error updating payment options:', error);
        return res.status(500).json({ error: error.message || 'Failed to update payment options' });
    }
}

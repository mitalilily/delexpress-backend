"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.confirmFromClient = exports.createTopup = void 0;
const walletTopupService_1 = require("../models/services/walletTopupService");
const paymentOptions_service_1 = require("../models/services/paymentOptions.service");
const createTopup = async (req, res) => {
    const amt = Number(req.body.amount);
    const { name, email, phone } = req.body;
    if (!amt || amt <= 0) {
        return res.status(400).json({ error: 'Invalid amount' });
    }
    if (!name || !email || !phone) {
        return res.status(400).json({ error: 'Missing customer details' });
    }
    try {
        // Enforce minimum wallet recharge amount (if configured)
        const paymentSettings = await (0, paymentOptions_service_1.getPaymentOptions)();
        const minWalletRecharge = paymentSettings.minWalletRecharge ?? 0;
        if (minWalletRecharge > 0 && amt < minWalletRecharge) {
            return res.status(400).json({
                error: `Minimum wallet recharge amount is ₹${minWalletRecharge}`,
                minWalletRecharge,
            });
        }
        const userId = req.user?.sub;
        // Razorpay order creation
        const data = await (0, walletTopupService_1.createWalletOrder)(userId, amt, { name, email, phone });
        // returns { orderId, amount, currency, key, name, description, prefill, theme }
        res.status(201).json(data);
    }
    catch (err) {
        console.error('Razorpay top-up error:', err);
        res.status(500).json({ error: 'Top-up failed' });
    }
};
exports.createTopup = createTopup;
const confirmFromClient = async (req, res) => {
    const { orderId, paymentId } = req.body;
    // Optional: lookup payment via Razorpay REST here
    await (0, walletTopupService_1.markTopupProcessing)(orderId, paymentId);
    res.json({ ok: true });
};
exports.confirmFromClient = confirmFromClient;

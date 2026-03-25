"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.quoteReverse = exports.createReversePickup = void 0;
const shiprocket_service_1 = require("../models/services/shiprocket.service");
const reverse_service_1 = require("../models/services/reverse.service");
const client_1 = require("../models/client");
const wallet_1 = require("../models/schema/wallet");
const drizzle_orm_1 = require("drizzle-orm");
const wallet_service_1 = require("../models/services/wallet.service");
const createReversePickup = async (req, res) => {
    try {
        const userId = req.user?.sub;
        const body = req.body || {};
        const payload = {
            ...body,
            payment_type: 'reverse',
        };
        // Quote reverse charge and debit wallet
        let reverseCharge = 0;
        try {
            const orderId = body?.original_order_id || body?.order_id || body?.orderId;
            if (orderId) {
                const quote = await (0, reverse_service_1.quoteReverseForOrder)(orderId, Number(body?.package_weight));
                reverseCharge = Number(quote.rate || 0);
                payload.selected_max_slab_weight = quote.max_slab_weight ?? undefined;
                payload.freight_charges = reverseCharge;
            }
        }
        catch (e) {
            // optional: keep zero if not found
        }
        if (reverseCharge > 0) {
            const [userWallet] = await client_1.db.select().from(wallet_1.wallets).where((0, drizzle_orm_1.eq)(wallet_1.wallets.userId, userId)).limit(1);
            if (!userWallet)
                throw new Error('Wallet not found');
            if (Number(userWallet.balance || 0) < reverseCharge) {
                return res.status(400).json({ success: false, message: 'Insufficient wallet balance for reverse shipment' });
            }
            await (0, wallet_service_1.createWalletTransaction)({ walletId: userWallet.id, amount: reverseCharge, type: 'debit', reason: 'reverse_shipment', meta: { order_number: payload.order_number } });
            payload.shipping_charges = reverseCharge;
        }
        const shipment = await (0, shiprocket_service_1.createB2CShipmentService)(payload, userId);
        res.status(200).json({ success: true, shipment });
    }
    catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};
exports.createReversePickup = createReversePickup;
const quoteReverse = async (req, res) => {
    try {
        const { orderId, weightGrams } = req.body;
        if (!orderId)
            return res.status(400).json({ success: false, message: 'orderId required' });
        const quote = await (0, reverse_service_1.quoteReverseForOrder)(orderId, weightGrams ? Number(weightGrams) : undefined);
        return res.json({ success: true, quote });
    }
    catch (e) {
        return res.status(400).json({ success: false, message: e.message });
    }
};
exports.quoteReverse = quoteReverse;

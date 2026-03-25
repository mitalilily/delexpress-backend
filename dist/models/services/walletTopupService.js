"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.walletOfUser = walletOfUser;
exports.createWalletOrder = createWalletOrder;
exports.confirmSuccess = confirmSuccess;
exports.confirmFailure = confirmFailure;
exports.markTopupProcessing = markTopupProcessing;
const drizzle_orm_1 = require("drizzle-orm");
const razorpay_1 = require("../../utils/razorpay");
const client_1 = require("../client");
const wallet_1 = require("../schema/wallet");
const wallet_service_1 = require("./wallet.service");
const dotenv = __importStar(require("dotenv"));
const path_1 = __importDefault(require("path"));
// Load correct .env based on NODE_ENV
const env = process.env.NODE_ENV || 'development';
dotenv.config({ path: path_1.default.resolve(__dirname, `../../.env.${env}`) });
/* helper */
async function walletOfUser(userId, tx = client_1.db) {
    const w = await tx?.query.wallets.findFirst({
        where: (0, drizzle_orm_1.eq)(wallet_1.wallets.userId, userId),
    });
    if (!w)
        throw new Error('Wallet not found');
    return w;
}
async function createWalletOrder(userId, amount, details) {
    const wallet = await walletOfUser(userId);
    // Generate unique order ID
    const orderId = `wallet_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    // Create Razorpay order
    const razorpayOrder = await razorpay_1.razorpay.orders.create({
        amount: Math.round(amount * 100), // Convert to paise
        currency: wallet.currency ?? 'INR',
        receipt: orderId,
        notes: {
            userId,
            walletId: wallet.id,
            type: 'wallet_recharge',
        },
    });
    // Insert into walletTopups as "created"
    await client_1.db.insert(wallet_1.walletTopups).values({
        walletId: wallet.id,
        amount,
        currency: wallet.currency ?? 'INR',
        gatewayOrderId: razorpayOrder.id,
        status: 'created',
    });
    // Get the correct key based on mode (same logic as razorpay.ts)
    const MODE = process.env.RAZORPAY_MODE ??
        (process.env.NODE_ENV === 'production' ? 'live' : 'test');
    const keyId = MODE === 'live' ? process.env.RAZORPAY_KEY_ID_PROD : process.env.RAZORPAY_KEY_ID;
    // Return Razorpay order details for frontend
    return {
        orderId: razorpayOrder.id,
        amount: razorpayOrder.amount,
        currency: razorpayOrder.currency,
        key: keyId,
        name: 'DelExpress',
        description: 'Wallet Recharge',
        prefill: {
            name: details.name,
            email: details.email,
            contact: details.phone,
        },
        theme: {
            color: '#4b8e40',
        },
    };
}
/* 2️⃣  success */
async function confirmSuccess(orderId, paymentId, paise) {
    const amount = paise / 100;
    // Handle both 'created' and 'processing' statuses (frontend may mark as processing first)
    const [row] = await client_1.db
        .update(wallet_1.walletTopups)
        .set({
        status: 'success',
        gatewayPaymentId: paymentId,
        updatedAt: new Date(),
    })
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(wallet_1.walletTopups.gatewayOrderId, orderId), (0, drizzle_orm_1.or)((0, drizzle_orm_1.eq)(wallet_1.walletTopups.status, 'created'), (0, drizzle_orm_1.eq)(wallet_1.walletTopups.status, 'processing'))))
        .returning();
    if (!row) {
        console.error('❌ Topup not found for order:', orderId);
        return;
    }
    // Create wallet transaction
    await (0, wallet_service_1.createWalletTransaction)({
        walletId: row.walletId,
        amount: row.amount,
        currency: row.currency ?? 'INR',
        type: 'credit',
        ref: paymentId,
        reason: 'Wallet Recharge',
        meta: { orderId, gateway: 'razorpay' },
    });
}
/* 3️⃣  failure */
async function confirmFailure(orderId, paymentId, reason) {
    await client_1.db
        .update(wallet_1.walletTopups)
        .set({
        status: 'failed',
        gatewayPaymentId: paymentId,
        meta: { reason },
        updatedAt: new Date(),
    })
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(wallet_1.walletTopups.gatewayOrderId, orderId), (0, drizzle_orm_1.or)((0, drizzle_orm_1.eq)(wallet_1.walletTopups.status, 'created'), (0, drizzle_orm_1.eq)(wallet_1.walletTopups.status, 'processing'))))
        .returning();
}
/* 4️⃣  hmac */
async function markTopupProcessing(orderId, paymentId) {
    await client_1.db
        .update(wallet_1.walletTopups)
        .set({
        status: 'processing',
        gatewayPaymentId: paymentId,
        updatedAt: new Date(),
    })
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(wallet_1.walletTopups.gatewayOrderId, orderId), (0, drizzle_orm_1.eq)(wallet_1.walletTopups.status, 'created')));
}

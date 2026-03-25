"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.razorpayWebhook = void 0;
const bankAccount_service_1 = require("../../models/services/bankAccount.service");
const walletTopupService_1 = require("../../models/services/walletTopupService");
const razorpay_1 = require("../../utils/razorpay");
const razorpayWebhook = async (req, res) => {
    const timestamp = new Date().toISOString();
    const payload = req.body;
    const event = payload.event;
    const sig = req.headers['x-razorpay-signature'];
    const rawBody = JSON.stringify(payload);
    console.log('='.repeat(80));
    console.log(`📦 [${timestamp}] Razorpay Webhook Received`);
    console.log(`   Event: ${event || 'unknown'}`);
    console.log(`   IP: ${req.ip || req.socket.remoteAddress || 'unknown'}`);
    console.log(`   Signature Present: ${!!sig}`);
    console.log(`   Headers:`, JSON.stringify(req.headers, null, 2));
    console.log(`   Full Payload:`, JSON.stringify(payload, null, 2));
    console.log('='.repeat(80));
    if (!(0, razorpay_1.isValidSig)(rawBody, sig)) {
        console.error(`❌ Razorpay webhook rejected: Invalid signature`);
        return res.status(400).send('Invalid signature');
    }
    console.log(`✅ Razorpay webhook signature verified`);
    try {
        console.log(`🔄 Processing Razorpay webhook event: ${event}`);
        switch (event) {
            case 'payment.captured': {
                const pay = payload.payload.payment.entity;
                console.log(`   Processing payment.captured - Order ID: ${pay.order_id}, Payment ID: ${pay.id}, Amount: ${pay.amount}`);
                await (0, walletTopupService_1.confirmSuccess)(pay.order_id, pay.id, +pay.amount);
                console.log(`✅ Payment captured successfully for order: ${pay.order_id}`);
                break;
            }
            case 'payment.failed': {
                const pay = payload.payload.payment.entity;
                console.log(`   Processing payment.failed - Order ID: ${pay.order_id}, Payment ID: ${pay.id}, Error: ${pay.error_description}`);
                await (0, walletTopupService_1.confirmFailure)(pay.order_id, pay.id, pay.error_description);
                console.log(`✅ Payment failure recorded for order: ${pay.order_id}`);
                break;
            }
            case 'fund.account.validation.completed': {
                const validation = payload.payload.fund_account_validation.entity;
                console.log(`   Processing fund.account.validation.completed - Fund Account ID: ${validation.fund_account_id}, Status: ${validation.status}`);
                if (validation.status === 'success') {
                    // ✅ Verified bank account
                    await (0, bankAccount_service_1.markBankVerified)(validation.fund_account_id);
                    console.log(`✅ Bank account verified: ${validation.fund_account_id}`);
                }
                else {
                    // ❌ Rejected
                    const reason = validation.results?.reason_description ||
                        validation.results?.reason ||
                        'Unknown failure';
                    await (0, bankAccount_service_1.markBankRejected)(validation.fund_account_id, reason);
                    console.log(`❌ Bank account rejected: ${validation.fund_account_id}, Reason: ${reason}`);
                }
                break;
            }
            default:
                console.warn(`⚠️ Unhandled Razorpay webhook event: ${event}`);
        }
        console.log(`✅ Razorpay webhook processed successfully`);
        res.json({ received: true });
    }
    catch (error) {
        console.error('='.repeat(80));
        console.error(`❌ [${timestamp}] Razorpay webhook error for event: ${event || 'unknown'}`);
        console.error(`   Error Message: ${error?.message || error}`);
        console.error(`   Error Stack:`, error?.stack);
        console.error(`   Payload:`, JSON.stringify(payload, null, 2));
        console.error('='.repeat(80));
        res.status(500).json({ error: 'Internal webhook handler error' });
    }
};
exports.razorpayWebhook = razorpayWebhook;

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
exports.applyWeightDiscrepancyCharge = applyWeightDiscrepancyCharge;
exports.refundWeightDiscrepancyCharge = refundWeightDiscrepancyCharge;
exports.checkWalletBalance = checkWalletBalance;
const dotenv = __importStar(require("dotenv"));
const drizzle_orm_1 = require("drizzle-orm");
const nodemailer_1 = __importDefault(require("nodemailer"));
const path_1 = __importDefault(require("path"));
const schema_1 = require("../../schema/schema");
const client_1 = require("../client");
const wallet_1 = require("../schema/wallet");
const wallet_service_1 = require("./wallet.service");
const env = process.env.NODE_ENV || 'development';
dotenv.config({ path: path_1.default.resolve(__dirname, '../../.env.${env}') });
const EMAIL_FROM = process.env.EMAIL_FROM || 'noreply@DelExpress.in';
const GOOGLE_SMTP_USER = process.env.GOOGLE_SMTP_USER || EMAIL_FROM;
const GOOGLE_SMTP_PASSWORD = process.env.GOOGLE_SMTP_PASSWORD;
const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_SECURE = process.env.SMTP_SECURE === 'true';
/**
 * Send email via SMTP (Hostinger/custom SMTP if provided, else Gmail service)
 */
async function sendEmail(opts) {
    if (!GOOGLE_SMTP_PASSWORD) {
        console.warn('Google SMTP password not configured. Email not sent.');
        return;
    }
    const transporter = SMTP_HOST
        ? nodemailer_1.default.createTransport({
            host: SMTP_HOST,
            port: SMTP_PORT,
            secure: SMTP_SECURE,
            auth: {
                user: GOOGLE_SMTP_USER,
                pass: GOOGLE_SMTP_PASSWORD,
            },
        })
        : nodemailer_1.default.createTransport({
            service: 'gmail',
            auth: {
                user: GOOGLE_SMTP_USER,
                pass: GOOGLE_SMTP_PASSWORD, // Use App Password for Gmail
            },
        });
    const mailOptions = {
        from: `"DelExpress" <${EMAIL_FROM}>`,
        to: opts.to,
        subject: opts.subject,
        html: opts.html,
    };
    try {
        const info = await transporter.sendMail(mailOptions);
        console.log('Email sent successfully:', info.messageId);
    }
    catch (error) {
        console.error('Error sending email:', error);
        throw error;
    }
}
/**
 * Apply weight discrepancy charge to user's wallet
 */
async function applyWeightDiscrepancyCharge(discrepancyId, userId) {
    try {
        // Get discrepancy details
        const [discrepancy] = await client_1.db
            .select()
            .from(schema_1.weight_discrepancies)
            .where((0, drizzle_orm_1.eq)(schema_1.weight_discrepancies.id, discrepancyId))
            .limit(1);
        if (!discrepancy) {
            return { success: false, error: 'Discrepancy not found' };
        }
        const additionalCharge = Number(discrepancy.additional_charge || 0);
        if (additionalCharge <= 0) {
            return { success: true }; // No charge to apply
        }
        // Get user's wallet
        const [wallet] = await client_1.db.select().from(wallet_1.wallets).where((0, drizzle_orm_1.eq)(wallet_1.wallets.userId, userId)).limit(1);
        if (!wallet) {
            return { success: false, error: 'Wallet not found' };
        }
        // Check if sufficient balance
        const currentBalance = Number(wallet.balance || 0);
        if (currentBalance < additionalCharge) {
            return { success: false, error: 'Insufficient wallet balance' };
        }
        // Deduct from wallet
        await (0, wallet_service_1.createWalletTransaction)({
            walletId: wallet.id,
            amount: additionalCharge,
            type: 'debit',
            reason: `Weight discrepancy charge - Order ${discrepancy.order_number}`,
            ref: `weight_disc_${discrepancyId}`,
            meta: {
                discrepancy_id: discrepancyId,
                order_number: discrepancy.order_number,
                awb_number: discrepancy.awb_number,
                declared_weight: discrepancy.declared_weight,
                charged_weight: discrepancy.charged_weight,
                weight_difference: discrepancy.weight_difference,
            },
        });
        // Update discrepancy to mark charge as applied
        await client_1.db
            .update(schema_1.weight_discrepancies)
            .set({
            resolution_notes: (0, drizzle_orm_1.sql) `COALESCE(${schema_1.weight_discrepancies.resolution_notes}, '') || ' | Charge applied to wallet on ' || NOW()`,
            updated_at: new Date(),
        })
            .where((0, drizzle_orm_1.eq)(schema_1.weight_discrepancies.id, discrepancyId));
        // Send email notification
        const user = await client_1.db.query.users.findFirst({
            where: (users, { eq }) => eq(users.id, userId),
        });
        if (user?.email) {
            const newBalance = currentBalance - additionalCharge;
            await sendEmail({
                to: user.email,
                subject: '💰 Wallet Debited - Weight Discrepancy Charge',
                html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #333;">Wallet Transaction</h2>
            <p>Hi,</p>
            <p>₹${additionalCharge.toFixed(2)} has been debited from your wallet for weight discrepancy charges.</p>
            
            <div style="background: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
              <h3 style="margin-top: 0;">Transaction Details</h3>
              <p><strong>Order Number:</strong> ${discrepancy.order_number}</p>
              <p><strong>AWB:</strong> ${discrepancy.awb_number || 'N/A'}</p>
              <p><strong>Declared Weight:</strong> ${discrepancy.declared_weight} kg</p>
              <p><strong>Charged Weight:</strong> ${discrepancy.charged_weight} kg</p>
              <p><strong>Difference:</strong> ${discrepancy.weight_difference} kg</p>
              <p><strong>Amount Debited:</strong> ₹${additionalCharge.toFixed(2)}</p>
              <p><strong>Remaining Balance:</strong> ₹${newBalance.toFixed(2)}</p>
            </div>
            
            <p>If you believe this charge is incorrect, you can raise a dispute from your dashboard.</p>
            <p>Thank you!</p>
          </div>
        `,
            });
        }
        return { success: true };
    }
    catch (error) {
        console.error('Error applying weight discrepancy charge:', error);
        return { success: false, error: error.message };
    }
}
/**
 * Refund weight discrepancy charge to user's wallet (when dispute is approved)
 */
async function refundWeightDiscrepancyCharge(discrepancyId, userId, adminComment) {
    try {
        // Get discrepancy details
        const [discrepancy] = await client_1.db
            .select()
            .from(schema_1.weight_discrepancies)
            .where((0, drizzle_orm_1.eq)(schema_1.weight_discrepancies.id, discrepancyId))
            .limit(1);
        if (!discrepancy) {
            return { success: false, error: 'Discrepancy not found' };
        }
        const refundAmount = Number(discrepancy.additional_charge || 0);
        if (refundAmount <= 0) {
            return { success: true }; // No refund needed
        }
        // Get user's wallet
        const [wallet] = await client_1.db.select().from(wallet_1.wallets).where((0, drizzle_orm_1.eq)(wallet_1.wallets.userId, userId)).limit(1);
        if (!wallet) {
            return { success: false, error: 'Wallet not found' };
        }
        // Credit to wallet
        await (0, wallet_service_1.createWalletTransaction)({
            walletId: wallet.id,
            amount: refundAmount,
            type: 'credit',
            reason: `Weight dispute refund - Order ${discrepancy.order_number}`,
            ref: `weight_refund_${discrepancyId}`,
            meta: {
                discrepancy_id: discrepancyId,
                order_number: discrepancy.order_number,
                awb_number: discrepancy.awb_number,
                admin_comment: adminComment,
            },
        });
        // Update discrepancy
        await client_1.db
            .update(schema_1.weight_discrepancies)
            .set({
            resolution_notes: (0, drizzle_orm_1.sql) `COALESCE(${schema_1.weight_discrepancies.resolution_notes}, '') || ' | Refunded to wallet on ' || NOW()`,
            updated_at: new Date(),
        })
            .where((0, drizzle_orm_1.eq)(schema_1.weight_discrepancies.id, discrepancyId));
        // Send email notification
        const user = await client_1.db.query.users.findFirst({
            where: (users, { eq }) => eq(users.id, userId),
        });
        if (user?.email) {
            const newBalance = Number(wallet.balance) + refundAmount;
            await sendEmail({
                to: user.email,
                subject: '✅ Refund Processed - Weight Dispute Approved',
                html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #28a745;">Refund Processed</h2>
            <p>Hi,</p>
            <p>Good news! Your weight dispute has been approved and ₹${refundAmount.toFixed(2)} has been refunded to your wallet.</p>
            
            <div style="background: #e7f5ed; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #28a745;">
              <h3 style="margin-top: 0;">Refund Details</h3>
              <p><strong>Order Number:</strong> ${discrepancy.order_number}</p>
              <p><strong>AWB:</strong> ${discrepancy.awb_number || 'N/A'}</p>
              <p><strong>Refund Amount:</strong> ₹${refundAmount.toFixed(2)}</p>
              <p><strong>New Balance:</strong> ₹${newBalance.toFixed(2)}</p>
            </div>
            
            ${adminComment
                    ? `
            <div style="background: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
              <h4 style="margin-top: 0;">Admin Response:</h4>
              <p>${adminComment}</p>
            </div>
            `
                    : ''}
            
            <p>Thank you for your patience!</p>
          </div>
        `,
            });
        }
        return { success: true };
    }
    catch (error) {
        console.error('Error refunding weight discrepancy charge:', error);
        return { success: false, error: error.message };
    }
}
/**
 * Check if user has sufficient balance for weight charge
 */
async function checkWalletBalance(userId, requiredAmount) {
    const [wallet] = await client_1.db.select().from(wallet_1.wallets).where((0, drizzle_orm_1.eq)(wallet_1.wallets.userId, userId)).limit(1);
    if (!wallet) {
        return { sufficient: false, balance: 0 };
    }
    const balance = Number(wallet.balance || 0);
    return {
        sufficient: balance >= requiredAmount,
        balance,
    };
}

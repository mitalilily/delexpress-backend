import * as dotenv from 'dotenv'
import { eq, sql } from 'drizzle-orm'
import nodemailer from 'nodemailer'
import path from 'path'
import { weight_discrepancies } from '../../schema/schema'
import { db } from '../client'
import { wallets } from '../schema/wallet'
import { createWalletTransaction } from './wallet.service'

const env = process.env.NODE_ENV || 'development'
dotenv.config({ path: path.resolve(__dirname, '../../.env.${env}') })

const EMAIL_FROM = process.env.EMAIL_FROM || 'noreply@DelExpress.in'
const GOOGLE_SMTP_USER = process.env.GOOGLE_SMTP_USER || EMAIL_FROM
const GOOGLE_SMTP_PASSWORD = process.env.GOOGLE_SMTP_PASSWORD!
const SMTP_HOST = process.env.SMTP_HOST
const SMTP_PORT = Number(process.env.SMTP_PORT || 587)
const SMTP_SECURE = process.env.SMTP_SECURE === 'true'

/**
 * Send email via SMTP (Hostinger/custom SMTP if provided, else Gmail service)
 */
async function sendEmail(opts: { to: string; subject: string; html: string }) {
  if (!GOOGLE_SMTP_PASSWORD) {
    console.warn('Google SMTP password not configured. Email not sent.')
    return
  }

  const transporter = SMTP_HOST
    ? nodemailer.createTransport({
        host: SMTP_HOST,
        port: SMTP_PORT,
        secure: SMTP_SECURE,
        auth: {
          user: GOOGLE_SMTP_USER,
          pass: GOOGLE_SMTP_PASSWORD,
        },
      })
    : nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: GOOGLE_SMTP_USER,
          pass: GOOGLE_SMTP_PASSWORD, // Use App Password for Gmail
        },
      })

  const mailOptions = {
    from: `"DelExpress" <${EMAIL_FROM}>`,
    to: opts.to,
    subject: opts.subject,
    html: opts.html,
  }

  try {
    const info = await transporter.sendMail(mailOptions)
    console.log('Email sent successfully:', info.messageId)
  } catch (error) {
    console.error('Error sending email:', error)
    throw error
  }
}

/**
 * Apply weight discrepancy charge to user's wallet
 */
export async function applyWeightDiscrepancyCharge(
  discrepancyId: string,
  userId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    // Get discrepancy details
    const [discrepancy] = await db
      .select()
      .from(weight_discrepancies)
      .where(eq(weight_discrepancies.id, discrepancyId))
      .limit(1)

    if (!discrepancy) {
      return { success: false, error: 'Discrepancy not found' }
    }

    const additionalCharge = Number(discrepancy.additional_charge || 0)
    if (additionalCharge <= 0) {
      return { success: true } // No charge to apply
    }

    // Get user's wallet
    const [wallet] = await db.select().from(wallets).where(eq(wallets.userId, userId)).limit(1)

    if (!wallet) {
      return { success: false, error: 'Wallet not found' }
    }

    // Check if sufficient balance
    const currentBalance = Number(wallet.balance || 0)
    if (currentBalance < additionalCharge) {
      return { success: false, error: 'Insufficient wallet balance' }
    }

    // Deduct from wallet
    await createWalletTransaction({
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
    })

    // Update discrepancy to mark charge as applied
    await db
      .update(weight_discrepancies)
      .set({
        resolution_notes: sql`COALESCE(${weight_discrepancies.resolution_notes}, '') || ' | Charge applied to wallet on ' || NOW()`,
        updated_at: new Date(),
      })
      .where(eq(weight_discrepancies.id, discrepancyId))

    // Send email notification
    const user = await db.query.users.findFirst({
      where: (users, { eq }) => eq(users.id, userId),
    })

    if (user?.email) {
      const newBalance = currentBalance - additionalCharge
      await sendEmail({
        to: user.email,
        subject: '💰 Wallet Debited - Weight Discrepancy Charge',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #333;">Wallet Transaction</h2>
            <p>Hi,</p>
            <p>₹${additionalCharge.toFixed(
              2,
            )} has been debited from your wallet for weight discrepancy charges.</p>
            
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
      })
    }

    return { success: true }
  } catch (error: any) {
    console.error('Error applying weight discrepancy charge:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Refund weight discrepancy charge to user's wallet (when dispute is approved)
 */
export async function refundWeightDiscrepancyCharge(
  discrepancyId: string,
  userId: string,
  adminComment?: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    // Get discrepancy details
    const [discrepancy] = await db
      .select()
      .from(weight_discrepancies)
      .where(eq(weight_discrepancies.id, discrepancyId))
      .limit(1)

    if (!discrepancy) {
      return { success: false, error: 'Discrepancy not found' }
    }

    const refundAmount = Number(discrepancy.additional_charge || 0)
    if (refundAmount <= 0) {
      return { success: true } // No refund needed
    }

    // Get user's wallet
    const [wallet] = await db.select().from(wallets).where(eq(wallets.userId, userId)).limit(1)

    if (!wallet) {
      return { success: false, error: 'Wallet not found' }
    }

    // Credit to wallet
    await createWalletTransaction({
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
    })

    // Update discrepancy
    await db
      .update(weight_discrepancies)
      .set({
        resolution_notes: sql`COALESCE(${weight_discrepancies.resolution_notes}, '') || ' | Refunded to wallet on ' || NOW()`,
        updated_at: new Date(),
      })
      .where(eq(weight_discrepancies.id, discrepancyId))

    // Send email notification
    const user = await db.query.users.findFirst({
      where: (users, { eq }) => eq(users.id, userId),
    })

    if (user?.email) {
      const newBalance = Number(wallet.balance) + refundAmount
      await sendEmail({
        to: user.email,
        subject: '✅ Refund Processed - Weight Dispute Approved',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #28a745;">Refund Processed</h2>
            <p>Hi,</p>
            <p>Good news! Your weight dispute has been approved and ₹${refundAmount.toFixed(
              2,
            )} has been refunded to your wallet.</p>
            
            <div style="background: #e7f5ed; padding: 15px; border-radius: 5px; margin: 20px 0; border-left: 4px solid #28a745;">
              <h3 style="margin-top: 0;">Refund Details</h3>
              <p><strong>Order Number:</strong> ${discrepancy.order_number}</p>
              <p><strong>AWB:</strong> ${discrepancy.awb_number || 'N/A'}</p>
              <p><strong>Refund Amount:</strong> ₹${refundAmount.toFixed(2)}</p>
              <p><strong>New Balance:</strong> ₹${newBalance.toFixed(2)}</p>
            </div>
            
            ${
              adminComment
                ? `
            <div style="background: #f8f9fa; padding: 15px; border-radius: 5px; margin: 20px 0;">
              <h4 style="margin-top: 0;">Admin Response:</h4>
              <p>${adminComment}</p>
            </div>
            `
                : ''
            }
            
            <p>Thank you for your patience!</p>
          </div>
        `,
      })
    }

    return { success: true }
  } catch (error: any) {
    console.error('Error refunding weight discrepancy charge:', error)
    return { success: false, error: error.message }
  }
}

/**
 * Check if user has sufficient balance for weight charge
 */
export async function checkWalletBalance(
  userId: string,
  requiredAmount: number,
): Promise<{ sufficient: boolean; balance: number }> {
  const [wallet] = await db.select().from(wallets).where(eq(wallets.userId, userId)).limit(1)

  if (!wallet) {
    return { sufficient: false, balance: 0 }
  }

  const balance = Number(wallet.balance || 0)
  return {
    sufficient: balance >= requiredAmount,
    balance,
  }
}

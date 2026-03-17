import { and, desc, eq, gte, lte, or, sql } from 'drizzle-orm'
import { Request, Response } from 'express'
import { db } from '../../models/client'
import { presignDownload } from '../../models/services/upload.service'
import { createWalletTransaction } from '../../models/services/wallet.service'
import { sendDisputeUpdateEmail } from '../../models/services/weightReconciliationEmail.service'
import {
  users,
  wallets,
  walletTransactions,
  weight_adjustment_history,
  weight_discrepancies,
  weight_disputes,
} from '../../schema/schema'

/**
 * Helper: Extract R2 key from full R2 URL
 * Example: https://xxx.r2.cloudflarestorage.com/bucket-name/folder/file.mp4 -> folder/file.mp4
 */
function extractR2Key(url: string): string {
  try {
    // Parse the URL to get the path
    const urlObj = new URL(url)
    const pathParts = urlObj.pathname.split('/')
    // Remove empty strings and bucket name (first part after /)
    const [, bucketName, ...keyParts] = pathParts
    return keyParts.join('/')
  } catch (error) {
    console.error('Error extracting R2 key from URL:', url, error)
    return url // Return original if parsing fails
  }
}

/**
 * Get all weight discrepancies (admin view)
 */
export async function getAllDiscrepancies(req: Request, res: Response) {
  try {
    const { status, hasDispute, userId, fromDate, toDate, page = 1, limit = 50 } = req.query

    const conditions: any[] = []

    if (status) conditions.push(eq(weight_discrepancies.status, status as string))
    if (hasDispute === 'true') conditions.push(eq(weight_discrepancies.has_dispute, true))
    if (userId) conditions.push(eq(weight_discrepancies.user_id, userId as string))
    if (fromDate)
      conditions.push(gte(weight_discrepancies.created_at, new Date(fromDate as string)))
    if (toDate) conditions.push(lte(weight_discrepancies.created_at, new Date(toDate as string)))

    const offset = (Number(page) - 1) * Number(limit)

    const discrepancies = await db
      .select({
        discrepancy: weight_discrepancies,
        user: {
          id: users.id,
          email: users.email,
          phone: users.phone,
        },
      })
      .from(weight_discrepancies)
      .leftJoin(users, eq(users.id, weight_discrepancies.user_id))
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(weight_discrepancies.created_at))
      .limit(Number(limit))
      .offset(offset)

    // Convert R2 URLs to presigned download URLs for courier weight proof images
    const discrepanciesWithPresignedUrls = await Promise.all(
      discrepancies.map(async (item) => {
        if (
          item.discrepancy?.courier_weight_proof_images &&
          Array.isArray(item.discrepancy.courier_weight_proof_images) &&
          item.discrepancy.courier_weight_proof_images.length > 0
        ) {
          try {
            const keys = item.discrepancy.courier_weight_proof_images.map((url) =>
              extractR2Key(url),
            )
            const presignedUrls = await presignDownload(keys)
            return {
              ...item,
              discrepancy: {
                ...item.discrepancy,
                courier_weight_proof_images: Array.isArray(presignedUrls)
                  ? presignedUrls
                  : [presignedUrls],
              },
            }
          } catch (error) {
            console.error('Error generating presigned URLs for courier proof:', error)
            return item
          }
        }
        return item
      }),
    )

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(weight_discrepancies)
      .where(conditions.length ? and(...conditions) : undefined)

    res.json({
      discrepancies: discrepanciesWithPresignedUrls,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total: Number(count),
        totalPages: Math.ceil(Number(count) / Number(limit)),
      },
    })
  } catch (error) {
    console.error('Error fetching admin discrepancies:', error)
    res.status(500).json({ error: 'Failed to fetch discrepancies' })
  }
}

/**
 * Get all disputes (admin view)
 */
export async function getAllDisputes(req: Request, res: Response) {
  try {
    const { status, userId, fromDate, toDate, page = 1, limit = 50 } = req.query

    const conditions: any[] = []

    if (status) conditions.push(eq(weight_disputes.status, status as string))
    if (userId) conditions.push(eq(weight_disputes.user_id, userId as string))
    if (fromDate) conditions.push(gte(weight_disputes.created_at, new Date(fromDate as string)))
    if (toDate) conditions.push(lte(weight_disputes.created_at, new Date(toDate as string)))

    const offset = (Number(page) - 1) * Number(limit)

    const disputes = await db
      .select({
        dispute: weight_disputes,
        discrepancy: weight_discrepancies,
        user: {
          id: users.id,
          email: users.email,
          phone: users.phone,
        },
      })
      .from(weight_disputes)
      .leftJoin(weight_discrepancies, eq(weight_discrepancies.id, weight_disputes.discrepancy_id))
      .leftJoin(users, eq(users.id, weight_disputes.user_id))
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(desc(weight_disputes.created_at))
      .limit(Number(limit))
      .offset(offset)

    // Convert R2 URLs to presigned download URLs for evidence
    const disputesWithPresignedUrls = await Promise.all(
      disputes.map(async (item) => {
        if (
          item.dispute?.customer_evidence_urls &&
          Array.isArray(item.dispute.customer_evidence_urls) &&
          item.dispute.customer_evidence_urls.length > 0
        ) {
          try {
            // Extract R2 keys from full URLs
            const keys = item.dispute.customer_evidence_urls.map((url) => extractR2Key(url))
            // Generate presigned URLs
            const presignedUrls = await presignDownload(keys)
            return {
              ...item,
              dispute: {
                ...item.dispute,
                customer_evidence_urls: Array.isArray(presignedUrls)
                  ? presignedUrls
                  : [presignedUrls],
              },
            }
          } catch (error) {
            console.error('Error generating presigned URLs for evidence:', error)
            return item // Return original if presigning fails
          }
        }
        return item
      }),
    )

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(weight_disputes)
      .where(conditions.length ? and(...conditions) : undefined)

    res.json({
      disputes: disputesWithPresignedUrls,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total: Number(count),
        totalPages: Math.ceil(Number(count) / Number(limit)),
      },
    })
  } catch (error) {
    console.error('Error fetching admin disputes:', error)
    res.status(500).json({ error: 'Failed to fetch disputes' })
  }
}

/**
 * Approve dispute (admin action)
 */
export async function approveDispute(req: Request, res: Response) {
  try {
    const { id } = req.params
    const { adminComment, adjustWeight, adjustCharge } = req.body

    const [dispute] = await db.select().from(weight_disputes).where(eq(weight_disputes.id, id))

    if (!dispute) {
      return res.status(404).json({ error: 'Dispute not found' })
    }
    if (!['open', 'under_review'].includes(dispute.status || '')) {
      return res.status(400).json({ error: `Dispute cannot be approved from status ${dispute.status}` })
    }

    const [currentDiscrepancy] = await db
      .select()
      .from(weight_discrepancies)
      .where(eq(weight_discrepancies.id, dispute.discrepancy_id))

    if (!currentDiscrepancy) {
      return res.status(404).json({ error: 'Linked discrepancy not found' })
    }

    // Update dispute
    const [updatedDispute] = await db
      .update(weight_disputes)
      .set({
        status: 'approved',
        admin_response: adminComment,
        reviewed_at: new Date(),
        updated_at: new Date(),
      })
      .where(eq(weight_disputes.id, id))
      .returning()

    // Update discrepancy
    const updates: any = {
      status: 'resolved',
      resolution_notes: `Dispute approved. ${adminComment || ''}`,
      resolved_at: new Date(),
      updated_at: new Date(),
    }

    if (adjustWeight !== undefined) {
      updates.charged_weight = adjustWeight.toString()
    }
    if (adjustCharge !== undefined) {
      updates.revised_shipping_charge = adjustCharge.toString()
    }

    const [updatedDiscrepancy] = await db
      .update(weight_discrepancies)
      .set(updates)
      .where(eq(weight_discrepancies.id, dispute.discrepancy_id))
      .returning()

    // If customer was already debited for this discrepancy, refund on approval.
    const additionalCharge = Number(currentDiscrepancy.additional_charge || 0)
    if (additionalCharge > 0) {
      const [userWallet] = await db
        .select()
        .from(wallets)
        .where(eq(wallets.userId, dispute.user_id))
        .limit(1)

      if (userWallet) {
        const [existingRefund] = await db
          .select()
          .from(walletTransactions)
          .where(
            and(
              eq(walletTransactions.wallet_id, userWallet.id),
              eq(walletTransactions.type, 'credit'),
              eq(walletTransactions.ref, `dispute_approved_refund_${dispute.id}`),
            ),
          )
          .limit(1)

        if (!existingRefund) {
          const [chargeDebit] = await db
            .select()
            .from(walletTransactions)
            .where(
              and(
                eq(walletTransactions.wallet_id, userWallet.id),
                eq(walletTransactions.type, 'debit'),
                or(
                  eq(walletTransactions.ref, `weight_discrepancy_${dispute.discrepancy_id}`),
                  eq(walletTransactions.ref, `dispute_rejected_${dispute.id}`),
                ),
              ),
            )
            .limit(1)

          if (chargeDebit) {
            await createWalletTransaction({
              walletId: userWallet.id,
              amount: additionalCharge,
              type: 'credit',
              reason: `Weight discrepancy refund - Dispute approved for order ${currentDiscrepancy.order_number}`,
              ref: `dispute_approved_refund_${dispute.id}`,
              meta: {
                dispute_id: dispute.id,
                discrepancy_id: updatedDiscrepancy.id,
                order_number: currentDiscrepancy.order_number,
                admin_comment: adminComment,
              },
            })
          }
        }
      }
    }

    // Create history entry
    await db.insert(weight_adjustment_history).values({
      discrepancy_id: dispute.discrepancy_id,
      action_type: 'dispute_resolved',
      reason: 'Dispute approved by admin',
      notes: adminComment,
      changed_by_type: 'admin',
      source: 'admin_panel',
      created_at: new Date(),
    })

    // Send email to customer
    const [user] = await db.select().from(users).where(eq(users.id, dispute.user_id)).limit(1)
    if (user?.email) {
      const [discrepancy] = await db
        .select()
        .from(weight_discrepancies)
        .where(eq(weight_discrepancies.id, dispute.discrepancy_id))
        .limit(1)

      sendDisputeUpdateEmail(
        user.email,
        user.email || 'User',
        discrepancy?.order_number || '',
        'approved',
        adminComment,
      ).catch((err) => console.error('Failed to send dispute update email:', err))
    }

    res.json({ dispute: updatedDispute, discrepancy: updatedDiscrepancy })
  } catch (error) {
    console.error('Error approving dispute:', error)
    res.status(500).json({ error: 'Failed to approve dispute' })
  }
}

/**
 * Reject dispute (admin action)
 */
export async function rejectDispute(req: Request, res: Response) {
  try {
    const { id } = req.params
    const { adminComment } = req.body

    const [dispute] = await db.select().from(weight_disputes).where(eq(weight_disputes.id, id))

    if (!dispute) {
      return res.status(404).json({ error: 'Dispute not found' })
    }
    if (!['open', 'under_review'].includes(dispute.status || '')) {
      return res.status(400).json({ error: `Dispute cannot be rejected from status ${dispute.status}` })
    }

    // Update dispute
    const [updatedDispute] = await db
      .update(weight_disputes)
      .set({
        status: 'rejected',
        admin_response: adminComment,
        reviewed_at: new Date(),
        updated_at: new Date(),
      })
      .where(eq(weight_disputes.id, id))
      .returning()

    // Update discrepancy to resolved (dispute rejected - courier weight is confirmed correct)
    const [updatedDiscrepancy] = await db
      .update(weight_discrepancies)
      .set({
        status: 'resolved',
        resolution_notes: `Dispute rejected - Courier weight confirmed correct. Admin response: ${
          adminComment || ''
        }`,
        resolved_at: new Date(),
        updated_at: new Date(),
      })
      .where(eq(weight_discrepancies.id, dispute.discrepancy_id))
      .returning()

    // Debit wallet for the additional charge (dispute rejected = customer must pay)
    const additionalCharge = Number(updatedDiscrepancy.additional_charge || 0)
    if (additionalCharge > 0) {
      const [userWallet] = await db
        .select()
        .from(wallets)
        .where(eq(wallets.userId, dispute.user_id))
        .limit(1)

      if (userWallet) {
        await createWalletTransaction({
          walletId: userWallet.id,
          amount: additionalCharge,
          type: 'debit',
          reason: `Weight discrepancy charge - Dispute rejected for order ${updatedDiscrepancy.order_number}`,
          ref: `dispute_rejected_${dispute.id}`,
          meta: {
            dispute_id: dispute.id,
            discrepancy_id: updatedDiscrepancy.id,
            order_number: updatedDiscrepancy.order_number,
            weight_difference: updatedDiscrepancy.weight_difference,
            admin_comment: adminComment,
          },
        })
      }
    }

    // Create history entry
    await db.insert(weight_adjustment_history).values({
      discrepancy_id: dispute.discrepancy_id,
      action_type: 'dispute_resolved',
      reason: 'Dispute rejected by admin',
      notes: adminComment,
      changed_by_type: 'admin',
      source: 'admin_panel',
      created_at: new Date(),
    })

    // Send email to customer
    const [user] = await db.select().from(users).where(eq(users.id, dispute.user_id)).limit(1)
    if (user?.email) {
      const [discrepancy] = await db
        .select()
        .from(weight_discrepancies)
        .where(eq(weight_discrepancies.id, dispute.discrepancy_id))
        .limit(1)

      sendDisputeUpdateEmail(
        user.email,
        user.email || 'User',
        discrepancy?.order_number || '',
        'rejected',
        adminComment,
      ).catch((err) => console.error('Failed to send dispute update email:', err))
    }

    res.json({ dispute: updatedDispute, discrepancy: updatedDiscrepancy })
  } catch (error) {
    console.error('Error rejecting dispute:', error)
    res.status(500).json({ error: 'Failed to reject dispute' })
  }
}

/**
 * Get admin weight reconciliation dashboard stats
 */
export async function getAdminWeightStats(req: Request, res: Response) {
  try {
    const { fromDate, toDate } = req.query

    const conditions: any[] = []
    if (fromDate)
      conditions.push(gte(weight_discrepancies.created_at, new Date(fromDate as string)))
    if (toDate) conditions.push(lte(weight_discrepancies.created_at, new Date(toDate as string)))

    // Total discrepancies by status
    const statusStats = await db
      .select({
        status: weight_discrepancies.status,
        count: sql<number>`count(*)`,
        totalAdditionalCharge: sql<number>`COALESCE(SUM(CAST(${weight_discrepancies.additional_charge} AS NUMERIC)), 0)`,
      })
      .from(weight_discrepancies)
      .where(conditions.length ? and(...conditions) : undefined)
      .groupBy(weight_discrepancies.status)

    // Total disputes by status
    const disputeStats = await db
      .select({
        status: weight_disputes.status,
        count: sql<number>`count(*)`,
      })
      .from(weight_disputes)
      .where(conditions.length ? and(...conditions) : undefined)
      .groupBy(weight_disputes.status)

    // Top couriers with most discrepancies
    const courierStats = await db
      .select({
        courier: weight_discrepancies.courier_partner,
        count: sql<number>`count(*)`,
        avgWeightDifference: sql<number>`AVG(CAST(${weight_discrepancies.weight_difference} AS NUMERIC))`,
      })
      .from(weight_discrepancies)
      .where(conditions.length ? and(...conditions) : undefined)
      .groupBy(weight_discrepancies.courier_partner)
      .orderBy(desc(sql`count(*)`))
      .limit(10)

    // Recent large discrepancies
    const largeDiscrepancies = await db
      .select({
        discrepancy: weight_discrepancies,
        user: {
          id: users.id,
          email: users.email,
          phone: users.phone,
        },
      })
      .from(weight_discrepancies)
      .leftJoin(users, eq(users.id, weight_discrepancies.user_id))
      .where(
        and(
          conditions.length ? and(...conditions) : undefined,
          or(
            gte(weight_discrepancies.weight_difference, '0.5'),
            lte(weight_discrepancies.weight_difference, '-0.5'),
          ),
        ),
      )
      .orderBy(desc(weight_discrepancies.created_at))
      .limit(20)

    res.json({
      statusStats,
      disputeStats,
      courierStats,
      largeDiscrepancies,
    })
  } catch (error) {
    console.error('Error fetching admin weight stats:', error)
    res.status(500).json({ error: 'Failed to fetch stats' })
  }
}

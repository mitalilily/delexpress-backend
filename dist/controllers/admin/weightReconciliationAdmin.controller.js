"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getAllDiscrepancies = getAllDiscrepancies;
exports.getAllDisputes = getAllDisputes;
exports.approveDispute = approveDispute;
exports.rejectDispute = rejectDispute;
exports.getAdminWeightStats = getAdminWeightStats;
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../../models/client");
const upload_service_1 = require("../../models/services/upload.service");
const wallet_service_1 = require("../../models/services/wallet.service");
const weightReconciliationEmail_service_1 = require("../../models/services/weightReconciliationEmail.service");
const schema_1 = require("../../schema/schema");
/**
 * Helper: Extract R2 key from full R2 URL
 * Example: https://xxx.r2.cloudflarestorage.com/bucket-name/folder/file.mp4 -> folder/file.mp4
 */
function extractR2Key(url) {
    try {
        // Parse the URL to get the path
        const urlObj = new URL(url);
        const pathParts = urlObj.pathname.split('/');
        // Remove empty strings and bucket name (first part after /)
        const [, bucketName, ...keyParts] = pathParts;
        return keyParts.join('/');
    }
    catch (error) {
        console.error('Error extracting R2 key from URL:', url, error);
        return url; // Return original if parsing fails
    }
}
/**
 * Get all weight discrepancies (admin view)
 */
async function getAllDiscrepancies(req, res) {
    try {
        const { status, hasDispute, userId, fromDate, toDate, page = 1, limit = 50 } = req.query;
        const conditions = [];
        if (status)
            conditions.push((0, drizzle_orm_1.eq)(schema_1.weight_discrepancies.status, status));
        if (hasDispute === 'true')
            conditions.push((0, drizzle_orm_1.eq)(schema_1.weight_discrepancies.has_dispute, true));
        if (userId)
            conditions.push((0, drizzle_orm_1.eq)(schema_1.weight_discrepancies.user_id, userId));
        if (fromDate)
            conditions.push((0, drizzle_orm_1.gte)(schema_1.weight_discrepancies.created_at, new Date(fromDate)));
        if (toDate)
            conditions.push((0, drizzle_orm_1.lte)(schema_1.weight_discrepancies.created_at, new Date(toDate)));
        const offset = (Number(page) - 1) * Number(limit);
        const discrepancies = await client_1.db
            .select({
            discrepancy: schema_1.weight_discrepancies,
            user: {
                id: schema_1.users.id,
                email: schema_1.users.email,
                phone: schema_1.users.phone,
            },
        })
            .from(schema_1.weight_discrepancies)
            .leftJoin(schema_1.users, (0, drizzle_orm_1.eq)(schema_1.users.id, schema_1.weight_discrepancies.user_id))
            .where(conditions.length ? (0, drizzle_orm_1.and)(...conditions) : undefined)
            .orderBy((0, drizzle_orm_1.desc)(schema_1.weight_discrepancies.created_at))
            .limit(Number(limit))
            .offset(offset);
        // Convert R2 URLs to presigned download URLs for courier weight proof images
        const discrepanciesWithPresignedUrls = await Promise.all(discrepancies.map(async (item) => {
            if (item.discrepancy?.courier_weight_proof_images &&
                Array.isArray(item.discrepancy.courier_weight_proof_images) &&
                item.discrepancy.courier_weight_proof_images.length > 0) {
                try {
                    const keys = item.discrepancy.courier_weight_proof_images.map((url) => extractR2Key(url));
                    const presignedUrls = await (0, upload_service_1.presignDownload)(keys);
                    return {
                        ...item,
                        discrepancy: {
                            ...item.discrepancy,
                            courier_weight_proof_images: Array.isArray(presignedUrls)
                                ? presignedUrls
                                : [presignedUrls],
                        },
                    };
                }
                catch (error) {
                    console.error('Error generating presigned URLs for courier proof:', error);
                    return item;
                }
            }
            return item;
        }));
        const [{ count }] = await client_1.db
            .select({ count: (0, drizzle_orm_1.sql) `count(*)` })
            .from(schema_1.weight_discrepancies)
            .where(conditions.length ? (0, drizzle_orm_1.and)(...conditions) : undefined);
        res.json({
            discrepancies: discrepanciesWithPresignedUrls,
            pagination: {
                page: Number(page),
                limit: Number(limit),
                total: Number(count),
                totalPages: Math.ceil(Number(count) / Number(limit)),
            },
        });
    }
    catch (error) {
        console.error('Error fetching admin discrepancies:', error);
        res.status(500).json({ error: 'Failed to fetch discrepancies' });
    }
}
/**
 * Get all disputes (admin view)
 */
async function getAllDisputes(req, res) {
    try {
        const { status, userId, fromDate, toDate, page = 1, limit = 50 } = req.query;
        const conditions = [];
        if (status)
            conditions.push((0, drizzle_orm_1.eq)(schema_1.weight_disputes.status, status));
        if (userId)
            conditions.push((0, drizzle_orm_1.eq)(schema_1.weight_disputes.user_id, userId));
        if (fromDate)
            conditions.push((0, drizzle_orm_1.gte)(schema_1.weight_disputes.created_at, new Date(fromDate)));
        if (toDate)
            conditions.push((0, drizzle_orm_1.lte)(schema_1.weight_disputes.created_at, new Date(toDate)));
        const offset = (Number(page) - 1) * Number(limit);
        const disputes = await client_1.db
            .select({
            dispute: schema_1.weight_disputes,
            discrepancy: schema_1.weight_discrepancies,
            user: {
                id: schema_1.users.id,
                email: schema_1.users.email,
                phone: schema_1.users.phone,
            },
        })
            .from(schema_1.weight_disputes)
            .leftJoin(schema_1.weight_discrepancies, (0, drizzle_orm_1.eq)(schema_1.weight_discrepancies.id, schema_1.weight_disputes.discrepancy_id))
            .leftJoin(schema_1.users, (0, drizzle_orm_1.eq)(schema_1.users.id, schema_1.weight_disputes.user_id))
            .where(conditions.length ? (0, drizzle_orm_1.and)(...conditions) : undefined)
            .orderBy((0, drizzle_orm_1.desc)(schema_1.weight_disputes.created_at))
            .limit(Number(limit))
            .offset(offset);
        // Convert R2 URLs to presigned download URLs for evidence
        const disputesWithPresignedUrls = await Promise.all(disputes.map(async (item) => {
            if (item.dispute?.customer_evidence_urls &&
                Array.isArray(item.dispute.customer_evidence_urls) &&
                item.dispute.customer_evidence_urls.length > 0) {
                try {
                    // Extract R2 keys from full URLs
                    const keys = item.dispute.customer_evidence_urls.map((url) => extractR2Key(url));
                    // Generate presigned URLs
                    const presignedUrls = await (0, upload_service_1.presignDownload)(keys);
                    return {
                        ...item,
                        dispute: {
                            ...item.dispute,
                            customer_evidence_urls: Array.isArray(presignedUrls)
                                ? presignedUrls
                                : [presignedUrls],
                        },
                    };
                }
                catch (error) {
                    console.error('Error generating presigned URLs for evidence:', error);
                    return item; // Return original if presigning fails
                }
            }
            return item;
        }));
        const [{ count }] = await client_1.db
            .select({ count: (0, drizzle_orm_1.sql) `count(*)` })
            .from(schema_1.weight_disputes)
            .where(conditions.length ? (0, drizzle_orm_1.and)(...conditions) : undefined);
        res.json({
            disputes: disputesWithPresignedUrls,
            pagination: {
                page: Number(page),
                limit: Number(limit),
                total: Number(count),
                totalPages: Math.ceil(Number(count) / Number(limit)),
            },
        });
    }
    catch (error) {
        console.error('Error fetching admin disputes:', error);
        res.status(500).json({ error: 'Failed to fetch disputes' });
    }
}
/**
 * Approve dispute (admin action)
 */
async function approveDispute(req, res) {
    try {
        const { id } = req.params;
        const { adminComment, adjustWeight, adjustCharge } = req.body;
        const [dispute] = await client_1.db.select().from(schema_1.weight_disputes).where((0, drizzle_orm_1.eq)(schema_1.weight_disputes.id, id));
        if (!dispute) {
            return res.status(404).json({ error: 'Dispute not found' });
        }
        if (!['open', 'under_review'].includes(dispute.status || '')) {
            return res.status(400).json({ error: `Dispute cannot be approved from status ${dispute.status}` });
        }
        const [currentDiscrepancy] = await client_1.db
            .select()
            .from(schema_1.weight_discrepancies)
            .where((0, drizzle_orm_1.eq)(schema_1.weight_discrepancies.id, dispute.discrepancy_id));
        if (!currentDiscrepancy) {
            return res.status(404).json({ error: 'Linked discrepancy not found' });
        }
        // Update dispute
        const [updatedDispute] = await client_1.db
            .update(schema_1.weight_disputes)
            .set({
            status: 'approved',
            admin_response: adminComment,
            reviewed_at: new Date(),
            updated_at: new Date(),
        })
            .where((0, drizzle_orm_1.eq)(schema_1.weight_disputes.id, id))
            .returning();
        // Update discrepancy
        const updates = {
            status: 'resolved',
            resolution_notes: `Dispute approved. ${adminComment || ''}`,
            resolved_at: new Date(),
            updated_at: new Date(),
        };
        if (adjustWeight !== undefined) {
            updates.charged_weight = adjustWeight.toString();
        }
        if (adjustCharge !== undefined) {
            updates.revised_shipping_charge = adjustCharge.toString();
        }
        const [updatedDiscrepancy] = await client_1.db
            .update(schema_1.weight_discrepancies)
            .set(updates)
            .where((0, drizzle_orm_1.eq)(schema_1.weight_discrepancies.id, dispute.discrepancy_id))
            .returning();
        // If customer was already debited for this discrepancy, refund on approval.
        const additionalCharge = Number(currentDiscrepancy.additional_charge || 0);
        if (additionalCharge > 0) {
            const [userWallet] = await client_1.db
                .select()
                .from(schema_1.wallets)
                .where((0, drizzle_orm_1.eq)(schema_1.wallets.userId, dispute.user_id))
                .limit(1);
            if (userWallet) {
                const [existingRefund] = await client_1.db
                    .select()
                    .from(schema_1.walletTransactions)
                    .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.walletTransactions.wallet_id, userWallet.id), (0, drizzle_orm_1.eq)(schema_1.walletTransactions.type, 'credit'), (0, drizzle_orm_1.eq)(schema_1.walletTransactions.ref, `dispute_approved_refund_${dispute.id}`)))
                    .limit(1);
                if (!existingRefund) {
                    const [chargeDebit] = await client_1.db
                        .select()
                        .from(schema_1.walletTransactions)
                        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.walletTransactions.wallet_id, userWallet.id), (0, drizzle_orm_1.eq)(schema_1.walletTransactions.type, 'debit'), (0, drizzle_orm_1.or)((0, drizzle_orm_1.eq)(schema_1.walletTransactions.ref, `weight_discrepancy_${dispute.discrepancy_id}`), (0, drizzle_orm_1.eq)(schema_1.walletTransactions.ref, `dispute_rejected_${dispute.id}`))))
                        .limit(1);
                    if (chargeDebit) {
                        await (0, wallet_service_1.createWalletTransaction)({
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
                        });
                    }
                }
            }
        }
        // Create history entry
        await client_1.db.insert(schema_1.weight_adjustment_history).values({
            discrepancy_id: dispute.discrepancy_id,
            action_type: 'dispute_resolved',
            reason: 'Dispute approved by admin',
            notes: adminComment,
            changed_by_type: 'admin',
            source: 'admin_panel',
            created_at: new Date(),
        });
        // Send email to customer
        const [user] = await client_1.db.select().from(schema_1.users).where((0, drizzle_orm_1.eq)(schema_1.users.id, dispute.user_id)).limit(1);
        if (user?.email) {
            const [discrepancy] = await client_1.db
                .select()
                .from(schema_1.weight_discrepancies)
                .where((0, drizzle_orm_1.eq)(schema_1.weight_discrepancies.id, dispute.discrepancy_id))
                .limit(1);
            (0, weightReconciliationEmail_service_1.sendDisputeUpdateEmail)(user.email, user.email || 'User', discrepancy?.order_number || '', 'approved', adminComment).catch((err) => console.error('Failed to send dispute update email:', err));
        }
        res.json({ dispute: updatedDispute, discrepancy: updatedDiscrepancy });
    }
    catch (error) {
        console.error('Error approving dispute:', error);
        res.status(500).json({ error: 'Failed to approve dispute' });
    }
}
/**
 * Reject dispute (admin action)
 */
async function rejectDispute(req, res) {
    try {
        const { id } = req.params;
        const { adminComment } = req.body;
        const [dispute] = await client_1.db.select().from(schema_1.weight_disputes).where((0, drizzle_orm_1.eq)(schema_1.weight_disputes.id, id));
        if (!dispute) {
            return res.status(404).json({ error: 'Dispute not found' });
        }
        if (!['open', 'under_review'].includes(dispute.status || '')) {
            return res.status(400).json({ error: `Dispute cannot be rejected from status ${dispute.status}` });
        }
        // Update dispute
        const [updatedDispute] = await client_1.db
            .update(schema_1.weight_disputes)
            .set({
            status: 'rejected',
            admin_response: adminComment,
            reviewed_at: new Date(),
            updated_at: new Date(),
        })
            .where((0, drizzle_orm_1.eq)(schema_1.weight_disputes.id, id))
            .returning();
        // Update discrepancy to resolved (dispute rejected - courier weight is confirmed correct)
        const [updatedDiscrepancy] = await client_1.db
            .update(schema_1.weight_discrepancies)
            .set({
            status: 'resolved',
            resolution_notes: `Dispute rejected - Courier weight confirmed correct. Admin response: ${adminComment || ''}`,
            resolved_at: new Date(),
            updated_at: new Date(),
        })
            .where((0, drizzle_orm_1.eq)(schema_1.weight_discrepancies.id, dispute.discrepancy_id))
            .returning();
        // Debit wallet for the additional charge (dispute rejected = customer must pay)
        const additionalCharge = Number(updatedDiscrepancy.additional_charge || 0);
        if (additionalCharge > 0) {
            const [userWallet] = await client_1.db
                .select()
                .from(schema_1.wallets)
                .where((0, drizzle_orm_1.eq)(schema_1.wallets.userId, dispute.user_id))
                .limit(1);
            if (userWallet) {
                await (0, wallet_service_1.createWalletTransaction)({
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
                });
            }
        }
        // Create history entry
        await client_1.db.insert(schema_1.weight_adjustment_history).values({
            discrepancy_id: dispute.discrepancy_id,
            action_type: 'dispute_resolved',
            reason: 'Dispute rejected by admin',
            notes: adminComment,
            changed_by_type: 'admin',
            source: 'admin_panel',
            created_at: new Date(),
        });
        // Send email to customer
        const [user] = await client_1.db.select().from(schema_1.users).where((0, drizzle_orm_1.eq)(schema_1.users.id, dispute.user_id)).limit(1);
        if (user?.email) {
            const [discrepancy] = await client_1.db
                .select()
                .from(schema_1.weight_discrepancies)
                .where((0, drizzle_orm_1.eq)(schema_1.weight_discrepancies.id, dispute.discrepancy_id))
                .limit(1);
            (0, weightReconciliationEmail_service_1.sendDisputeUpdateEmail)(user.email, user.email || 'User', discrepancy?.order_number || '', 'rejected', adminComment).catch((err) => console.error('Failed to send dispute update email:', err));
        }
        res.json({ dispute: updatedDispute, discrepancy: updatedDiscrepancy });
    }
    catch (error) {
        console.error('Error rejecting dispute:', error);
        res.status(500).json({ error: 'Failed to reject dispute' });
    }
}
/**
 * Get admin weight reconciliation dashboard stats
 */
async function getAdminWeightStats(req, res) {
    try {
        const { fromDate, toDate } = req.query;
        const conditions = [];
        if (fromDate)
            conditions.push((0, drizzle_orm_1.gte)(schema_1.weight_discrepancies.created_at, new Date(fromDate)));
        if (toDate)
            conditions.push((0, drizzle_orm_1.lte)(schema_1.weight_discrepancies.created_at, new Date(toDate)));
        // Total discrepancies by status
        const statusStats = await client_1.db
            .select({
            status: schema_1.weight_discrepancies.status,
            count: (0, drizzle_orm_1.sql) `count(*)`,
            totalAdditionalCharge: (0, drizzle_orm_1.sql) `COALESCE(SUM(CAST(${schema_1.weight_discrepancies.additional_charge} AS NUMERIC)), 0)`,
        })
            .from(schema_1.weight_discrepancies)
            .where(conditions.length ? (0, drizzle_orm_1.and)(...conditions) : undefined)
            .groupBy(schema_1.weight_discrepancies.status);
        // Total disputes by status
        const disputeStats = await client_1.db
            .select({
            status: schema_1.weight_disputes.status,
            count: (0, drizzle_orm_1.sql) `count(*)`,
        })
            .from(schema_1.weight_disputes)
            .where(conditions.length ? (0, drizzle_orm_1.and)(...conditions) : undefined)
            .groupBy(schema_1.weight_disputes.status);
        // Top couriers with most discrepancies
        const courierStats = await client_1.db
            .select({
            courier: schema_1.weight_discrepancies.courier_partner,
            count: (0, drizzle_orm_1.sql) `count(*)`,
            avgWeightDifference: (0, drizzle_orm_1.sql) `AVG(CAST(${schema_1.weight_discrepancies.weight_difference} AS NUMERIC))`,
        })
            .from(schema_1.weight_discrepancies)
            .where(conditions.length ? (0, drizzle_orm_1.and)(...conditions) : undefined)
            .groupBy(schema_1.weight_discrepancies.courier_partner)
            .orderBy((0, drizzle_orm_1.desc)((0, drizzle_orm_1.sql) `count(*)`))
            .limit(10);
        // Recent large discrepancies
        const largeDiscrepancies = await client_1.db
            .select({
            discrepancy: schema_1.weight_discrepancies,
            user: {
                id: schema_1.users.id,
                email: schema_1.users.email,
                phone: schema_1.users.phone,
            },
        })
            .from(schema_1.weight_discrepancies)
            .leftJoin(schema_1.users, (0, drizzle_orm_1.eq)(schema_1.users.id, schema_1.weight_discrepancies.user_id))
            .where((0, drizzle_orm_1.and)(conditions.length ? (0, drizzle_orm_1.and)(...conditions) : undefined, (0, drizzle_orm_1.or)((0, drizzle_orm_1.gte)(schema_1.weight_discrepancies.weight_difference, '0.5'), (0, drizzle_orm_1.lte)(schema_1.weight_discrepancies.weight_difference, '-0.5'))))
            .orderBy((0, drizzle_orm_1.desc)(schema_1.weight_discrepancies.created_at))
            .limit(20);
        res.json({
            statusStats,
            disputeStats,
            courierStats,
            largeDiscrepancies,
        });
    }
    catch (error) {
        console.error('Error fetching admin weight stats:', error);
        res.status(500).json({ error: 'Failed to fetch stats' });
    }
}

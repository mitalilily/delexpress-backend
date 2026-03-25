"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDiscrepancies = getDiscrepancies;
exports.getDiscrepancyDetails = getDiscrepancyDetails;
exports.acceptDiscrepancy = acceptDiscrepancy;
exports.rejectDiscrepancy = rejectDiscrepancy;
exports.bulkAccept = bulkAccept;
exports.bulkReject = bulkReject;
exports.createDispute = createDispute;
exports.getDisputes = getDisputes;
exports.getSummary = getSummary;
exports.getSettings = getSettings;
exports.updateSettings = updateSettings;
exports.exportDiscrepancies = exportDiscrepancies;
exports.manuallyReportDiscrepancy = manuallyReportDiscrepancy;
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../models/client");
const csv_1 = require("../utils/csv");
const courierWeightCalculation_service_1 = require("../models/services/courierWeightCalculation.service");
const weightReconciliation_service_1 = require("../models/services/weightReconciliation.service");
const schema_1 = require("../schema/schema");
/**
 * Get all weight discrepancies for the current user
 * GET /api/weight-reconciliation/discrepancies
 */
async function getDiscrepancies(req, res) {
    try {
        const userId = req.user?.sub;
        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        const { status, courierPartner, orderType, fromDate, toDate, hasDispute, minWeightDiff, minChargeDiff, page, limit, } = req.query;
        const filters = { userId };
        if (status) {
            filters.status = Array.isArray(status) ? status : [status];
        }
        if (courierPartner) {
            filters.courierPartner = Array.isArray(courierPartner) ? courierPartner : [courierPartner];
        }
        if (orderType) {
            filters.orderType = orderType;
        }
        if (fromDate) {
            filters.fromDate = new Date(fromDate);
        }
        if (toDate) {
            filters.toDate = new Date(toDate);
        }
        if (hasDispute !== undefined) {
            filters.hasDispute = hasDispute === 'true';
        }
        if (minWeightDiff) {
            filters.minWeightDiff = Number(minWeightDiff);
        }
        if (minChargeDiff) {
            filters.minChargeDiff = Number(minChargeDiff);
        }
        if (page) {
            filters.page = Number(page);
        }
        if (limit) {
            filters.limit = Number(limit);
        }
        const result = await (0, weightReconciliation_service_1.getWeightDiscrepancies)(filters);
        return res.json(result);
    }
    catch (error) {
        console.error('Error getting weight discrepancies:', error);
        return res.status(500).json({ error: error.message || 'Failed to fetch discrepancies' });
    }
}
/**
 * Get a single discrepancy by ID with full details
 * GET /api/weight-reconciliation/discrepancies/:id
 */
async function getDiscrepancyDetails(req, res) {
    try {
        const userId = req.user?.sub;
        const { id } = req.params;
        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        const result = await (0, weightReconciliation_service_1.getDiscrepancyById)(id);
        // Verify user owns this discrepancy
        if (result.discrepancy.user_id !== userId) {
            return res.status(403).json({ error: 'Forbidden' });
        }
        return res.json(result);
    }
    catch (error) {
        console.error('Error getting discrepancy details:', error);
        return res.status(500).json({ error: error.message || 'Failed to fetch discrepancy details' });
    }
}
/**
 * Accept a weight discrepancy
 * POST /api/weight-reconciliation/discrepancies/:id/accept
 */
async function acceptDiscrepancy(req, res) {
    try {
        const userId = req.user?.sub;
        const { id } = req.params;
        const { notes } = req.body;
        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        await (0, weightReconciliation_service_1.acceptWeightDiscrepancy)(id, userId, notes);
        return res.json({ success: true, message: 'Discrepancy accepted' });
    }
    catch (error) {
        console.error('Error accepting discrepancy:', error);
        return res.status(500).json({ error: error.message || 'Failed to accept discrepancy' });
    }
}
/**
 * Reject a weight discrepancy
 * POST /api/weight-reconciliation/discrepancies/:id/reject
 */
async function rejectDiscrepancy(req, res) {
    try {
        const userId = req.user?.sub;
        const { id } = req.params;
        const { reason } = req.body;
        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        if (!reason) {
            return res.status(400).json({ error: 'Reason is required' });
        }
        await (0, weightReconciliation_service_1.rejectWeightDiscrepancy)(id, userId, reason);
        return res.json({ success: true, message: 'Discrepancy rejected' });
    }
    catch (error) {
        console.error('Error rejecting discrepancy:', error);
        return res.status(500).json({ error: error.message || 'Failed to reject discrepancy' });
    }
}
/**
 * Bulk accept discrepancies
 * POST /api/weight-reconciliation/discrepancies/bulk-accept
 */
async function bulkAccept(req, res) {
    try {
        const userId = req.user?.sub;
        const { discrepancyIds, notes } = req.body;
        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        if (!discrepancyIds || !Array.isArray(discrepancyIds) || discrepancyIds.length === 0) {
            return res.status(400).json({ error: 'Discrepancy IDs are required' });
        }
        const results = await (0, weightReconciliation_service_1.bulkAcceptDiscrepancies)(discrepancyIds, userId, notes);
        return res.json({ success: true, results });
    }
    catch (error) {
        console.error('Error bulk accepting discrepancies:', error);
        return res.status(500).json({ error: error.message || 'Failed to bulk accept discrepancies' });
    }
}
/**
 * Bulk reject discrepancies
 * POST /api/weight-reconciliation/discrepancies/bulk-reject
 */
async function bulkReject(req, res) {
    try {
        const userId = req.user?.sub;
        const { discrepancyIds, reason } = req.body;
        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        if (!discrepancyIds || !Array.isArray(discrepancyIds) || discrepancyIds.length === 0) {
            return res.status(400).json({ error: 'Discrepancy IDs are required' });
        }
        if (!reason) {
            return res.status(400).json({ error: 'Reason is required' });
        }
        const results = await (0, weightReconciliation_service_1.bulkRejectDiscrepancies)(discrepancyIds, userId, reason);
        return res.json({ success: true, results });
    }
    catch (error) {
        console.error('Error bulk rejecting discrepancies:', error);
        return res.status(500).json({ error: error.message || 'Failed to bulk reject discrepancies' });
    }
}
/**
 * Create a dispute for a discrepancy
 * POST /api/weight-reconciliation/disputes
 */
async function createDispute(req, res) {
    try {
        const userId = req.user?.sub;
        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        const { discrepancyId, disputeReason, customerComment, customerClaimedWeight, customerClaimedDimensions, evidenceUrls, } = req.body;
        if (!discrepancyId || !disputeReason || !customerComment) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        const dispute = await (0, weightReconciliation_service_1.createWeightDispute)({
            discrepancyId,
            userId,
            disputeReason,
            customerComment,
            customerClaimedWeight,
            customerClaimedDimensions,
            evidenceUrls,
        });
        return res.json({ success: true, dispute });
    }
    catch (error) {
        console.error('Error creating dispute:', error);
        return res.status(500).json({ error: error.message || 'Failed to create dispute' });
    }
}
/**
 * Get all disputes for the current user
 * GET /api/weight-reconciliation/disputes
 */
async function getDisputes(req, res) {
    try {
        const userId = req.user?.sub;
        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        const { status, page, limit } = req.query;
        const filters = { userId };
        if (status) {
            filters.status = Array.isArray(status) ? status : [status];
        }
        if (page) {
            filters.page = Number(page);
        }
        if (limit) {
            filters.limit = Number(limit);
        }
        const result = await (0, weightReconciliation_service_1.getWeightDisputes)(filters);
        return res.json(result);
    }
    catch (error) {
        console.error('Error getting disputes:', error);
        return res.status(500).json({ error: error.message || 'Failed to fetch disputes' });
    }
}
/**
 * Get weight reconciliation summary/analytics
 * GET /api/weight-reconciliation/summary
 */
async function getSummary(req, res) {
    try {
        const userId = req.user?.sub;
        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        const { fromDate, toDate } = req.query;
        const from = fromDate ? new Date(fromDate) : undefined;
        const to = toDate ? new Date(toDate) : undefined;
        const summary = await (0, weightReconciliation_service_1.getWeightReconciliationSummary)(userId, from, to);
        return res.json(summary);
    }
    catch (error) {
        console.error('Error getting summary:', error);
        return res.status(500).json({ error: error.message || 'Failed to fetch summary' });
    }
}
/**
 * Get user's weight reconciliation settings
 * GET /api/weight-reconciliation/settings
 */
async function getSettings(req, res) {
    try {
        const userId = req.user?.sub;
        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        const settings = await (0, weightReconciliation_service_1.getWeightReconciliationSettings)(userId);
        return res.json(settings);
    }
    catch (error) {
        console.error('Error getting settings:', error);
        return res.status(500).json({ error: error.message || 'Failed to fetch settings' });
    }
}
/**
 * Update user's weight reconciliation settings
 * PUT /api/weight-reconciliation/settings
 */
async function updateSettings(req, res) {
    try {
        const userId = req.user?.sub;
        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        const updates = req.body;
        const settings = await (0, weightReconciliation_service_1.updateWeightReconciliationSettings)(userId, updates);
        return res.json({ success: true, settings });
    }
    catch (error) {
        console.error('Error updating settings:', error);
        return res.status(500).json({ error: error.message || 'Failed to update settings' });
    }
}
/**
 * Export discrepancies as CSV
 * GET /api/weight-reconciliation/export
 */
async function exportDiscrepancies(req, res) {
    try {
        const userId = req.user?.sub;
        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        const { status, courierPartner, orderType, fromDate, toDate, hasDispute } = req.query;
        const filters = { userId };
        if (status) {
            filters.status = Array.isArray(status) ? status : [status];
        }
        if (courierPartner) {
            filters.courierPartner = Array.isArray(courierPartner) ? courierPartner : [courierPartner];
        }
        if (orderType) {
            filters.orderType = orderType;
        }
        if (fromDate) {
            filters.fromDate = new Date(fromDate);
        }
        if (toDate) {
            filters.toDate = new Date(toDate);
        }
        if (hasDispute !== undefined) {
            filters.hasDispute = hasDispute === 'true';
        }
        // Get all discrepancies without pagination
        const { discrepancies } = await (0, weightReconciliation_service_1.getWeightDiscrepancies)({ ...filters, limit: 10000 });
        // Generate CSV
        const headers = [
            'Order Number',
            'AWB Number',
            'Courier',
            'Order Type',
            'Declared Weight (kg)',
            'Actual Weight (kg)',
            'Volumetric Weight (kg)',
            'Charged Weight (kg)',
            'Weight Difference (kg)',
            'Original Charge (₹)',
            'Revised Charge (₹)',
            'Additional Charge (₹)',
            'Status',
            'Auto Accepted',
            'Has Dispute',
            'Created At',
            'Resolved At',
        ];
        const rows = discrepancies.map((d) => [
            d.order_number,
            d.awb_number || '',
            d.courier_partner || '',
            d.order_type,
            Number(d.declared_weight).toFixed(3),
            d.actual_weight ? Number(d.actual_weight).toFixed(3) : '',
            d.volumetric_weight ? Number(d.volumetric_weight).toFixed(3) : '',
            Number(d.charged_weight).toFixed(3),
            Number(d.weight_difference).toFixed(3),
            d.original_shipping_charge || '',
            d.revised_shipping_charge || '',
            Number(d.additional_charge || 0).toFixed(2),
            d.status,
            d.auto_accepted ? 'Yes' : 'No',
            d.has_dispute ? 'Yes' : 'No',
            d.created_at ? new Date(d.created_at).toISOString() : '',
            d.resolved_at ? new Date(d.resolved_at).toISOString() : '',
        ]);
        const csv = (0, csv_1.buildCsv)(headers, rows);
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="weight-discrepancies-${new Date().toISOString().split('T')[0]}.csv"`);
        return res.send(csv);
    }
    catch (error) {
        console.error('Error exporting discrepancies:', error);
        return res.status(500).json({ error: error.message || 'Failed to export discrepancies' });
    }
}
/**
 * Manually report a weight discrepancy for an order
 * POST /api/weight-reconciliation/discrepancies/manual-report
 */
async function manuallyReportDiscrepancy(req, res) {
    try {
        const userId = req.user?.sub;
        if (!userId) {
            return res.status(401).json({ error: 'Unauthorized' });
        }
        const { orderNumber, orderType = 'b2c', actualWeight, actualDimensions, courierReportedChargedWeight, evidenceUrls, notes, } = req.body;
        // Validate required fields
        if (!orderNumber) {
            return res.status(400).json({ error: 'Order number is required' });
        }
        // Get order
        const orderTable = orderType === 'b2c' ? schema_1.b2c_orders : schema_1.b2b_orders;
        const [order] = await client_1.db
            .select()
            .from(orderTable)
            .where((0, drizzle_orm_1.eq)(orderTable.order_number, orderNumber));
        if (!order) {
            return res.status(404).json({ error: 'Order not found' });
        }
        if (order.user_id !== userId) {
            return res.status(403).json({ error: 'Unauthorized to report for this order' });
        }
        // Calculate weights
        const declaredWeight = Number(order.weight);
        const declaredDimensions = {
            length: Number(order.length || 0),
            breadth: Number(order.breadth || 0),
            height: Number(order.height || 0),
        };
        let volumetricWeight;
        let chargedWeight;
        // Calculate volumetric weight if dimensions provided
        if (actualDimensions?.length && actualDimensions?.breadth && actualDimensions?.height) {
            volumetricWeight = (0, courierWeightCalculation_service_1.calculateVolumetricWeight)(actualDimensions, order.courier_partner || undefined);
        }
        // Determine charged weight
        if (courierReportedChargedWeight) {
            chargedWeight = Number(courierReportedChargedWeight);
        }
        else if (actualWeight && volumetricWeight) {
            chargedWeight = (0, courierWeightCalculation_service_1.calculateChargedWeight)(actualWeight, volumetricWeight, order.courier_partner || undefined);
        }
        else if (actualWeight) {
            chargedWeight = (0, courierWeightCalculation_service_1.roundToWeightSlab)(actualWeight, order.courier_partner || undefined);
        }
        else {
            return res
                .status(400)
                .json({ error: 'Must provide either actualWeight or courierReportedChargedWeight' });
        }
        // Create discrepancy
        const discrepancy = await (0, weightReconciliation_service_1.createWeightDiscrepancy)({
            orderType: orderType,
            orderId: order.id,
            userId,
            orderNumber,
            awbNumber: order.awb_number || undefined,
            courierPartner: order.courier_partner || undefined,
            declaredWeight,
            actualWeight: actualWeight ? Number(actualWeight) : undefined,
            volumetricWeight,
            chargedWeight,
            declaredDimensions,
            actualDimensions,
            originalShippingCharge: Number(order.shipping_charges || 0),
            courierRemarks: notes,
        });
        // If evidence URLs provided, create a dispute automatically
        if (evidenceUrls && evidenceUrls.length > 0) {
            await (0, weightReconciliation_service_1.createWeightDispute)({
                discrepancyId: discrepancy.id,
                userId,
                disputeReason: 'Manual weight report with evidence',
                customerComment: notes,
                evidenceUrls,
            });
        }
        res.json(discrepancy);
    }
    catch (error) {
        console.error('Error manually reporting discrepancy:', error);
        res.status(500).json({ error: 'Failed to report discrepancy' });
    }
}

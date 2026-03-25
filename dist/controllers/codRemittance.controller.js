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
Object.defineProperty(exports, "__esModule", { value: true });
exports.exportRemittances = exports.exportSingleSettlement = exports.updateRemittance = exports.getRemittanceStats = exports.getRemittances = exports.getCodDashboard = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../models/client");
const codRemittance_1 = require("../models/schema/codRemittance");
const csv_1 = require("../utils/csv");
const codRemittance_service_1 = require("../models/services/codRemittance.service");
/**
 * Get COD dashboard summary
 */
const getCodDashboard = async (req, res) => {
    try {
        const userId = req.user?.sub;
        if (!userId) {
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        }
        const summary = await (0, codRemittance_service_1.getCodDashboardSummary)(userId);
        return res.json({ success: true, data: summary });
    }
    catch (error) {
        console.error('[getCodDashboard] Error:', error);
        return res.status(500).json({ success: false, message: 'Failed to fetch COD dashboard' });
    }
};
exports.getCodDashboard = getCodDashboard;
/**
 * Get all COD remittances for logged-in user
 */
const getRemittances = async (req, res) => {
    try {
        const userId = req.user?.sub;
        if (!userId) {
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        }
        const { status, fromDate, toDate, page, limit } = req.query;
        const filters = {};
        if (status)
            filters.status = status;
        if (fromDate)
            filters.fromDate = new Date(fromDate);
        if (toDate)
            filters.toDate = new Date(toDate);
        if (page)
            filters.page = parseInt(page);
        if (limit)
            filters.limit = parseInt(limit);
        const result = await (0, codRemittance_service_1.getCodRemittances)(userId, filters);
        return res.json({ success: true, data: result });
    }
    catch (error) {
        console.error('[getRemittances] Error:', error);
        return res.status(500).json({ success: false, message: 'Failed to fetch remittances' });
    }
};
exports.getRemittances = getRemittances;
/**
 * Get COD remittance statistics
 */
const getRemittanceStats = async (req, res) => {
    try {
        const userId = req.user?.sub;
        if (!userId) {
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        }
        const stats = await (0, codRemittance_service_1.getCodRemittanceStats)(userId);
        return res.json({ success: true, data: stats });
    }
    catch (error) {
        console.error('[getRemittanceStats] Error:', error);
        return res.status(500).json({ success: false, message: 'Failed to fetch stats' });
    }
};
exports.getRemittanceStats = getRemittanceStats;
/**
 * Update remittance notes
 */
const updateRemittance = async (req, res) => {
    try {
        const { remittanceId } = req.params;
        const { notes } = req.body;
        if (!remittanceId) {
            return res.status(400).json({ success: false, message: 'Remittance ID required' });
        }
        const userId = req.user?.sub;
        if (!userId) {
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        }
        const [remittance] = await client_1.db
            .select({ id: codRemittance_1.codRemittances.id, userId: codRemittance_1.codRemittances.userId })
            .from(codRemittance_1.codRemittances)
            .where((0, drizzle_orm_1.eq)(codRemittance_1.codRemittances.id, remittanceId))
            .limit(1);
        if (!remittance) {
            return res.status(404).json({ success: false, message: 'Remittance not found' });
        }
        if (remittance.userId !== userId) {
            return res.status(403).json({ success: false, message: 'Forbidden' });
        }
        const updated = await (0, codRemittance_service_1.updateCodRemittanceNotes)(remittanceId, notes);
        return res.json({ success: true, data: updated });
    }
    catch (error) {
        console.error('[updateRemittance] Error:', error);
        return res.status(500).json({ success: false, message: 'Failed to update remittance' });
    }
};
exports.updateRemittance = updateRemittance;
/**
 * Export single settlement as detailed CSV receipt
 */
const exportSingleSettlement = async (req, res) => {
    try {
        const userId = req.user?.sub;
        const { remittanceId } = req.params;
        if (!userId) {
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        }
        if (!remittanceId) {
            return res.status(400).json({ success: false, message: 'Remittance ID required' });
        }
        // Get the specific remittance with all details
        const { db } = await Promise.resolve().then(() => __importStar(require('../models/client')));
        const { codRemittances } = await Promise.resolve().then(() => __importStar(require('../models/schema/codRemittance')));
        const { users } = await Promise.resolve().then(() => __importStar(require('../models/schema/users')));
        const { wallets } = await Promise.resolve().then(() => __importStar(require('../models/schema/wallet')));
        const { eq } = await Promise.resolve().then(() => __importStar(require('drizzle-orm')));
        const [remittance] = await db
            .select({
            // Remittance details
            id: codRemittances.id,
            orderNumber: codRemittances.orderNumber,
            awbNumber: codRemittances.awbNumber,
            courierPartner: codRemittances.courierPartner,
            codAmount: codRemittances.codAmount,
            codCharges: codRemittances.codCharges,
            shippingCharges: codRemittances.shippingCharges,
            deductions: codRemittances.deductions,
            remittableAmount: codRemittances.remittableAmount,
            status: codRemittances.status,
            collectedAt: codRemittances.collectedAt,
            creditedAt: codRemittances.creditedAt,
            notes: codRemittances.notes,
            createdAt: codRemittances.createdAt,
            walletTransactionId: codRemittances.walletTransactionId,
            // User details
            userEmail: users.email,
            userId: users.id,
        })
            .from(codRemittances)
            .leftJoin(users, eq(codRemittances.userId, users.id))
            .where(eq(codRemittances.id, remittanceId));
        if (!remittance) {
            return res.status(404).json({ success: false, message: 'Settlement not found' });
        }
        // Verify ownership
        if (remittance.userId !== userId) {
            return res.status(403).json({ success: false, message: 'Access denied' });
        }
        // Create detailed settlement report
        const codCharges = Number(remittance.codCharges || 0);
        const freightCharges = Number(remittance.shippingCharges || 0);
        const totalDeductions = Number(remittance.deductions || 0);
        const otherDeductions = totalDeductions - codCharges - freightCharges;
        const report = [];
        // Header
        report.push(['COD SETTLEMENT RECEIPT']);
        report.push(['']);
        // Settlement Info
        report.push(['Settlement ID:', remittance.id]);
        report.push([
            'Settlement Date:',
            remittance.creditedAt ? new Date(remittance.creditedAt).toLocaleString('en-IN') : 'Pending',
        ]);
        report.push(['Status:', remittance.status?.toUpperCase()]);
        report.push(['']);
        // Order Details
        report.push(['ORDER DETAILS']);
        report.push(['Order Number:', remittance.orderNumber]);
        report.push(['AWB Number:', remittance.awbNumber || 'N/A']);
        report.push(['Courier Partner:', remittance.courierPartner || 'N/A']);
        report.push([
            'Delivery Date:',
            remittance.collectedAt ? new Date(remittance.collectedAt).toLocaleDateString('en-IN') : 'N/A',
        ]);
        report.push(['']);
        // Amount Breakdown
        report.push(['AMOUNT BREAKDOWN']);
        report.push(['COD Amount Collected:', `₹${Number(remittance.codAmount || 0).toFixed(2)}`]);
        report.push(['']);
        report.push(['DEDUCTIONS:']);
        report.push(['  COD Charges:', `₹${codCharges.toFixed(2)}`]);
        report.push(['  Freight Charges:', `₹${freightCharges.toFixed(2)}`]);
        if (otherDeductions > 0) {
            report.push(['  Other Deductions:', `₹${otherDeductions.toFixed(2)}`]);
        }
        report.push(['  Total Deductions:', `₹${totalDeductions.toFixed(2)}`]);
        report.push(['']);
        report.push(['NET AMOUNT REMITTED:', `₹${Number(remittance.remittableAmount || 0).toFixed(2)}`]);
        report.push(['']);
        // Settlement Notes
        if (remittance.notes) {
            report.push(['Settlement Notes:', remittance.notes]);
            report.push(['']);
        }
        // Transaction Details
        if (remittance.walletTransactionId) {
            report.push(['Wallet Transaction ID:', remittance.walletTransactionId]);
        }
        // Footer
        report.push(['']);
        report.push(['Generated on:', new Date().toLocaleString('en-IN')]);
        report.push(['Merchant Email:', remittance.userEmail]);
        // Convert to CSV
        const csv = report.map((row) => row.join(',')).join('\n');
        // Generate filename
        const filename = `Settlement_${remittance.orderNumber}_${remittance.id.substring(0, 8)}.csv`;
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
        // Add BOM for Excel compatibility
        return res.send('\uFEFF' + csv);
    }
    catch (error) {
        console.error('[exportSingleSettlement] Error:', error);
        return res.status(500).json({ success: false, message: 'Failed to export settlement' });
    }
};
exports.exportSingleSettlement = exportSingleSettlement;
/**
 * Export remittances as CSV (Enhanced with detailed settlement info)
 */
const exportRemittances = async (req, res) => {
    try {
        const userId = req.user?.sub;
        if (!userId) {
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        }
        const { status, fromDate, toDate } = req.query;
        const filters = { limit: 10000 };
        if (status)
            filters.status = status;
        if (fromDate)
            filters.fromDate = new Date(fromDate);
        if (toDate)
            filters.toDate = new Date(toDate);
        const result = await (0, codRemittance_service_1.getCodRemittances)(userId, filters);
        // Enhanced headers with settlement details
        const headers = [
            'Order Number',
            'AWB Number',
            'Courier Partner',
            'COD Amount Collected',
            'COD Charges',
            'Freight Charges',
            'Other Deductions',
            'Total Deductions',
            'Net Remittable Amount',
            'Status',
            'Order Delivered Date',
            'Settlement Credited Date',
            'Settlement Notes',
            'Created Date',
        ];
        const rows = result.remittances.map((r) => {
            // Calculate individual deduction components
            const codCharges = Number(r.codCharges || 0);
            const freightCharges = Number(r.shippingCharges || 0);
            const totalDeductions = Number(r.deductions || 0);
            const otherDeductions = totalDeductions - codCharges - freightCharges;
            return [
                r.orderNumber || '',
                r.awbNumber || 'N/A',
                r.courierPartner || 'N/A',
                r.codAmount || 0,
                codCharges,
                freightCharges,
                otherDeductions > 0 ? otherDeductions : 0,
                totalDeductions,
                r.remittableAmount || 0,
                r.status?.toUpperCase() || 'PENDING',
                r.collectedAt ? new Date(r.collectedAt).toLocaleDateString('en-IN') : 'N/A',
                r.creditedAt ? new Date(r.creditedAt).toLocaleDateString('en-IN') : 'Not Yet Settled',
                r.notes || '',
                r.createdAt ? new Date(r.createdAt).toLocaleDateString('en-IN') : '',
            ];
        });
        // Create CSV content
        const csv = (0, csv_1.buildCsv)(headers, rows);
        // Generate filename with date range
        const today = new Date().toISOString().split('T')[0];
        const filename = `COD_Settlement_${today}.csv`;
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
        return res.send(csv);
    }
    catch (error) {
        console.error('[exportRemittances] Error:', error);
        return res.status(500).json({ success: false, message: 'Failed to export remittances' });
    }
};
exports.exportRemittances = exportRemittances;

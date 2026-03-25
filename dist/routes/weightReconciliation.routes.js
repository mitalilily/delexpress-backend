"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const weightReconciliation_controller_1 = require("../controllers/weightReconciliation.controller");
const requireAuth_1 = require("../middlewares/requireAuth");
const router = (0, express_1.Router)();
// All routes require authentication
router.use(requireAuth_1.requireAuth);
// Discrepancies
router.get('/discrepancies', weightReconciliation_controller_1.getDiscrepancies);
router.get('/discrepancies/:id', weightReconciliation_controller_1.getDiscrepancyDetails);
router.post('/discrepancies/:id/accept', weightReconciliation_controller_1.acceptDiscrepancy);
router.post('/discrepancies/:id/reject', weightReconciliation_controller_1.rejectDiscrepancy);
router.post('/discrepancies/bulk-accept', weightReconciliation_controller_1.bulkAccept);
router.post('/discrepancies/bulk-reject', weightReconciliation_controller_1.bulkReject);
router.post('/discrepancies/manual-report', weightReconciliation_controller_1.manuallyReportDiscrepancy);
// Export
router.get('/export', weightReconciliation_controller_1.exportDiscrepancies);
// Disputes
router.post('/disputes', weightReconciliation_controller_1.createDispute);
router.get('/disputes', weightReconciliation_controller_1.getDisputes);
// Summary & Analytics
router.get('/summary', weightReconciliation_controller_1.getSummary);
// Settings
router.get('/settings', weightReconciliation_controller_1.getSettings);
router.put('/settings', weightReconciliation_controller_1.updateSettings);
exports.default = router;

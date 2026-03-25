"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const weightReconciliationAdmin_controller_1 = require("../../controllers/admin/weightReconciliationAdmin.controller");
const isAdmin_1 = require("../../middlewares/isAdmin");
const requireAuth_1 = require("../../middlewares/requireAuth");
const router = (0, express_1.Router)();
// All routes require authentication and admin role
router.use(requireAuth_1.requireAuth, isAdmin_1.isAdminMiddleware);
// Discrepancies
router.get('/discrepancies', weightReconciliationAdmin_controller_1.getAllDiscrepancies);
// Disputes
router.get('/disputes', weightReconciliationAdmin_controller_1.getAllDisputes);
router.post('/disputes/:id/approve', weightReconciliationAdmin_controller_1.approveDispute);
router.post('/disputes/:id/reject', weightReconciliationAdmin_controller_1.rejectDispute);
// Dashboard stats
router.get('/stats', weightReconciliationAdmin_controller_1.getAdminWeightStats);
exports.default = router;

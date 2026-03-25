"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const codCsvUpload_admin_controller_1 = require("../../controllers/admin/codCsvUpload.admin.controller");
const codRemittance_admin_controller_1 = require("../../controllers/admin/codRemittance.admin.controller");
const isAdmin_1 = require("../../middlewares/isAdmin");
const requireAuth_1 = require("../../middlewares/requireAuth");
const router = express_1.default.Router();
// All routes require authentication and admin role
router.use(requireAuth_1.requireAuth);
router.use(isAdmin_1.isAdminMiddleware);
// Platform stats
router.get('/stats', codRemittance_admin_controller_1.getCodPlatformStats);
// All remittances (admin view)
router.get('/remittances', codRemittance_admin_controller_1.getAllCodRemittances);
router.get('/remittances/export', codRemittance_admin_controller_1.exportAllCodRemittances);
// User-specific view
router.get('/users/:userId/remittances', codRemittance_admin_controller_1.getUserCodRemittances);
// Admin actions - Single remittance
router.post('/remittances/:remittanceId/credit', codRemittance_admin_controller_1.manualCreditWallet);
router.patch('/remittances/:remittanceId/notes', codRemittance_admin_controller_1.updateRemittanceNotes);
// CSV Upload for Settlement (Two-step: Preview then Confirm)
router.post('/preview-settlement-csv', codCsvUpload_admin_controller_1.previewCourierSettlementCsv);
router.post('/confirm-settlement', codCsvUpload_admin_controller_1.confirmCourierSettlement);
router.get('/csv-template', codCsvUpload_admin_controller_1.getSettlementCsvTemplate);
// DEBUG: Check database status
router.get('/debug-remittances', codCsvUpload_admin_controller_1.debugCodRemittances);
exports.default = router;

"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const codRemittance_controller_1 = require("../controllers/codRemittance.controller");
const requireAuth_1 = require("../middlewares/requireAuth");
const router = express_1.default.Router();
// All routes require authentication
router.use(requireAuth_1.requireAuth);
// Dashboard
router.get('/dashboard', codRemittance_controller_1.getCodDashboard);
// Remittances
router.get('/remittances', codRemittance_controller_1.getRemittances);
router.get('/remittances/stats', codRemittance_controller_1.getRemittanceStats);
router.get('/remittances/export', codRemittance_controller_1.exportRemittances);
router.get('/remittances/:remittanceId/export', codRemittance_controller_1.exportSingleSettlement); // Single settlement export
router.patch('/remittances/:remittanceId', codRemittance_controller_1.updateRemittance);
exports.default = router;

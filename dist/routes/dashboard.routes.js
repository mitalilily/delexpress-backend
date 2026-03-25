"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// routes/dashboardRoutes.ts
const express_1 = __importDefault(require("express"));
const dashboard_controller_1 = require("../controllers/dashboard.controller");
const dashboardPreferences_controller_1 = require("../controllers/dashboardPreferences.controller");
const requireAuth_1 = require("../middlewares/requireAuth");
const router = express_1.default.Router();
router.get('/incoming', requireAuth_1.requireAuth, dashboard_controller_1.getHomePickups);
router.get('/pending-actions', requireAuth_1.requireAuth, dashboard_controller_1.getDashboardPendingActions);
router.get('/invoice-status', requireAuth_1.requireAuth, dashboard_controller_1.getDashboardInvoiceStatus);
router.get('/top-destinations', requireAuth_1.requireAuth, dashboard_controller_1.getDashboardTopDestinations);
router.get('/courier-distribution', requireAuth_1.requireAuth, dashboard_controller_1.getDashboardCourierDistribution);
router.get('/stats', requireAuth_1.requireAuth, dashboard_controller_1.getMerchantDashboardStatsController);
router.get('/preferences', requireAuth_1.requireAuth, dashboardPreferences_controller_1.getDashboardPreferencesController);
router.post('/preferences', requireAuth_1.requireAuth, dashboardPreferences_controller_1.saveDashboardPreferencesController);
exports.default = router;

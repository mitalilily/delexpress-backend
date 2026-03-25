"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const billingPreferences_controller_1 = require("../controllers/billingPreferences.controller");
const requireAuth_1 = require("../middlewares/requireAuth");
const isAdmin_1 = require("../middlewares/isAdmin");
// Create router instance
const router = (0, express_1.Router)();
/**
 * @route   GET /api/billing-preferences/:userId
 * @desc    Get billing preference for a specific user
 * @access  Admin or Authenticated Seller
 */
router.get('/', requireAuth_1.requireAuth, async (req, res) => {
    return billingPreferences_controller_1.BillingPreferencesController.getBillingPreference(req, res);
});
/**
 * @route   POST /api/billing-preferences
 * @desc    Create or update billing preference for the **authenticated admin user**
 *          (kept for backwards compatibility; sellers are blocked by isAdminMiddleware)
 * @access  Admin only
 */
router.post('/', requireAuth_1.requireAuth, isAdmin_1.isAdminMiddleware, async (req, res) => {
    return billingPreferences_controller_1.BillingPreferencesController.upsertBillingPreference(req, res);
});
// Export router
exports.default = router;

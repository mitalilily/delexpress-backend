"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const paymentOptions_controller_1 = require("../../controllers/paymentOptions.controller");
const isAdmin_1 = require("../../middlewares/isAdmin");
const requireAuth_1 = require("../../middlewares/requireAuth");
const router = (0, express_1.Router)();
// All routes require admin authentication
router.use(requireAuth_1.requireAuth);
router.use(isAdmin_1.isAdminMiddleware);
// Get payment options
router.get('/', paymentOptions_controller_1.getPaymentOptionsController);
// Update payment options
router.put('/', paymentOptions_controller_1.updatePaymentOptionsController);
exports.default = router;

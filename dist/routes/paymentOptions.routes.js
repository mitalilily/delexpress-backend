"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const paymentOptions_controller_1 = require("../controllers/paymentOptions.controller");
const isAdmin_1 = require("../middlewares/isAdmin");
const requireAuth_1 = require("../middlewares/requireAuth");
const router = (0, express_1.Router)();
// Public endpoint - anyone can check payment options
router.get('/', paymentOptions_controller_1.getPaymentOptionsController);
// Admin endpoint - only admins can update
router.put('/', requireAuth_1.requireAuth, isAdmin_1.isAdminMiddleware, paymentOptions_controller_1.updatePaymentOptionsController);
exports.default = router;

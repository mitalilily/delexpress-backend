"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const adminBillingPreferences_controller_1 = require("../../controllers/adminBillingPreferences.controller");
const isAdmin_1 = require("../../middlewares/isAdmin");
const requireAuth_1 = require("../../middlewares/requireAuth");
const router = (0, express_1.Router)();
// All routes require admin authentication
router.use(requireAuth_1.requireAuth);
router.use(isAdmin_1.isAdminMiddleware);
// Update billing preference for a specific user
router.post('/user', (req, res) => adminBillingPreferences_controller_1.AdminBillingPreferencesController.upsertForUser(req, res));
// Apply billing preference to all users
router.post('/all', (req, res) => adminBillingPreferences_controller_1.AdminBillingPreferencesController.applyToAllUsers(req, res));
exports.default = router;

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// routes/labelPreferencesRoutes.ts
const express_1 = require("express");
const labelPreferences_controller_1 = require("../controllers/labelPreferences.controller");
const requireAuth_1 = require("../middlewares/requireAuth");
const router = (0, express_1.Router)();
router.get('/', requireAuth_1.requireAuth, labelPreferences_controller_1.labelPreferencesController.get);
router.post('/', requireAuth_1.requireAuth, labelPreferences_controller_1.labelPreferencesController.save);
exports.default = router;

"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const platformIntegration_controller_1 = require("../controllers/platformIntegration.controller");
const userController_1 = require("../controllers/userController");
const requireAuth_1 = require("../middlewares/requireAuth");
const router = express_1.default.Router();
router.post('/complete-user-onboarding', requireAuth_1.requireAuth, userController_1.completeRegistration);
router.get('/user-info', requireAuth_1.requireAuth, userController_1.getCurrentUser);
router.get('/user-info/:userId', requireAuth_1.requireAuth, userController_1.getUserById);
router.get('/integrations', requireAuth_1.requireAuth, platformIntegration_controller_1.getUserStoreIntegrations);
exports.default = router;

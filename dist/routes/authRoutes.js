"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const authController_1 = require("../controllers/authController");
const isAdmin_1 = require("../middlewares/isAdmin");
const requireAuth_1 = require("../middlewares/requireAuth");
const router = (0, express_1.Router)();
router.post('/admin/login', authController_1.adminLoginController);
router.post('/admin/change-password', requireAuth_1.requireAuth, isAdmin_1.isAdminMiddleware, authController_1.adminChangePasswordController);
router.post('/request-otp', authController_1.requestOtp);
router.post('/verify-otp', authController_1.verifyOtp);
router.post('/request-password-login', authController_1.requestEmailVerification);
router.post('/verify-user-email', authController_1.verifyEmailToken);
router.post('/signin-with-google', authController_1.googleOAuthLogin);
// router.post("/login", loginController);
router.post('/refresh-token', authController_1.refreshTokenController); // ✅ No auth needed - uses refresh token
router.post('/logout', authController_1.logoutController); // ✅ Logout should work even if access token expired
exports.default = router;

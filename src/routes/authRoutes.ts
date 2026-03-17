import { Router } from 'express'
import {
  adminChangePasswordController,
  adminLoginController,
  googleOAuthLogin,
  logoutController,
  //   loginController,
  //   logoutController,
  refreshTokenController,
  requestEmailVerification,
  requestOtp,
  verifyEmailToken,
  verifyOtp,
} from '../controllers/authController'
import { isAdminMiddleware } from '../middlewares/isAdmin'
import { requireAuth } from '../middlewares/requireAuth'

const router = Router()

router.post('/admin/login', adminLoginController)
router.post('/admin/change-password', requireAuth, isAdminMiddleware, adminChangePasswordController)

router.post('/request-otp', requestOtp)
router.post('/verify-otp', verifyOtp)

router.post('/request-password-login', requestEmailVerification)

router.post('/verify-user-email', verifyEmailToken)
router.post('/signin-with-google', googleOAuthLogin)

// router.post("/login", loginController);
router.post('/refresh-token', refreshTokenController) // ✅ No auth needed - uses refresh token
router.post('/logout', logoutController) // ✅ Logout should work even if access token expired

export default router

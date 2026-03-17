import express from "express";

import { requireAuth } from "../middlewares/requireAuth";
import {
  getUserProfile,
  patchChangePassword,
  requestEmailVerificationOtp,
  requestPhoneVerificationOtp,
  updateUserProfile,
  verifyProfileEmailOtp,
  verifyProfilePhoneOtp,
} from "../controllers/userProfile.controller";
import {
  extractTextFromImage,
  getKycDetails,
  storeKycDetails,
} from "../controllers/kyc.controller";
import { getUserStoreIntegrations } from "../controllers/platformIntegration.controller";

const router = express.Router();

router.use(requireAuth);

router.get("/user", getUserProfile);
router.patch("/", updateUserProfile);
router.post("/request-email-verification", requestEmailVerificationOtp);
router.post("/verify-profile-email", verifyProfileEmailOtp);

router.post("/request-phone-verification", requestPhoneVerificationOtp);
router.post("/verify-profile-phone", verifyProfilePhoneOtp);

router.post("/kyc", storeKycDetails);
router.get("/kyc", getKycDetails);
router.post("/extract-text", extractTextFromImage);

router.patch("/profile-password", requireAuth, patchChangePassword);
export default router;

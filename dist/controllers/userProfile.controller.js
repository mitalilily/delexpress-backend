"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyProfilePhoneOtp = exports.requestPhoneVerificationOtp = exports.verifyProfileEmailOtp = exports.requestEmailVerificationOtp = exports.updateUserProfile = exports.getUserProfile = void 0;
exports.patchChangePassword = patchChangePassword;
const userProfile_service_1 = require("../models/services/userProfile.service");
const classes_1 = require("../utils/classes");
/** GET /user-profiles/me */
const getUserProfile = async (req, res, next) => {
    try {
        const userId = req.user.sub;
        const profile = await (0, userProfile_service_1.getProfileByUserId)(userId);
        if (!profile) {
            return res.status(404).json({ message: "Profile not found" });
        }
        res.json(profile);
    }
    catch (err) {
        next(err);
    }
};
exports.getUserProfile = getUserProfile;
const updateUserProfile = async (req, res) => {
    const userId = req.user.sub;
    try {
        const updated = await (0, userProfile_service_1.updateUserProfileService)(userId, req.body);
        if (!updated) {
            return res.status(404).json({ message: "User not found" });
        }
        return res.status(200).json({ message: "Profile updated", user: updated });
    }
    catch (error) {
        if (error instanceof classes_1.HttpError) {
            return res.status(error.statusCode).json({ message: error.message });
        }
        console.error("Error updating profile:", error);
        return res.status(500).json({ message: "Failed to update profile" });
    }
};
exports.updateUserProfile = updateUserProfile;
const requestEmailVerificationOtp = async (req, res) => {
    const userId = req.user.sub;
    const { updatedEmail } = req.body;
    try {
        await (0, userProfile_service_1.requestProfileEmailVerificationOTP)(userId, updatedEmail);
        /* Service succeeded */
        return res
            .status(201)
            .json({ message: "Verification e‑mail sent", email: updatedEmail });
    }
    catch (err) {
        if (err instanceof classes_1.HttpError) {
            return res.status(err.statusCode).json({ message: err.message });
        }
        console.error("Email‑OTP error:", err);
        return res
            .status(500)
            .json({ message: "Failed to send verification e‑mail" });
    }
};
exports.requestEmailVerificationOtp = requestEmailVerificationOtp;
const verifyProfileEmailOtp = async (req, res) => {
    const userId = req.user.sub;
    const { otp, email } = req.body;
    try {
        const verifiedEmail = await (0, userProfile_service_1.verifyProfileEmailOTP)(userId, email, otp); // ✅ verify OTP
        return res
            .status(200)
            .json({ message: "Email verified successfully", email: verifiedEmail });
    }
    catch (err) {
        if (err instanceof classes_1.HttpError) {
            return res.status(err.statusCode).json({ message: err.message });
        }
        console.error("Email‑OTP verification failed:", err);
        return res.status(500).json({ message: "Verification failed" });
    }
};
exports.verifyProfileEmailOtp = verifyProfileEmailOtp;
const requestPhoneVerificationOtp = async (req, res) => {
    const userId = req.user.sub;
    const { updatedPhone } = req.body;
    try {
        await (0, userProfile_service_1.requestProfilePhoneVerificationOTP)(userId, updatedPhone);
        /* Service succeeded */
        return res
            .status(201)
            .json({ message: "Verification otp sent", phone: updatedPhone });
    }
    catch (err) {
        if (err instanceof classes_1.HttpError) {
            return res.status(err.statusCode).json({ message: err.message });
        }
        console.error("Phone Otp error:", err);
        return res
            .status(500)
            .json({ message: "Failed to send verification otp to phone" });
    }
};
exports.requestPhoneVerificationOtp = requestPhoneVerificationOtp;
const verifyProfilePhoneOtp = async (req, res) => {
    const userId = req.user.sub;
    const { otp, phone } = req.body;
    try {
        const verifiedPhone = await (0, userProfile_service_1.verifyProfilePhoneOTP)(userId, phone, otp); // ✅ verify OTP
        return res
            .status(200)
            .json({ message: "Phone verified successfully", phone: verifiedPhone });
    }
    catch (err) {
        if (err instanceof classes_1.HttpError) {
            return res.status(err.statusCode).json({ message: err.message });
        }
        console.error("Phone verification failed:", err);
        return res.status(500).json({ message: "Verification failed" });
    }
};
exports.verifyProfilePhoneOtp = verifyProfilePhoneOtp;
async function patchChangePassword(req, res) {
    const userId = req.user.sub; // set by requireAuth
    const { currentPassword, newPassword } = req.body;
    if (!newPassword) {
        return res.status(400).json({ message: "New password is required" });
    }
    try {
        await (0, userProfile_service_1.changePassword)(userId, newPassword, currentPassword);
        res.json({
            message: currentPassword
                ? "Password updated successfully"
                : "Password set successfully",
        });
    }
    catch (error) {
        res.status(400).json({
            message: error.message ?? "Password update failed",
        });
    }
}

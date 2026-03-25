"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminChangePasswordController = exports.adminLoginController = exports.googleOAuthLogin = exports.verifyEmailToken = exports.requestEmailVerification = exports.verifyOtp = exports.requestOtp = exports.logoutController = exports.refreshTokenController = exports.generateOtp = void 0;
const dotenv = __importStar(require("dotenv"));
const google_auth_library_1 = require("google-auth-library");
const path_1 = __importDefault(require("path"));
const twilio_1 = __importDefault(require("twilio"));
const userService_1 = require("../models/services/userService");
const axios_1 = __importDefault(require("axios"));
const constants_1 = require("../utils/constants");
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../models/client");
const adminAuth_service_1 = require("../models/services/adminAuth.service");
const schema_1 = require("../schema/schema");
const emailSender_1 = require("../utils/emailSender");
const jwt_1 = require("../utils/jwt");
const env = process.env.NODE_ENV || 'development';
// Load the correct .env file
dotenv.config({ path: path_1.default.resolve(__dirname, `../.env.${env}`) });
const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const allowInlineOtp = process.env.ALLOW_INLINE_OTP === 'true';
const exposeAuthCodes = process.env.EXPOSE_AUTH_CODES !== 'false' || allowInlineOtp;
const generateOtp = () => Math.floor(100000 + Math.random() * 900000).toString();
exports.generateOtp = generateOtp;
const sendSmsViaTwilio = async (phone, message) => {
    const client = (0, twilio_1.default)(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    await client.messages.create({
        body: message,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: phone,
    });
};
/* ------------------------------------------------------------------ */
/* SILENT REFRESH                                                     */
/* ------------------------------------------------------------------ */
const refreshTokenController = async (req, res) => {
    /* 1. Grab the old refresh token from header or body */
    const oldToken = req.headers['x-refresh-token'] ||
        (req.headers.authorization?.startsWith('Bearer ')
            ? req.headers.authorization.split(' ')[1]
            : req.body?.refreshToken);
    if (!oldToken) {
        console.error('❌ [Refresh Token] No refresh token provided');
        return res.status(401).json({ error: 'No refresh token' });
    }
    try {
        /* 2. Verify & decode */
        const payload = (0, jwt_1.verifyRefreshToken)(oldToken); // throws if invalid/expired
        /* 3. Find user & ensure this is the latest token */
        const user = await (0, userService_1.findUserById)(payload.sub);
        if (!user) {
            console.error(`❌ [Refresh Token] User not found: ${payload.sub}`);
            return res.status(401).json({ error: 'User not found' });
        }
        const now = new Date();
        const matchesCurrent = Boolean(user.refreshToken) && user.refreshToken === oldToken;
        const matchesPrevious = !matchesCurrent &&
            Boolean(user.previousRefreshToken) &&
            user.previousRefreshToken === oldToken &&
            (!user.previousRefreshTokenExpiresAt ||
                now <= new Date(user.previousRefreshTokenExpiresAt));
        if (!matchesCurrent && !matchesPrevious) {
            console.error(`❌ [Refresh Token] Token mismatch for user ${user.id}`);
            return res.status(401).json({ error: 'Refresh token invalid or already used' });
        }
        // Check if refresh token has expired in database
        if (matchesCurrent && user.refreshTokenExpiresAt && now > new Date(user.refreshTokenExpiresAt)) {
            console.error(`❌ [Refresh Token] Refresh token expired for user ${user.id}`);
            return res.status(401).json({ error: 'Refresh token expired' });
        }
        if (matchesPrevious && user.previousRefreshTokenExpiresAt && now > new Date(user.previousRefreshTokenExpiresAt)) {
            console.error(`❌ [Refresh Token] Previous refresh token expired for user ${user.id}`);
            return res.status(401).json({ error: 'Refresh token expired' });
        }
        /* 4. Rotate: issue fresh tokens */
        const accessToken = (0, jwt_1.signAccessToken)(user.id, user.role ?? 'customer');
        const { token: refreshToken } = (0, jwt_1.signRefreshToken)(user.id, user.role ?? 'customer');
        /* 5. Persist only the raw refresh string */
        await (0, userService_1.saveRefreshToken)(user.id, refreshToken, ONE_WEEK_MS, matchesCurrent ? oldToken : null);
        console.log(`✅ [Refresh Token] Successfully refreshed tokens for user ${user.id}`);
        /* 6. Return both tokens to the client */
        return res.json({ accessToken, refreshToken });
    }
    catch (err) {
        console.error('❌ [Refresh Token] Error:', err?.message || err);
        if (err?.name === 'TokenExpiredError') {
            return res.status(401).json({ error: 'Refresh token expired' });
        }
        if (err?.name === 'JsonWebTokenError') {
            return res.status(401).json({ error: 'Invalid refresh token' });
        }
        return res.status(401).json({ error: 'Refresh token invalid or expired' });
    }
};
exports.refreshTokenController = refreshTokenController;
const logoutController = async (req, res) => {
    const token = req.headers['x-refresh-token'] ||
        (req.headers.authorization?.startsWith('Bearer ')
            ? req.headers.authorization.split(' ')[1]
            : null);
    if (token) {
        try {
            const { sub } = (0, jwt_1.verifyRefreshToken)(token); // decode userId
            await (0, userService_1.saveRefreshToken)(sub, null, 0, null); // 👈 always pass null
        }
        catch (e) {
            console.error('Logout token decode error:', e);
            // Ignore: still log user out client‑side
        }
    }
    return res.json({ message: 'Logged out' });
};
exports.logoutController = logoutController;
// -------------------
// Request OTP (Email-based)
// -------------------
const requestOtp = async (req, res) => {
    const { email } = req.body;
    if (!email)
        return res.status(400).json({ error: 'Email is required' });
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return res.status(400).json({ error: 'Invalid email format' });
    }
    const normalizedEmail = email.trim().toLowerCase();
    const otp = (0, exports.generateOtp)();
    const expiry = new Date(Date.now() + constants_1.OTP_EXPIRY);
    try {
        // 1. Look up user by email
        const user = await (0, userService_1.findUserByEmail)(normalizedEmail);
        if (user && user.role === 'employee') {
            const [employeeRecord] = await client_1.db
                .select({
                isActive: schema_1.employees.isActive,
            })
                .from(schema_1.employees)
                .where((0, drizzle_orm_1.eq)(schema_1.employees.userId, user.id));
            if (employeeRecord && !employeeRecord.isActive) {
                return res.status(403).json({
                    error: 'Your account is temporarily suspended by your administrator.',
                });
            }
        }
        if (user) {
            await (0, userService_1.updateUserOtpByEmail)(normalizedEmail, otp, expiry);
        }
        else {
            await (0, userService_1.createUserWithWallet)({
                email: normalizedEmail,
                otp,
                otpExpiresAt: expiry,
                onboardingStep: 0,
                emailVerified: false,
            });
        }
        if (!exposeAuthCodes) {
            await (0, emailSender_1.sendVerificationEmail)(normalizedEmail, otp);
        }
        return res.json({
            message: exposeAuthCodes
                ? 'Verification code generated successfully'
                : 'OTP sent successfully to your email',
            ...(exposeAuthCodes || env === 'development' || allowInlineOtp ? { otp } : {}),
        });
    }
    catch (err) {
        console.error('Error in requestOtp:', err);
        return res.status(500).json({ error: 'Something went wrong while requesting OTP' });
    }
};
exports.requestOtp = requestOtp;
const verifyOtp = async (req, res) => {
    const { email, otp } = req.body;
    if (!email || !otp)
        return res.status(400).json({ error: 'Email and OTP are required' });
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
        return res.status(400).json({ error: 'Invalid email format' });
    }
    try {
        const normalizedEmail = email.trim().toLowerCase();
        const user = await (0, userService_1.findUserByEmail)(normalizedEmail);
        if (user && user.role === 'employee') {
            const [employeeRecord] = await client_1.db
                .select({
                isActive: schema_1.employees.isActive,
            })
                .from(schema_1.employees)
                .where((0, drizzle_orm_1.eq)(schema_1.employees.userId, user.id));
            if (employeeRecord && !employeeRecord.isActive) {
                return res.status(403).json({
                    error: 'Your account is temporarily suspended by your administrator.',
                });
            }
        }
        if (!user || !user.otp || !user.otpExpiresAt) {
            return res.status(400).json({ error: 'OTP not requested' });
        }
        if (Date.now() > new Date(user.otpExpiresAt).getTime()) {
            return res.status(400).json({
                error: 'Your OTP is no longer valid. Please resend to receive a new one.',
            });
        }
        if (user.otp !== otp) {
            return res.status(400).json({ error: 'Incorrect OTP' });
        }
        await (0, userService_1.clearUserOtpByEmail)(normalizedEmail);
        await (0, userService_1.markEmailVerified)(normalizedEmail); // update emailVerified = true
        const accessToken = (0, jwt_1.signAccessToken)(user.id, user.role ?? 'customer');
        const { token: refreshToken } = (0, jwt_1.signRefreshToken)(user.id, user.role ?? 'customer');
        /* ---------- persist newest refresh token ---------- */
        await (0, userService_1.saveRefreshToken)(user.id, refreshToken, ONE_WEEK_MS);
        return res.json({
            message: 'OTP verified successfully',
            token: accessToken,
            refreshToken,
            user: {
                id: user.id,
                phone: user.phone,
                phoneVerified: user.phoneVerified,
                email: user.email,
                emailVerified: true,
                role: user.role,
            },
        });
    }
    catch (error) {
        console.error('Error in verifyOtp:', error);
        return res.status(500).json({ error: 'Something went wrong while verifying OTP' });
    }
};
exports.verifyOtp = verifyOtp;
const requestEmailVerification = async (req, res) => {
    const { idToken, password, email } = req.body;
    try {
        let userEmail = email;
        let googleId = null;
        // If idToken is provided, verify it to extract email and googleId
        if (idToken) {
            const googleUser = await (0, userService_1.verifyGoogleToken)(idToken);
            userEmail = googleUser.email;
            googleId = googleUser.googleId;
        }
        if (!userEmail) {
            return res.status(400).json({ error: 'Email is required' });
        }
        const result = await (0, userService_1.handleEmailVerificationRequest)(userEmail, password, googleId);
        const user = result.data?.user;
        // ✅ Employee active check
        if (user && user.role === 'employee') {
            const [employeeRecord] = await client_1.db
                .select({
                isActive: schema_1.employees.isActive,
            })
                .from(schema_1.employees)
                .where((0, drizzle_orm_1.eq)(schema_1.employees.userId, user.id));
            if (employeeRecord && !employeeRecord.isActive) {
                return res.status(403).json({
                    error: 'Your account is temporarily suspended by your administrator.',
                });
            }
        }
        // ── If the flow returned a user (authenticated / verified)
        if (user) {
            const accessToken = (0, jwt_1.signAccessToken)(user.id, user.role ?? 'customer');
            const { token: refreshToken } = (0, jwt_1.signRefreshToken)(user.id, user.role ?? 'customer');
            // Save refresh token to DB
            await (0, userService_1.saveRefreshToken)(user.id, refreshToken, ONE_WEEK_MS);
            result.data.token = accessToken;
            result.data.refreshToken = refreshToken;
        }
        return res.status(result.status).json(result.data);
    }
    catch (err) {
        console.error('Error in requestEmailVerification:', err);
        return res.status(401).json({ error: 'Invalid credentials or token' });
    }
};
exports.requestEmailVerification = requestEmailVerification;
const verifyEmailToken = async (req, res) => {
    const { email, token } = req.body;
    if (!email || !token) {
        return res.status(400).json({ error: 'Email and token are required' });
    }
    try {
        const user = await (0, userService_1.findUserByEmail)(email);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        if (user.emailVerificationToken !== token) {
            return res.status(400).json({ error: 'Invalid verification token' });
        }
        const expiresAt = user.emailVerificationTokenExpiresAt;
        if (!expiresAt || Date.now() > new Date(expiresAt).getTime()) {
            return res.status(400).json({ error: 'Verification token expired' });
        }
        await (0, userService_1.markEmailVerified)(email);
        await (0, userService_1.clearUserEmailToken)(email);
        /* ── Sign & Set JWTs ────────────────────────────────────────────── */
        const accessToken = (0, jwt_1.signAccessToken)(user.id, user.role ?? 'customer');
        const { token: refreshToken } = (0, jwt_1.signRefreshToken)(user.id, user.role ?? 'customer');
        /* ---------- persist newest refresh token ---------- */
        await (0, userService_1.saveRefreshToken)(user.id, refreshToken, ONE_WEEK_MS);
        return res.json({
            message: 'Email verified successfully',
            token: accessToken,
            refreshToken,
            user: {
                id: user.id,
                email: user.email,
                emailVerified: true,
                role: user.role,
            },
        });
    }
    catch (error) {
        console.error('verifyEmailToken error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
};
exports.verifyEmailToken = verifyEmailToken;
// Init Google client with your client ID
const googleClient = new google_auth_library_1.OAuth2Client(process.env.GOOGLE_CLIENT_ID);
const googleOAuthLogin = async (req, res) => {
    const { code } = req.body;
    if (!code)
        return res.status(400).json({ error: 'Missing authorization code' });
    try {
        // Step 1: Exchange code for access_token and id_token
        const tokenResponse = await axios_1.default.post('https://oauth2.googleapis.com/token', {
            code,
            client_id: process.env.GOOGLE_OAUTH_CLIENT_ID,
            client_secret: process.env.GOOGLE_OAUTH_CLIENT_SECRET,
            redirect_uri: 'postmessage',
            grant_type: 'authorization_code',
        });
        const { access_token, id_token } = tokenResponse.data;
        // ✅ Step 2: Verify id_token (crucial for security)
        const ticket = await googleClient.verifyIdToken({
            idToken: id_token,
            audience: process.env.GOOGLE_CLIENT_ID, // Make sure this matches
        });
        const payload = ticket.getPayload();
        if (!payload || !payload.email) {
            return res.status(400).json({ error: 'Google ID token is invalid or missing email' });
        }
        const { email, name, sub: googleId, picture } = payload;
        // ✅ Step 3: Create or update user
        let user = await (0, userService_1.findUserByEmail)(email);
        if (user) {
            await (0, userService_1.updateUserByEmail)(email, {
                googleId,
                profilePicture: picture,
                emailVerified: true,
                // firstName: user.firstName ?? name,
            });
        }
        else {
            await client_1.db.transaction(async (tx) => {
                /* 1️⃣  Create user + wallet */
                await (0, userService_1.createUserWithWallet)({
                    email,
                    googleId,
                    firstName: name,
                    phone: '',
                    emailVerified: true,
                    onboardingStep: 0,
                    onboardingComplete: false,
                    profilePicture: picture,
                }, tx);
                /* 2️⃣  Mark e‑mail as verified */
                await (0, userService_1.markEmailVerified)(email, tx);
                // Any thrown error aborts here and rolls back everything automatically.
            });
        }
        user = await (0, userService_1.findUserByEmail)(email);
        if (user) {
            /* ── Sign & Set JWTs ────────────────────────────────────────────── */
            const accessToken = (0, jwt_1.signAccessToken)(user.id, user.role ?? 'customer');
            const { token: refreshToken } = (0, jwt_1.signRefreshToken)(user.id, user.role ?? 'customer');
            /* ---------- persist newest refresh token ---------- */
            await (0, userService_1.saveRefreshToken)(user.id, refreshToken, ONE_WEEK_MS);
            return res.json({
                message: 'Google login successful',
                token: accessToken,
                refreshToken,
                user: {
                    id: user?.id,
                    email: user?.email,
                    emailVerified: user?.emailVerified,
                    phone: user?.phone,
                    phoneVerified: user?.phoneVerified,
                    profilePicture: user?.profilePicture,
                    role: user?.role,
                },
            });
        }
        else {
            return res.status(500).json({ error: 'User not found' });
        }
    }
    catch (error) {
        console.error('Google OAuth login failed:', error.response?.data || error.message);
        return res.status(500).json({ error: 'Google login failed' });
    }
};
exports.googleOAuthLogin = googleOAuthLogin;
const adminLoginController = async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password)
        return res.status(400).json({ error: 'Email and password are required' });
    try {
        const result = await (0, adminAuth_service_1.loginAdmin)(email, password);
        return res.status(200).json({
            message: 'Admin login successful',
            ...result,
        });
    }
    catch (err) {
        const isUnauthorized = err.message === 'Unauthorized' || err.message === 'Invalid credentials';
        return res
            .status(isUnauthorized ? 401 : 500)
            .json({ error: err.message || 'Internal server error' });
    }
};
exports.adminLoginController = adminLoginController;
const adminChangePasswordController = async (req, res) => {
    const adminId = req?.user?.sub;
    const { currentPassword, newPassword } = req.body;
    if (!adminId)
        return res.status(401).json({ error: 'Unauthorized' });
    if (!currentPassword || !newPassword) {
        return res.status(400).json({ error: 'Current password and new password are required' });
    }
    try {
        await (0, adminAuth_service_1.changeAdminPassword)(adminId, currentPassword, newPassword);
        return res.status(200).json({ message: 'Password changed successfully' });
    }
    catch (err) {
        const msg = err?.message || 'Internal server error';
        const status = msg === 'Unauthorized'
            ? 401
            : msg.includes('required') || msg.includes('must be') || msg.includes('incorrect')
                ? 400
                : 500;
        return res.status(status).json({ error: msg });
    }
};
exports.adminChangePasswordController = adminChangePasswordController;

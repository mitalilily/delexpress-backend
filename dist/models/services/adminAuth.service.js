"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.changeAdminPassword = exports.loginAdmin = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const drizzle_orm_1 = require("drizzle-orm");
const jwt_1 = require("../../utils/jwt");
const client_1 = require("../client");
const users_1 = require("../schema/users");
const userService_1 = require("./userService");
const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const loginAdmin = async (email, password) => {
    const user = await (0, userService_1.findUserByEmail)(email);
    if (!user || user.role !== "admin") {
        throw new Error("Unauthorized");
    }
    const isMatch = await bcryptjs_1.default.compare(password, user.passwordHash);
    if (!isMatch) {
        throw new Error("Invalid credentials");
    }
    const accessToken = (0, jwt_1.signAccessToken)(user.id, "admin");
    const { token: refreshToken } = (0, jwt_1.signRefreshToken)(user.id, "admin");
    await (0, userService_1.saveRefreshToken)(user.id, refreshToken, ONE_WEEK_MS);
    return {
        token: accessToken,
        refreshToken: refreshToken,
        user: {
            id: user.id,
            email: user.email,
            role: user.role,
            emailVerified: user.emailVerified,
        },
    };
};
exports.loginAdmin = loginAdmin;
const changeAdminPassword = async (adminId, currentPassword, newPassword) => {
    const user = await (0, userService_1.findUserById)(adminId);
    if (!user || user.role !== "admin") {
        throw new Error("Unauthorized");
    }
    if (!user.passwordHash) {
        throw new Error("Password is not set for this admin");
    }
    const isMatch = await bcryptjs_1.default.compare(currentPassword, user.passwordHash);
    if (!isMatch) {
        throw new Error("Current password is incorrect");
    }
    if (currentPassword === newPassword) {
        throw new Error("New password must be different from current password");
    }
    if (!/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[A-Za-z\d]{8,}/.test(newPassword)) {
        throw new Error("Password must be at least 8 characters and include upper, lower, and number");
    }
    const passwordHash = await bcryptjs_1.default.hash(newPassword, 10);
    await client_1.db.update(users_1.users).set({ passwordHash, updatedAt: new Date() }).where((0, drizzle_orm_1.eq)(users_1.users.id, adminId));
    // Invalidate old refresh token so admin re-auths cleanly on other sessions.
    await (0, userService_1.saveRefreshToken)(adminId, null, 0, null);
};
exports.changeAdminPassword = changeAdminPassword;

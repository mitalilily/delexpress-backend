"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAuth = void 0;
const jwt_1 = require("../utils/jwt");
const requireAuth = async (req, res, next) => {
    const auth = req.headers.authorization;
    if (!auth?.startsWith("Bearer ")) {
        return res.status(401).json({ error: "Missing token" });
    }
    try {
        const token = auth.split(" ")[1];
        const decoded = await (0, jwt_1.verifyAccessToken)(token); // ✅ await here
        if (!decoded || typeof decoded !== 'object') {
            return res.status(401).json({ error: "Invalid token payload" });
        }
        // Attach decoded token to request
        req.user = decoded;
        // Also expose userId for controllers that expect req.userId (for consistency with requireApiKey)
        req.userId = decoded.sub;
        next();
    }
    catch (err) {
        // Don't log TokenExpiredError as error - it's expected behavior
        if (err?.name === 'TokenExpiredError') {
            // Return 401 so frontend can attempt refresh
            return res.status(401).json({
                error: "Token expired",
                code: "TOKEN_EXPIRED"
            });
        }
        // Log other errors
        if (err?.name !== 'TokenExpiredError') {
            console.error("Token verification error:", err?.name || err?.message || err);
        }
        return res.status(401).json({
            error: "Token invalid or expired",
            code: err?.name || "TOKEN_INVALID"
        });
    }
};
exports.requireAuth = requireAuth;

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isAdminMiddleware = void 0;
// src/middlewares/isAdminMiddleware.ts
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../models/client");
const schema_1 = require("../schema/schema");
const isAdminMiddleware = async (req, res, next) => {
    try {
        const userId = req.user?.sub; // assuming you have auth middleware setting this
        if (!userId) {
            return res.status(401).json({ message: 'Unauthorized: No user ID found' });
        }
        const [user] = await client_1.db.select({ role: schema_1.users.role }).from(schema_1.users).where((0, drizzle_orm_1.eq)(schema_1.users.id, userId)); // ✅ Corrected usage
        if (!user || user.role !== 'admin') {
            return res.status(403).json({ message: 'Forbidden: Admin access only' });
        }
        next();
    }
    catch (error) {
        console.error('[isAdminMiddleware]', error);
        return res.status(500).json({ message: 'Internal server error' });
    }
};
exports.isAdminMiddleware = isAdminMiddleware;

"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const drizzle_orm_1 = require("drizzle-orm");
const uuid_1 = require("uuid");
const client_1 = require("../models/client");
const users_1 = require("../models/schema/users");
const ADMIN_EMAIL = 'admin@delexpress.in';
const ADMIN_PASSWORD = 'Admin@12345!';
async function ensureDelExpressAdmin() {
    const passwordHash = await bcryptjs_1.default.hash(ADMIN_PASSWORD, 10);
    const [existing] = await client_1.db.select().from(users_1.users).where((0, drizzle_orm_1.eq)(users_1.users.email, ADMIN_EMAIL));
    if (existing) {
        await client_1.db
            .update(users_1.users)
            .set({
            passwordHash,
            role: 'admin',
            emailVerified: true,
            updatedAt: new Date(),
        })
            .where((0, drizzle_orm_1.eq)(users_1.users.id, existing.id));
        console.log(`Updated admin credentials for ${ADMIN_EMAIL}`);
    }
    else {
        await client_1.db.insert(users_1.users).values({
            id: (0, uuid_1.v4)(),
            email: ADMIN_EMAIL,
            passwordHash,
            role: 'admin',
            emailVerified: true,
            phoneVerified: false,
            createdAt: new Date(),
            updatedAt: new Date(),
        });
        console.log(`Created admin user ${ADMIN_EMAIL}`);
    }
    console.log(`Admin login: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`);
}
ensureDelExpressAdmin()
    .catch((error) => {
    console.error('Failed to ensure DelExpress admin:', error);
    process.exitCode = 1;
})
    .finally(async () => {
    await client_1.pool.end();
});

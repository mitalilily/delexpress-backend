"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.seedAdmin = void 0;
// seedAdmin.ts
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const drizzle_orm_1 = require("drizzle-orm");
const uuid_1 = require("uuid");
const client_1 = require("../models/client");
const schema_1 = require("../schema/schema");
const seedAdmin = async ({ phone, password, email, role = 'admin', }) => {
    // check if user already exists
    const existing = await client_1.db.select().from(schema_1.users).where((0, drizzle_orm_1.eq)(schema_1.users.phone, phone));
    if (existing.length > 0)
        return existing[0];
    // hash password
    const hashedPassword = await bcryptjs_1.default.hash(password, 10);
    // insert new user
    const [newUser] = await client_1.db
        .insert(schema_1.users)
        .values({
        id: (0, uuid_1.v4)(),
        phone,
        email: email ?? null,
        passwordHash: hashedPassword,
        role,
        phoneVerified: true,
        emailVerified: !!email,
        createdAt: new Date(),
        updatedAt: new Date(),
    })
        .returning();
    return newUser;
};
exports.seedAdmin = seedAdmin;
(0, exports.seedAdmin)({
    phone: '+916283315911', // valid Indian phone format
    email: 'admin@meracourier.in', // professional-looking dev email
    password: 'Admin@12345!', // strong password
    role: 'admin',
})
    .then((user) => {
    console.log('Admin user created or already exists:', user);
    process.exit(0);
})
    .catch((err) => {
    console.error('Error seeding admin:', err);
    process.exit(1);
});

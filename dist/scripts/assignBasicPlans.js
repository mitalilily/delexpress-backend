"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const crypto_1 = require("crypto");
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../models/client");
const schema_1 = require("../schema/schema");
async function assignBasicPlans() {
    // 1. Get Basic plan
    const [basicPlan] = await client_1.db.select().from(schema_1.plans).where((0, drizzle_orm_1.eq)(schema_1.plans.name, 'Basic')).limit(1);
    if (!basicPlan) {
        throw new Error('❌ Basic plan not found. Run seedBasicPlan.ts first.');
    }
    // 2. Fetch all users with role = "user"
    const appUsers = await client_1.db.select().from(schema_1.users).where((0, drizzle_orm_1.eq)(schema_1.users.role, 'customer'));
    console.log(`Found ${appUsers.length} users with role "customer".`);
    // 3. For each user, check if already has a plan → if not, assign Basic
    for (const user of appUsers) {
        const existing = await client_1.db.select().from(schema_1.userPlans).where((0, drizzle_orm_1.eq)(schema_1.userPlans.userId, user.id));
        if (existing.length > 0) {
            console.log(`⚡ Skipping ${user.email} (already has plan).`);
            continue;
        }
        await client_1.db.insert(schema_1.userPlans).values({
            id: (0, crypto_1.randomUUID)(),
            userId: user.id,
            plan_id: basicPlan.id,
            assigned_at: new Date(),
            is_active: true,
        });
        console.log(`🌱 Assigned Basic plan to ${user.email}`);
    }
    console.log('✅ Done seeding Basic plan to users.');
}
assignBasicPlans()
    .then(() => process.exit(0))
    .catch((err) => {
    console.error(err);
    process.exit(1);
});

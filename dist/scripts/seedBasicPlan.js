"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const crypto_1 = require("crypto");
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../models/client");
const schema_1 = require("../schema/schema");
async function seedBasicPlan() {
    const existing = await client_1.db.select().from(schema_1.plans).where((0, drizzle_orm_1.eq)(schema_1.plans.name, 'Basic')).limit(1);
    if (existing.length > 0) {
        console.log('✅ Basic plan already exists:', existing[0]);
        return;
    }
    const [plan] = await client_1.db
        .insert(schema_1.plans)
        .values({
        id: (0, crypto_1.randomUUID)(),
        name: 'Basic',
        description: 'Default plan assigned to all new users',
        created_at: new Date(),
    })
        .returning();
    console.log('🌱 Seeded Basic plan:', plan);
}
seedBasicPlan()
    .then(() => process.exit(0))
    .catch((err) => {
    console.error(err);
    process.exit(1);
});

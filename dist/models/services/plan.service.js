"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlansService = void 0;
// src/services/plans.service.ts
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../client");
const plans_1 = require("../schema/plans");
const userPlans_1 = require("../schema/userPlans");
exports.PlansService = {
    getAll: async (options) => {
        return await client_1.db
            .select()
            .from(plans_1.plans)
            .where(options?.status === 'active'
            ? (0, drizzle_orm_1.eq)(plans_1.plans.is_active, true)
            : options?.status === 'inactive'
                ? (0, drizzle_orm_1.eq)(plans_1.plans.is_active, false)
                : undefined)
            .orderBy((0, drizzle_orm_1.desc)(plans_1.plans.created_at)); // sort by newest first
    },
    create: async (data) => {
        const [newPlan] = await client_1.db.insert(plans_1.plans).values(data).returning();
        return newPlan;
    },
    update: async (id, data) => {
        const [updated] = await client_1.db
            .update(plans_1.plans)
            .set({ ...data })
            .where((0, drizzle_orm_1.eq)(plans_1.plans.id, id))
            .returning();
        return updated;
    },
    deactivate: async (planId) => {
        try {
            // 1️⃣ Deactivate the plan
            const [deactivatedPlan] = await client_1.db
                .update(plans_1.plans)
                .set({ is_active: false })
                .where((0, drizzle_orm_1.eq)(plans_1.plans.id, planId))
                .returning();
            if (!deactivatedPlan) {
                throw new Error('Plan not found');
            }
            // 2️⃣ Get the basic plan
            const [basicPlan] = await client_1.db
                .select()
                .from(plans_1.plans)
                .where((0, drizzle_orm_1.eq)(plans_1.plans.name, 'Basic')) // adjust if basic plan has fixed id
                .limit(1);
            if (!basicPlan) {
                throw new Error('Basic plan not found');
            }
            // 3️⃣ Update all users who had this plan to the basic plan
            await client_1.db.update(userPlans_1.userPlans).set({ plan_id: basicPlan.id }).where((0, drizzle_orm_1.eq)(userPlans_1.userPlans.plan_id, planId));
            return deactivatedPlan;
        }
        catch (err) {
            console.error('Failed to deactivate plan:', err);
            throw new Error(err instanceof Error ? err.message : 'Unknown error');
        }
    },
    assignOrUpdateUserPlan: async (userId, planId) => {
        // Check if user already has a plan
        const existing = await client_1.db.select().from(userPlans_1.userPlans).where((0, drizzle_orm_1.eq)(userPlans_1.userPlans.userId, userId)).limit(1);
        if (existing.length > 0) {
            // Update existing plan
            const [updated] = await client_1.db
                .update(userPlans_1.userPlans)
                .set({ plan_id: planId, is_active: true })
                .where((0, drizzle_orm_1.eq)(userPlans_1.userPlans.userId, userId))
                .returning();
            return updated;
        }
        else {
            // Assign new plan
            const [inserted] = await client_1.db
                .insert(userPlans_1.userPlans)
                .values({ userId: userId, plan_id: planId, is_active: true })
                .returning();
            return inserted;
        }
    },
};

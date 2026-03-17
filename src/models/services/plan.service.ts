// src/services/plans.service.ts
import { desc, eq } from 'drizzle-orm'
import { db } from '../client'
import { plans } from '../schema/plans'
import { userPlans } from '../schema/userPlans'

interface GetPlansOptions {
  status?: 'active' | 'inactive'
}

export const PlansService = {
  getAll: async (options?: GetPlansOptions) => {
    return await db
      .select()
      .from(plans)
      .where(
        options?.status === 'active'
          ? eq(plans.is_active, true)
          : options?.status === 'inactive'
          ? eq(plans.is_active, false)
          : undefined,
      )
      .orderBy(desc(plans.created_at)) // sort by newest first
  },

  create: async (data: { name: string; description?: string }) => {
    const [newPlan] = await db.insert(plans).values(data).returning()
    return newPlan
  },

  update: async (
    id: string,
    data: { name?: string; description?: string; is_active?: boolean },
  ) => {
    const [updated] = await db
      .update(plans)
      .set({ ...data })
      .where(eq(plans.id, id))
      .returning()
    return updated
  },

  deactivate: async (planId: string) => {
    try {
      // 1️⃣ Deactivate the plan
      const [deactivatedPlan] = await db
        .update(plans)
        .set({ is_active: false })
        .where(eq(plans.id, planId))
        .returning()

      if (!deactivatedPlan) {
        throw new Error('Plan not found')
      }

      // 2️⃣ Get the basic plan
      const [basicPlan] = await db
        .select()
        .from(plans)
        .where(eq(plans.name, 'Basic')) // adjust if basic plan has fixed id
        .limit(1)

      if (!basicPlan) {
        throw new Error('Basic plan not found')
      }

      // 3️⃣ Update all users who had this plan to the basic plan
      await db.update(userPlans).set({ plan_id: basicPlan.id }).where(eq(userPlans.plan_id, planId))

      return deactivatedPlan
    } catch (err) {
      console.error('Failed to deactivate plan:', err)
      throw new Error(err instanceof Error ? err.message : 'Unknown error')
    }
  },
  assignOrUpdateUserPlan: async (userId: string, planId: string) => {
    // Check if user already has a plan
    const existing = await db.select().from(userPlans).where(eq(userPlans.userId, userId)).limit(1)

    if (existing.length > 0) {
      // Update existing plan
      const [updated] = await db
        .update(userPlans)
        .set({ plan_id: planId, is_active: true })
        .where(eq(userPlans.userId, userId))
        .returning()
      return updated
    } else {
      // Assign new plan
      const [inserted] = await db
        .insert(userPlans)
        .values({ userId: userId, plan_id: planId, is_active: true })
        .returning()
      return inserted
    }
  },
}

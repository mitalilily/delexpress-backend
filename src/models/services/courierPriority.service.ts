import { and, eq } from 'drizzle-orm'
import { db } from '../client'
import { courierPriorityProfiles } from '../schema/courierPriority'

// Convenience model functions
export const CourierPriorityModel = {
  create: (data: typeof courierPriorityProfiles.$inferInsert) =>
    db.insert(courierPriorityProfiles).values(data).returning(),

  findByUser: (userId: string) =>
    db.select().from(courierPriorityProfiles).where(eq(courierPriorityProfiles.user_id, userId)),

  findById: (id: string) =>
    db.select().from(courierPriorityProfiles).where(eq(courierPriorityProfiles.id, id)),

  update: (id: string, data: Partial<typeof courierPriorityProfiles.$inferInsert>) =>
    db
      .update(courierPriorityProfiles)
      .set(data)
      .where(eq(courierPriorityProfiles.id, id))
      .returning(),

  delete: (id: string) =>
    db.delete(courierPriorityProfiles).where(eq(courierPriorityProfiles.id, id)).returning(),
}

export const CourierPriorityService = {
  createCourierPriorityProfile: async (userId: string, name: string, personalisedOrder?: any) => {
    return await db.transaction(async (tx) => {
      // find existing profile for user+name
      const existing = await tx
        .select()
        .from(courierPriorityProfiles)
        .where(and(eq(courierPriorityProfiles.user_id, userId)))

      console.log('existing', existing, name)

      if (existing?.length) {
        // update existing
        return tx
          .update(courierPriorityProfiles)
          .set({
            name: name,
            personalised_order: personalisedOrder ?? null,
            updated_at: new Date(),
          })
          .where(eq(courierPriorityProfiles.id, existing[0].id))
          .returning()
      }

      // insert new
      return tx
        .insert(courierPriorityProfiles)
        .values({
          user_id: userId,
          name,
          personalised_order: personalisedOrder ?? null,
        })
        .returning()
    })
  },
  getCourierPriorityProfilesByUser: async (userId: string) => {
    const [priority] = await CourierPriorityModel.findByUser(userId)
    return priority ?? {}
  },

  getCourierPriorityProfile: async (id: string) => {
    return CourierPriorityModel.findById(id)
  },

  updatCourierPriorityeProfile: async (id: string, data: any) => {
    return CourierPriorityModel.update(id, data)
  },

  deleteCourierPriorityProfile: async (id: string) => {
    return CourierPriorityModel.delete(id)
  },
}

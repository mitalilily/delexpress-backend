import { and, count, eq, ilike } from 'drizzle-orm'
import { db } from '../client'
import { locations } from '../schema/locations'

export const LocationService = {
  create: async (data: { pincode: string; city: string; state: string; country?: string }) => {
    // Check if a location with the same pincode and city already exists
    const existing = await db
      .select()
      .from(locations)
      .where(
        and(
          eq(locations.pincode, data.pincode),
          eq(locations.city, data.city),
          eq(locations.state, data.state),
          eq(locations.country, data?.country ?? 'India'),
        ),
      )
      .limit(1)

    if (existing.length > 0) {
      throw new Error(`Location with pincode ${data.pincode} and city ${data.city} already exists`)
    }

    // Insert new location
    const [location] = await db
      .insert(locations)
      .values({
        ...data,
        country: data.country || 'India',
      })
      .returning()

    return location
  },

  list: async (params: {
    page?: number
    limit?: number
    filters?: { pincode?: string; city?: string; state?: string }
  }) => {
    const page = params.page ?? 1
    const limit = params.limit ?? 20
    const offset = (page - 1) * limit

    const conditions = []
    if (params.filters) {
      const { pincode, city, state } = params.filters
      if (pincode) conditions.push(ilike(locations.pincode, `%${pincode}%`))
      if (city) conditions.push(ilike(locations.city, `%${city}%`))
      if (state) conditions.push(ilike(locations.state, `%${state}%`))
    }

    const data = await db
      .select()
      .from(locations)
      .where(conditions.length ? and(...conditions) : undefined)
      .limit(limit)
      .offset(offset)

    const totalRes = await db.select({ count: count() }).from(locations)

    const total = Number(totalRes[0]?.count ?? 0)
    return { data, total, page, limit }
  },

  getById: async (id: string) => {
    const [location] = await db.select().from(locations).where(eq(locations.id, id))
    return location
  },

  update: async (
    id: string,
    data: { pincode?: string; city?: string; state?: string; country?: string },
  ) => {
    const updated = await db.update(locations).set(data).where(eq(locations.id, id)).returning()
    return updated[0]
  },

  delete: async (id: string) => {
    const deleted = await db.delete(locations).where(eq(locations.id, id)).returning()
    return deleted[0]
  },
}

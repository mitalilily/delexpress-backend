"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LocationService = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../client");
const locations_1 = require("../schema/locations");
exports.LocationService = {
    create: async (data) => {
        // Check if a location with the same pincode and city already exists
        const existing = await client_1.db
            .select()
            .from(locations_1.locations)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(locations_1.locations.pincode, data.pincode), (0, drizzle_orm_1.eq)(locations_1.locations.city, data.city), (0, drizzle_orm_1.eq)(locations_1.locations.state, data.state), (0, drizzle_orm_1.eq)(locations_1.locations.country, data?.country ?? 'India')))
            .limit(1);
        if (existing.length > 0) {
            throw new Error(`Location with pincode ${data.pincode} and city ${data.city} already exists`);
        }
        // Insert new location
        const [location] = await client_1.db
            .insert(locations_1.locations)
            .values({
            ...data,
            country: data.country || 'India',
        })
            .returning();
        return location;
    },
    list: async (params) => {
        const page = params.page ?? 1;
        const limit = params.limit ?? 20;
        const offset = (page - 1) * limit;
        const conditions = [];
        if (params.filters) {
            const { pincode, city, state } = params.filters;
            if (pincode)
                conditions.push((0, drizzle_orm_1.ilike)(locations_1.locations.pincode, `%${pincode}%`));
            if (city)
                conditions.push((0, drizzle_orm_1.ilike)(locations_1.locations.city, `%${city}%`));
            if (state)
                conditions.push((0, drizzle_orm_1.ilike)(locations_1.locations.state, `%${state}%`));
        }
        const data = await client_1.db
            .select()
            .from(locations_1.locations)
            .where(conditions.length ? (0, drizzle_orm_1.and)(...conditions) : undefined)
            .limit(limit)
            .offset(offset);
        const totalRes = await client_1.db.select({ count: (0, drizzle_orm_1.count)() }).from(locations_1.locations);
        const total = Number(totalRes[0]?.count ?? 0);
        return { data, total, page, limit };
    },
    getById: async (id) => {
        const [location] = await client_1.db.select().from(locations_1.locations).where((0, drizzle_orm_1.eq)(locations_1.locations.id, id));
        return location;
    },
    update: async (id, data) => {
        const updated = await client_1.db.update(locations_1.locations).set(data).where((0, drizzle_orm_1.eq)(locations_1.locations.id, id)).returning();
        return updated[0];
    },
    delete: async (id) => {
        const deleted = await client_1.db.delete(locations_1.locations).where((0, drizzle_orm_1.eq)(locations_1.locations.id, id)).returning();
        return deleted[0];
    },
};

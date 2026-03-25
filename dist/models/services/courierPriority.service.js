"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CourierPriorityService = exports.CourierPriorityModel = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../client");
const courierPriority_1 = require("../schema/courierPriority");
// Convenience model functions
exports.CourierPriorityModel = {
    create: (data) => client_1.db.insert(courierPriority_1.courierPriorityProfiles).values(data).returning(),
    findByUser: (userId) => client_1.db.select().from(courierPriority_1.courierPriorityProfiles).where((0, drizzle_orm_1.eq)(courierPriority_1.courierPriorityProfiles.user_id, userId)),
    findById: (id) => client_1.db.select().from(courierPriority_1.courierPriorityProfiles).where((0, drizzle_orm_1.eq)(courierPriority_1.courierPriorityProfiles.id, id)),
    update: (id, data) => client_1.db
        .update(courierPriority_1.courierPriorityProfiles)
        .set(data)
        .where((0, drizzle_orm_1.eq)(courierPriority_1.courierPriorityProfiles.id, id))
        .returning(),
    delete: (id) => client_1.db.delete(courierPriority_1.courierPriorityProfiles).where((0, drizzle_orm_1.eq)(courierPriority_1.courierPriorityProfiles.id, id)).returning(),
};
exports.CourierPriorityService = {
    createCourierPriorityProfile: async (userId, name, personalisedOrder) => {
        return await client_1.db.transaction(async (tx) => {
            // find existing profile for user+name
            const existing = await tx
                .select()
                .from(courierPriority_1.courierPriorityProfiles)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(courierPriority_1.courierPriorityProfiles.user_id, userId)));
            console.log('existing', existing, name);
            if (existing?.length) {
                // update existing
                return tx
                    .update(courierPriority_1.courierPriorityProfiles)
                    .set({
                    name: name,
                    personalised_order: personalisedOrder ?? null,
                    updated_at: new Date(),
                })
                    .where((0, drizzle_orm_1.eq)(courierPriority_1.courierPriorityProfiles.id, existing[0].id))
                    .returning();
            }
            // insert new
            return tx
                .insert(courierPriority_1.courierPriorityProfiles)
                .values({
                user_id: userId,
                name,
                personalised_order: personalisedOrder ?? null,
            })
                .returning();
        });
    },
    getCourierPriorityProfilesByUser: async (userId) => {
        const [priority] = await exports.CourierPriorityModel.findByUser(userId);
        return priority ?? {};
    },
    getCourierPriorityProfile: async (id) => {
        return exports.CourierPriorityModel.findById(id);
    },
    updatCourierPriorityeProfile: async (id, data) => {
        return exports.CourierPriorityModel.update(id, data);
    },
    deleteCourierPriorityProfile: async (id) => {
        return exports.CourierPriorityModel.delete(id);
    },
};

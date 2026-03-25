"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.courierPriorityProfiles = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
exports.courierPriorityProfiles = (0, pg_core_1.pgTable)('courier_priority_profiles', {
    id: (0, pg_core_1.uuid)('id').defaultRandom().primaryKey(),
    user_id: (0, pg_core_1.uuid)('user_id').notNull(),
    name: (0, pg_core_1.varchar)('name', { length: 50 }).notNull(),
    personalised_order: (0, pg_core_1.json)('personalised_order').$type(),
    created_at: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updated_at: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
}, (table) => ({
    // 🔹 Enforce uniqueness at DB level
    uniqUserName: (0, pg_core_1.uniqueIndex)('uniq_user_priority').on(table.user_id, table.name),
}));

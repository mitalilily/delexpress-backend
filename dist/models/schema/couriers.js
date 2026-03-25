"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.couriers = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const pg_core_1 = require("drizzle-orm/pg-core");
exports.couriers = (0, pg_core_1.pgTable)('couriers', {
    id: (0, pg_core_1.integer)('id').notNull(), // Courier ID from service provider
    name: (0, pg_core_1.varchar)('name', { length: 100 }).notNull(),
    serviceProvider: (0, pg_core_1.varchar)('serviceProvider', { length: 100 }).notNull(),
    isEnabled: (0, pg_core_1.boolean)('isEnabled').notNull().default(true),
    businessType: (0, pg_core_1.jsonb)('business_type')
        .$type()
        .default((0, drizzle_orm_1.sql) `'["b2c","b2b"]'::jsonb`)
        .notNull(), // Array: ['b2c'], ['b2b'], or ['b2c', 'b2b']
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow(),
}, (table) => ({
    // Composite primary key: same courier ID can exist for different service providers
    pk: (0, pg_core_1.primaryKey)({ columns: [table.id, table.serviceProvider] }),
}));

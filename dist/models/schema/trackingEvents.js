"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.tracking_events = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const b2cOrders_1 = require("./b2cOrders");
const users_1 = require("./users");
exports.tracking_events = (0, pg_core_1.pgTable)('tracking_events', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    order_id: (0, pg_core_1.uuid)('order_id').references(() => b2cOrders_1.b2c_orders.id).notNull(),
    user_id: (0, pg_core_1.uuid)('user_id').references(() => users_1.users.id).notNull(),
    awb_number: (0, pg_core_1.varchar)('awb_number', { length: 100 }),
    courier: (0, pg_core_1.varchar)('courier', { length: 60 }),
    status_code: (0, pg_core_1.varchar)('status_code', { length: 80 }),
    status_text: (0, pg_core_1.varchar)('status_text', { length: 200 }),
    location: (0, pg_core_1.varchar)('location', { length: 120 }),
    raw: (0, pg_core_1.jsonb)('raw'),
    created_at: (0, pg_core_1.timestamp)('created_at').defaultNow(),
});

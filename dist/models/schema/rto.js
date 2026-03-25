"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.rto_events = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const b2cOrders_1 = require("./b2cOrders");
const users_1 = require("./users");
exports.rto_events = (0, pg_core_1.pgTable)('rto_events', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    order_id: (0, pg_core_1.uuid)('order_id').references(() => b2cOrders_1.b2c_orders.id).notNull(),
    user_id: (0, pg_core_1.uuid)('user_id').references(() => users_1.users.id).notNull(),
    awb_number: (0, pg_core_1.varchar)('awb_number', { length: 100 }),
    status: (0, pg_core_1.varchar)('status', { length: 60 }).notNull(), // rto_in_transit | rto_delivered | rto
    reason: (0, pg_core_1.varchar)('reason', { length: 300 }),
    remarks: (0, pg_core_1.varchar)('remarks', { length: 500 }),
    rto_charges: (0, pg_core_1.numeric)('rto_charges').$type(),
    payload: (0, pg_core_1.jsonb)('payload'),
    created_at: (0, pg_core_1.timestamp)('created_at').defaultNow(),
    updated_at: (0, pg_core_1.timestamp)('updated_at').defaultNow(),
});

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pending_webhooks = void 0;
// schema/pendingWebhooks.ts
var pg_core_1 = require("drizzle-orm/pg-core");
exports.pending_webhooks = (0, pg_core_1.pgTable)('pending_webhooks', {
    id: (0, pg_core_1.uuid)('id').defaultRandom().primaryKey(),
    awb_number: (0, pg_core_1.text)('awb_number').notNull(),
    status: (0, pg_core_1.text)('status').notNull(),
    payload: (0, pg_core_1.jsonb)('payload').notNull(),
    created_at: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    processed_at: (0, pg_core_1.timestamp)('processed_at'),
});

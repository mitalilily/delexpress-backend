"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.developer_issue_states = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const users_1 = require("./users");
exports.developer_issue_states = (0, pg_core_1.pgTable)('developer_issue_states', {
    id: (0, pg_core_1.uuid)('id').defaultRandom().primaryKey(),
    issue_key: (0, pg_core_1.varchar)('issue_key', { length: 255 }).notNull(),
    source: (0, pg_core_1.varchar)('source', { length: 50 }).notNull(),
    title: (0, pg_core_1.varchar)('title', { length: 255 }).notNull(),
    status: (0, pg_core_1.varchar)('status', { length: 20 }).default('open').notNull(),
    priority: (0, pg_core_1.varchar)('priority', { length: 20 }).default('medium').notNull(),
    owner_admin_id: (0, pg_core_1.uuid)('owner_admin_id').references(() => users_1.users.id),
    resolved_by_admin_id: (0, pg_core_1.uuid)('resolved_by_admin_id').references(() => users_1.users.id),
    first_seen_at: (0, pg_core_1.timestamp)('first_seen_at').defaultNow().notNull(),
    last_seen_at: (0, pg_core_1.timestamp)('last_seen_at').defaultNow().notNull(),
    occurrence_count: (0, pg_core_1.integer)('occurrence_count').default(1).notNull(),
    created_at: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updated_at: (0, pg_core_1.timestamp)('updated_at')
        .defaultNow()
        .$onUpdate(() => new Date()),
    resolved_at: (0, pg_core_1.timestamp)('resolved_at'),
    alert_seen_at: (0, pg_core_1.timestamp)('alert_seen_at'),
}, (table) => ({
    issueKeyUnique: (0, pg_core_1.uniqueIndex)('developer_issue_states_issue_key_unique').on(table.issue_key),
}));

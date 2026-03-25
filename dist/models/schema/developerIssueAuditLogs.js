"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.developer_issue_audit_logs = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const users_1 = require("./users");
exports.developer_issue_audit_logs = (0, pg_core_1.pgTable)('developer_issue_audit_logs', {
    id: (0, pg_core_1.uuid)('id').defaultRandom().primaryKey(),
    issue_key: (0, pg_core_1.varchar)('issue_key', { length: 255 }).notNull(),
    admin_user_id: (0, pg_core_1.uuid)('admin_user_id').references(() => users_1.users.id),
    action: (0, pg_core_1.varchar)('action', { length: 50 }).notNull(),
    note: (0, pg_core_1.text)('note'),
    metadata: (0, pg_core_1.jsonb)('metadata').$type(),
    created_at: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
});

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.supportTickets = exports.ticketStatusEnum = void 0;
// db/schema/supportTickets.ts
const pg_core_1 = require("drizzle-orm/pg-core");
const users_1 = require("./users");
exports.ticketStatusEnum = (0, pg_core_1.pgEnum)('ticket_status', [
    'open',
    'in_progress',
    'resolved',
    'closed',
]);
exports.supportTickets = (0, pg_core_1.pgTable)('support_tickets', {
    id: (0, pg_core_1.uuid)('id').defaultRandom().primaryKey(),
    userId: (0, pg_core_1.uuid)('user_id')
        .notNull()
        .references(() => users_1.users.id),
    subject: (0, pg_core_1.text)('subject').notNull(),
    category: (0, pg_core_1.text)('category').notNull(),
    subcategory: (0, pg_core_1.text)('subcategory').notNull(),
    awbNumber: (0, pg_core_1.text)('awb_number'),
    description: (0, pg_core_1.text)('description').notNull(),
    attachments: (0, pg_core_1.text)('attachments').array().default([]), // ⬅️ this line
    dueDate: (0, pg_core_1.timestamp)('due_date', { withTimezone: true }),
    status: (0, exports.ticketStatusEnum)('status').default('open'),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true }).defaultNow(),
});

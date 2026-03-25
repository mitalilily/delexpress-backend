"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.invoiceSequences = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const users_1 = require("./users");
exports.invoiceSequences = (0, pg_core_1.pgTable)('invoice_sequences', {
    userId: (0, pg_core_1.uuid)('user_id')
        .references(() => users_1.users.id, { onDelete: 'cascade' })
        .primaryKey(),
    lastSequence: (0, pg_core_1.bigint)('last_sequence', { mode: 'number' }).notNull().default(0),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

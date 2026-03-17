import { bigint, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core'
import { users } from './users'

export const invoiceSequences = pgTable('invoice_sequences', {
  userId: uuid('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .primaryKey(),
  lastSequence: bigint('last_sequence', { mode: 'number' }).notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

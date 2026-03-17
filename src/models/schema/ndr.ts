import { jsonb, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core'
import { b2c_orders } from './b2cOrders'
import { users } from './users'

export const ndr_events = pgTable('ndr_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  order_id: uuid('order_id').references(() => b2c_orders.id).notNull(),
  user_id: uuid('user_id').references(() => users.id).notNull(),
  awb_number: varchar('awb_number', { length: 100 }),
  status: varchar('status', { length: 60 }).notNull(), // e.g., ndr, undelivered, address_issue
  reason: varchar('reason', { length: 300 }),
  remarks: varchar('remarks', { length: 500 }),
  attempt_no: varchar('attempt_no', { length: 20 }),
  payload: jsonb('payload'),
  created_at: timestamp('created_at').defaultNow(),
  updated_at: timestamp('updated_at').defaultNow(),
})

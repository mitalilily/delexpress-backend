import { jsonb, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core'
import { b2c_orders } from './b2cOrders'
import { users } from './users'

export const tracking_events = pgTable('tracking_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  order_id: uuid('order_id').references(() => b2c_orders.id).notNull(),
  user_id: uuid('user_id').references(() => users.id).notNull(),
  awb_number: varchar('awb_number', { length: 100 }),
  courier: varchar('courier', { length: 60 }),
  status_code: varchar('status_code', { length: 80 }),
  status_text: varchar('status_text', { length: 200 }),
  location: varchar('location', { length: 120 }),
  raw: jsonb('raw'),
  created_at: timestamp('created_at').defaultNow(),
})

// drizzle/schema/notifications.ts
import { boolean, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core'

export const notifications = pgTable('notifications', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('userId'), // optional: can be null for role-based broadcast
  targetRole: text('targetRole').notNull(), // "admin" | "client"
  title: text('title').notNull(),
  message: text('message').notNull(),
  read: boolean('read').default(false),
  createdAt: timestamp('createdAt').defaultNow(),
})

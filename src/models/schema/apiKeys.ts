import { sql } from 'drizzle-orm'
import { boolean, jsonb, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core'
import { users } from './users'

export const api_keys = pgTable('api_keys', {
  id: uuid('id').defaultRandom().primaryKey(),
  user_id: uuid('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),

  // API Key details
  key_name: varchar('key_name', { length: 255 }).notNull(), // User-friendly name for the key
  api_key: varchar('api_key', { length: 255 }).notNull().unique(), // The actual API key (hashed)
  api_secret: varchar('api_secret', { length: 255 }).notNull(), // Secret for webhook signing

  // Permissions
  permissions: jsonb('permissions')
    .$type<string[]>()
    .default(sql`'[]'::jsonb`), // JSON array of permissions

  // Status
  is_active: boolean('is_active').default(true).notNull(),
  last_used_at: timestamp('last_used_at', { withTimezone: true }),

  // Metadata
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date()),
})

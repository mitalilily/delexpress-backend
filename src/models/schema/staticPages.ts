import { pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core'

export const staticPages = pgTable('static_pages', {
  slug: varchar('slug', { length: 255 }).primaryKey(),
  title: varchar('title', { length: 512 }),
  content: text('content').notNull(),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
})



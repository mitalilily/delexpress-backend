import { boolean, integer, pgTable, text, timestamp, varchar } from 'drizzle-orm/pg-core'

export const blogs = pgTable('blogs', {
  id: integer('id').primaryKey(),
  title: varchar('title', { length: 512 }).notNull(),
  slug: varchar('slug', { length: 512 }).notNull().unique(),
  excerpt: text('excerpt'),
  content: text('content').notNull(),
  featured_image: varchar('featured_image', { length: 1024 }),
  featured_image_alt: varchar('featured_image_alt', { length: 512 }),
  tags: text('tags'),
  meta_title: varchar('meta_title', { length: 512 }),
  meta_description: text('meta_description'),
  focus_keywords: varchar('focus_keywords', { length: 512 }),
  og_image: varchar('og_image', { length: 1024 }),
  published_at: timestamp('published_at'),
  author_id: integer('author_id'),
  is_featured: boolean('is_featured').notNull().default(false),
  views: integer('views').notNull().default(0),
  comments_count: integer('comments_count').notNull().default(0),
  created_at: timestamp('created_at').defaultNow().notNull(),
  updated_at: timestamp('updated_at').defaultNow().notNull(),
})

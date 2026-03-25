"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.blogs = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
exports.blogs = (0, pg_core_1.pgTable)('blogs', {
    id: (0, pg_core_1.integer)('id').primaryKey(),
    title: (0, pg_core_1.varchar)('title', { length: 512 }).notNull(),
    slug: (0, pg_core_1.varchar)('slug', { length: 512 }).notNull().unique(),
    excerpt: (0, pg_core_1.text)('excerpt'),
    content: (0, pg_core_1.text)('content').notNull(),
    featured_image: (0, pg_core_1.varchar)('featured_image', { length: 1024 }),
    featured_image_alt: (0, pg_core_1.varchar)('featured_image_alt', { length: 512 }),
    tags: (0, pg_core_1.text)('tags'),
    meta_title: (0, pg_core_1.varchar)('meta_title', { length: 512 }),
    meta_description: (0, pg_core_1.text)('meta_description'),
    focus_keywords: (0, pg_core_1.varchar)('focus_keywords', { length: 512 }),
    og_image: (0, pg_core_1.varchar)('og_image', { length: 1024 }),
    published_at: (0, pg_core_1.timestamp)('published_at'),
    author_id: (0, pg_core_1.integer)('author_id'),
    is_featured: (0, pg_core_1.boolean)('is_featured').notNull().default(false),
    views: (0, pg_core_1.integer)('views').notNull().default(0),
    comments_count: (0, pg_core_1.integer)('comments_count').notNull().default(0),
    created_at: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updated_at: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
});

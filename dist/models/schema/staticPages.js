"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.staticPages = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
exports.staticPages = (0, pg_core_1.pgTable)('static_pages', {
    slug: (0, pg_core_1.varchar)('slug', { length: 255 }).primaryKey(),
    title: (0, pg_core_1.varchar)('title', { length: 512 }),
    content: (0, pg_core_1.text)('content').notNull(),
    created_at: (0, pg_core_1.timestamp)('created_at').defaultNow().notNull(),
    updated_at: (0, pg_core_1.timestamp)('updated_at').defaultNow().notNull(),
});

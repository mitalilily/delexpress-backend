"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BlogService = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../client");
const blogs_1 = require("../schema/blogs");
exports.BlogService = {
    async create(data) {
        // Ensure published_at is a Date object or null for drafts
        // Remove fields that have database defaults
        const { id, meta_title, focus_keywords, author_id, views, comments_count, created_at, updated_at, ...rest } = data;
        const payload = {
            ...rest,
            published_at: data.published_at ? new Date(data.published_at) : null,
        };
        const [row] = await client_1.db.insert(blogs_1.blogs).values(payload).returning();
        return row;
    },
    async update(id, data = {}) {
        data = data || {}; // ensure data is an object
        data.updated_at = new Date(); // always set updated_at
        const [row] = await client_1.db.update(blogs_1.blogs).set(data).where((0, drizzle_orm_1.eq)(blogs_1.blogs.id, id)).returning();
        // return the updated row or null if nothing was updated
        return row || {};
    },
    async list(filters, pagination) {
        const { page = 1, limit = 10 } = pagination;
        const offset = (page - 1) * limit;
        const conditions = [];
        if (filters.is_featured !== undefined)
            conditions.push((0, drizzle_orm_1.eq)(blogs_1.blogs.is_featured, filters.is_featured === 'true'));
        if (filters.q)
            conditions.push((0, drizzle_orm_1.sql) `${blogs_1.blogs.title} ILIKE ${'%' + filters.q + '%'}`);
        if (filters.tags)
            conditions.push((0, drizzle_orm_1.sql) `${blogs_1.blogs.tags} ILIKE ${'%' + filters.tags + '%'}`);
        const rows = await client_1.db
            .select()
            .from(blogs_1.blogs)
            .where(conditions.length ? (0, drizzle_orm_1.and)(...conditions) : undefined)
            .orderBy((0, drizzle_orm_1.desc)(blogs_1.blogs.is_featured), // ✅ featured first
        (0, drizzle_orm_1.desc)(blogs_1.blogs.published_at))
            .limit(limit)
            .offset(offset);
        const [{ count }] = await client_1.db
            .select({ count: (0, drizzle_orm_1.sql) `count(*)` })
            .from(blogs_1.blogs)
            .where(conditions.length ? (0, drizzle_orm_1.and)(...conditions) : undefined);
        return { rows, total: Number(count) };
    },
    async getById(id) {
        const [row] = await client_1.db.select().from(blogs_1.blogs).where((0, drizzle_orm_1.eq)(blogs_1.blogs.id, id));
        return row;
    },
    async getBySlug(slug) {
        const [row] = await client_1.db.select().from(blogs_1.blogs).where((0, drizzle_orm_1.eq)(blogs_1.blogs.slug, slug));
        return row;
    },
    async getStats() {
        const total = await client_1.db.select({ count: (0, drizzle_orm_1.sql) `count(*)` }).from(blogs_1.blogs);
        const published = await client_1.db
            .select({ count: (0, drizzle_orm_1.sql) `count(*) FILTER (WHERE published_at IS NOT NULL)` })
            .from(blogs_1.blogs);
        const featured = await client_1.db
            .select({ count: (0, drizzle_orm_1.sql) `count(*) FILTER (WHERE is_featured = true)` })
            .from(blogs_1.blogs);
        const views = await client_1.db.select({ sum: (0, drizzle_orm_1.sql) `COALESCE(sum(views),0)` }).from(blogs_1.blogs);
        const comments = await client_1.db
            .select({ sum: (0, drizzle_orm_1.sql) `COALESCE(sum(comments_count),0)` })
            .from(blogs_1.blogs);
        return {
            total: Number(total[0].count),
            published: Number(published[0].count),
            featured: Number(featured[0].count),
            views: Number(views[0].sum || 0),
            comments: Number(comments[0].sum || 0),
        };
    },
};

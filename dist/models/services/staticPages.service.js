"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StaticPagesService = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../client");
const staticPages_1 = require("../schema/staticPages");
exports.StaticPagesService = {
    async getBySlug(slug) {
        const [row] = await client_1.db.select().from(staticPages_1.staticPages).where((0, drizzle_orm_1.eq)(staticPages_1.staticPages.slug, slug));
        return row || null;
    },
    async upsertBySlug(slug, data) {
        const existing = await this.getBySlug(slug);
        if (existing) {
            const [row] = await client_1.db
                .update(staticPages_1.staticPages)
                .set({
                ...data,
                updated_at: new Date(),
            })
                .where((0, drizzle_orm_1.eq)(staticPages_1.staticPages.slug, slug))
                .returning();
            return row;
        }
        const [row] = await client_1.db
            .insert(staticPages_1.staticPages)
            .values({
            slug,
            ...data,
        })
            .returning();
        return row;
    },
};

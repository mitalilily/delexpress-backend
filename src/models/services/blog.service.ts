import { and, desc, eq, sql } from 'drizzle-orm'
import { db } from '../client'
import { blogs } from '../schema/blogs'

export const BlogService = {
  async create(data: any) {
    // Ensure published_at is a Date object or null for drafts
    // Remove fields that have database defaults
    const {
      id,
      meta_title,
      focus_keywords,
      author_id,
      views,
      comments_count,
      created_at,
      updated_at,
      ...rest
    } = data

    const payload: any = {
      ...rest,
      published_at: data.published_at ? new Date(data.published_at) : null,
    }

    const [row] = await db.insert(blogs).values(payload).returning()
    return row
  },
  async update(id: number, data: any = {}) {
    data = data || {} // ensure data is an object
    data.updated_at = new Date() // always set updated_at

    const [row] = await db.update(blogs).set(data).where(eq(blogs.id, id)).returning()

    // return the updated row or null if nothing was updated
    return row || {}
  },
  async list(filters: any, pagination: { page?: number; limit?: number }) {
    const { page = 1, limit = 10 } = pagination
    const offset = (page - 1) * limit

    const conditions: any[] = []
    if (filters.is_featured !== undefined)
      conditions.push(eq(blogs.is_featured, filters.is_featured === 'true'))
    if (filters.q) conditions.push(sql`${blogs.title} ILIKE ${'%' + filters.q + '%'}`)
    if (filters.tags) conditions.push(sql`${blogs.tags} ILIKE ${'%' + filters.tags + '%'}`)

    const rows = await db
      .select()
      .from(blogs)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(
        desc(blogs.is_featured), // ✅ featured first
        desc(blogs.published_at), // then newest published
      )
      .limit(limit)
      .offset(offset)

    const [{ count }] = await db
      .select({ count: sql<number>`count(*)` })
      .from(blogs)
      .where(conditions.length ? and(...conditions) : undefined)

    return { rows, total: Number(count) }
  },

  async getById(id: number) {
    const [row] = await db.select().from(blogs).where(eq(blogs.id, id))
    return row
  },
  async getBySlug(slug: string) {
    const [row] = await db.select().from(blogs).where(eq(blogs.slug, slug))
    return row
  },
  async getStats() {
    const total = await db.select({ count: sql<number>`count(*)` }).from(blogs)
    const published = await db
      .select({ count: sql<number>`count(*) FILTER (WHERE published_at IS NOT NULL)` })
      .from(blogs)
    const featured = await db
      .select({ count: sql<number>`count(*) FILTER (WHERE is_featured = true)` })
      .from(blogs)
    const views = await db.select({ sum: sql<number>`COALESCE(sum(views),0)` }).from(blogs)
    const comments = await db
      .select({ sum: sql<number>`COALESCE(sum(comments_count),0)` })
      .from(blogs)

    return {
      total: Number(total[0].count),
      published: Number(published[0].count),
      featured: Number(featured[0].count),
      views: Number(views[0].sum || 0),
      comments: Number(comments[0].sum || 0),
    }
  },
}

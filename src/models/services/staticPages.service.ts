import { eq } from 'drizzle-orm'
import { db } from '../client'
import { staticPages } from '../schema/staticPages'

export const StaticPagesService = {
  async getBySlug(slug: string) {
    const [row] = await db.select().from(staticPages).where(eq(staticPages.slug, slug))
    return row || null
  },

  async upsertBySlug(slug: string, data: { title?: string; content: string }) {
    const existing = await this.getBySlug(slug)

    if (existing) {
      const [row] = await db
        .update(staticPages)
        .set({
          ...data,
          updated_at: new Date(),
        })
        .where(eq(staticPages.slug, slug))
        .returning()

      return row
    }

    const [row] = await db
      .insert(staticPages)
      .values({
        slug,
        ...data,
      })
      .returning()

    return row
  },
}





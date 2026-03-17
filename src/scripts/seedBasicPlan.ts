import { randomUUID } from 'crypto'
import { eq } from 'drizzle-orm'
import { db } from '../models/client'
import { plans } from '../schema/schema'

async function seedBasicPlan() {
  const existing = await db.select().from(plans).where(eq(plans.name, 'Basic')).limit(1)

  if (existing.length > 0) {
    console.log('✅ Basic plan already exists:', existing[0])
    return
  }

  const [plan] = await db
    .insert(plans)
    .values({
      id: randomUUID(),
      name: 'Basic',
      description: 'Default plan assigned to all new users',
      created_at: new Date(),
    })
    .returning()

  console.log('🌱 Seeded Basic plan:', plan)
}

seedBasicPlan()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })

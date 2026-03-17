import { randomUUID } from 'crypto'
import { eq } from 'drizzle-orm'
import { db } from '../models/client'
import { plans, userPlans, users } from '../schema/schema'

async function assignBasicPlans() {
  // 1. Get Basic plan
  const [basicPlan] = await db.select().from(plans).where(eq(plans.name, 'Basic')).limit(1)

  if (!basicPlan) {
    throw new Error('❌ Basic plan not found. Run seedBasicPlan.ts first.')
  }

  // 2. Fetch all users with role = "user"
  const appUsers = await db.select().from(users).where(eq(users.role, 'customer'))

  console.log(`Found ${appUsers.length} users with role "customer".`)

  // 3. For each user, check if already has a plan → if not, assign Basic
  for (const user of appUsers) {
    const existing = await db.select().from(userPlans).where(eq(userPlans.userId, user.id))

    if (existing.length > 0) {
      console.log(`⚡ Skipping ${user.email} (already has plan).`)
      continue
    }

    await db.insert(userPlans).values({
      id: randomUUID(),
      userId: user.id,
      plan_id: basicPlan.id,
      assigned_at: new Date(),
      is_active: true,
    })

    console.log(`🌱 Assigned Basic plan to ${user.email}`)
  }

  console.log('✅ Done seeding Basic plan to users.')
}

assignBasicPlans()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })

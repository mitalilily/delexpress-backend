import bcrypt from 'bcryptjs'
import { eq } from 'drizzle-orm'
import { v4 as uuidv4 } from 'uuid'
import { db, pool } from '../models/client'
import { users } from '../models/schema/users'

const ADMIN_EMAIL = 'admin@delexpress.in'
const ADMIN_PASSWORD = 'Admin@12345!'

async function ensureDelExpressAdmin() {
  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10)
  const [existing] = await db.select().from(users).where(eq(users.email, ADMIN_EMAIL))

  if (existing) {
    await db
      .update(users)
      .set({
        passwordHash,
        role: 'admin',
        emailVerified: true,
        updatedAt: new Date(),
      })
      .where(eq(users.id, existing.id))

    console.log(`Updated admin credentials for ${ADMIN_EMAIL}`)
  } else {
    await db.insert(users).values({
      id: uuidv4(),
      email: ADMIN_EMAIL,
      passwordHash,
      role: 'admin',
      emailVerified: true,
      phoneVerified: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    })

    console.log(`Created admin user ${ADMIN_EMAIL}`)
  }

  console.log(`Admin login: ${ADMIN_EMAIL} / ${ADMIN_PASSWORD}`)
}

ensureDelExpressAdmin()
  .catch((error) => {
    console.error('Failed to ensure DelExpress admin:', error)
    process.exitCode = 1
  })
  .finally(async () => {
    await pool.end()
  })

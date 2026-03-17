// seedAdmin.ts
import bcrypt from 'bcryptjs'
import { eq } from 'drizzle-orm'
import { v4 as uuidv4 } from 'uuid'
import { db } from '../models/client'
import { User } from '../models/services/userService'
import { users } from '../schema/schema'

interface SeedAdminProps {
  phone: string
  password: string
  email?: string
  role?: 'admin' | 'customer' | 'manager'
}

export const seedAdmin = async ({
  phone,
  password,
  email,
  role = 'admin',
}: SeedAdminProps): Promise<User> => {
  // check if user already exists
  const existing = await db.select().from(users).where(eq(users.phone, phone))
  if (existing.length > 0) return existing[0] as User

  // hash password
  const hashedPassword = await bcrypt.hash(password, 10)

  // insert new user
  const [newUser] = await db
    .insert(users)
    .values({
      id: uuidv4(),
      phone,
      email: email ?? null,
      passwordHash: hashedPassword,
      role,
      phoneVerified: true,
      emailVerified: !!email,
      createdAt: new Date(),
      updatedAt: new Date(),
    })
    .returning()

  return newUser as User
}

seedAdmin({
  phone: '+916283315911', // valid Indian phone format
  email: 'admin@meracourier.in', // professional-looking dev email
  password: 'Admin@12345!', // strong password
  role: 'admin',
})
  .then((user) => {
    console.log('Admin user created or already exists:', user)
    process.exit(0)
  })
  .catch((err) => {
    console.error('Error seeding admin:', err)
    process.exit(1)
  })

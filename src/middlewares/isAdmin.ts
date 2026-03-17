// src/middlewares/isAdminMiddleware.ts
import { eq } from 'drizzle-orm'
import { NextFunction, Response } from 'express'
import { db } from '../models/client'
import { users } from '../schema/schema'

export const isAdminMiddleware = async (req: any, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.sub // assuming you have auth middleware setting this

    if (!userId) {
      return res.status(401).json({ message: 'Unauthorized: No user ID found' })
    }

    const [user] = await db.select({ role: users.role }).from(users).where(eq(users.id, userId)) // ✅ Corrected usage

    if (!user || user.role !== 'admin') {
      return res.status(403).json({ message: 'Forbidden: Admin access only' })
    }

    next()
  } catch (error) {
    console.error('[isAdminMiddleware]', error)
    return res.status(500).json({ message: 'Internal server error' })
  }
}

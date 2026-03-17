import { Request, Response } from 'express'
import { eq } from 'drizzle-orm'
import { BillingPreferencesService } from '../models/services/billingPreferences.service'
import { db } from '../models/client'
import { users } from '../schema/schema'

export class AdminBillingPreferencesController {
  /**
   * POST /api/admin/billing-preferences/user
   * Update billing preference for a specific user
   */
  static async upsertForUser(req: Request, res: Response): Promise<void> {
    try {
      const { userId, frequency, autoGenerate, customFrequencyDays } = req.body

      if (!userId) {
        res.status(400).json({ message: 'userId is required' })
        return
      }

      if (!['weekly', 'monthly', 'manual', 'custom'].includes(frequency)) {
        res.status(400).json({ message: 'Invalid frequency type' })
        return
      }

      // Ensure user exists
      const [user] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.id, userId as any))
      if (!user) {
        res.status(404).json({ message: 'User not found' })
        return
      }

      await BillingPreferencesService.upsert(userId, {
        frequency,
        autoGenerate,
        customFrequencyDays,
      })

      res.json({ message: 'Billing preference updated successfully for user' })
    } catch (error) {
      console.error('Error updating billing preference for user:', error)
      res.status(500).json({ message: 'Internal server error' })
    }
  }

  /**
   * POST /api/admin/billing-preferences/all
   * Apply a billing preference to all users
   */
  static async applyToAllUsers(req: Request, res: Response): Promise<void> {
    try {
      const { frequency, autoGenerate, customFrequencyDays } = req.body

      if (!['weekly', 'monthly', 'manual', 'custom'].includes(frequency)) {
        res.status(400).json({ message: 'Invalid frequency type' })
        return
      }

      const allUsers = await db.select({ id: users.id }).from(users)

      for (const u of allUsers) {
        await BillingPreferencesService.upsert(u.id, {
          frequency,
          autoGenerate,
          customFrequencyDays,
        })
      }

      res.json({ message: 'Billing preferences applied to all users successfully' })
    } catch (error) {
      console.error('Error applying billing preference to all users:', error)
      res.status(500).json({ message: 'Internal server error' })
    }
  }
}



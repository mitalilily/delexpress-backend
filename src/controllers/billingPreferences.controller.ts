import { Request, Response } from 'express'
import { BillingPreferencesService } from '../models/services/billingPreferences.service'

export class BillingPreferencesController {
  // GET /api/billing-preferences/:userId
  static async getBillingPreference(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user.sub
      const preference = await BillingPreferencesService.getByUserId(userId)

      if (!preference) {
        res.status(404).json({ message: 'Billing preference not found' })
        return
      }

      res.json(preference)
    } catch (error) {
      console.error('Error fetching billing preference:', error)
      res.status(500).json({ message: 'Internal server error' })
    }
  }

  // POST /api/billing-preferences/:userId
  static async upsertBillingPreference(req: Request, res: Response): Promise<void> {
    try {
      const userId = (req as any).user.sub
      const { frequency, autoGenerate, customFrequencyDays } = req.body

      if (!['weekly', 'monthly', 'manual', 'custom'].includes(frequency)) {
        res.status(400).json({ message: 'Invalid frequency type' })
        return
      }

      const result = await BillingPreferencesService.upsert(userId, {
        frequency,
        autoGenerate,
        customFrequencyDays,
      })

      res.json({
        message:
          result === 'created'
            ? 'Billing preference created successfully'
            : 'Billing preference updated successfully',
      })
    } catch (error) {
      console.error('Error updating billing preference:', error)
      res.status(500).json({ message: 'Internal server error' })
    }
  }
}

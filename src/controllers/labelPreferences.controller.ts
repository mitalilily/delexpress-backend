// controllers/labelPreferencesController.ts
import { Request, Response } from 'express'
import { labelPreferencesService } from '../models/services/labelPreferences.service'

export const labelPreferencesController = {
  async get(req: Request, res: Response) {
    try {
      const userId = (req as any).user.sub
      const prefs = await labelPreferencesService.getByUser(userId)
      console.log('PREFS', prefs)
      if (!prefs) {
        return res.status(404).json({ message: 'No label preferences found' })
      }
      res.json(prefs)
    } catch (err: any) {
      res.status(500).json({ error: err.message })
    }
  },

  async save(req: Request, res: Response) {
    try {
      const userId = (req as any).user.sub
      const prefs = await labelPreferencesService.createOrUpdate(userId, req.body)
      res.json(prefs)
    } catch (err: any) {
      res.status(500).json({ error: err.message })
    }
  },
}

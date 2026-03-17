import { Request, Response } from 'express'
import { getDashboardPreferences, saveDashboardPreferences } from '../models/services/dashboardPreferences.service'

export const getDashboardPreferencesController = async (req: any, res: Response) => {
  try {
    const userId = req.user?.sub
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' })
    }

    const preferences = await getDashboardPreferences(userId)
    return res.status(200).json({ success: true, data: preferences })
  } catch (error: any) {
    console.error('Error fetching dashboard preferences:', error)
    return res.status(500).json({ success: false, message: error.message })
  }
}

export const saveDashboardPreferencesController = async (req: any, res: Response) => {
  try {
    const userId = req.user?.sub
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' })
    }

    const preferences = await saveDashboardPreferences(userId, req.body)
    return res.status(200).json({ success: true, data: preferences })
  } catch (error: any) {
    console.error('Error saving dashboard preferences:', error)
    return res.status(500).json({ success: false, message: error.message })
  }
}


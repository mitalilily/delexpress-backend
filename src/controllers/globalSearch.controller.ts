import { Response } from 'express'
import { globalSearch } from '../models/services/globalSearch.service'

export const globalSearchController = async (req: any, res: Response) => {
  try {
    const userId = req.user?.sub
    const query = (req.query.q as string) || (req.query.query as string) || ''
    const limit = parseInt((req.query.limit as string) || '10', 10)

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' })
    }

    if (!query || query.trim().length < 2) {
      return res.status(400).json({
        success: false,
        message: 'Search query must be at least 2 characters',
        results: [],
      })
    }

    const results = await globalSearch(userId, query.trim(), limit)

    return res.json({
      success: true,
      results,
      query: query.trim(),
      count: results.length,
    })
  } catch (error: any) {
    console.error('Error in global search:', error)
    return res.status(500).json({
      success: false,
      message: 'Failed to perform search',
      results: [],
    })
  }
}


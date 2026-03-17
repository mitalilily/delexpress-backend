import { Response } from 'express'
import { listRtoEvents } from '../../models/services/rto.service'

/**
 * Get RTO (Return to Origin) events
 * GET /api/v1/rto
 */
export const getRtoEventsController = async (req: any, res: Response) => {
  try {
    const userId = req.userId
    const { orderId, page, limit, search, fromDate, toDate } = req.query as any

    const p = Math.max(Number(page) || 1, 1)
    const l = Math.min(Number(limit) || 20, 200)

    const { rows, totalCount } = await listRtoEvents(userId, orderId, {
      page: p,
      limit: l,
      search: search || '',
      fromDate: fromDate || undefined,
      toDate: toDate || undefined,
    })

    res.status(200).json({
      success: true,
      data: rows,
      pagination: {
        page: p,
        limit: l,
        total: totalCount,
        totalPages: Math.ceil(totalCount / l),
      },
    })
  } catch (error: any) {
    console.error('Error fetching RTO events via API:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to fetch RTO events',
      message: error.message || 'Internal server error',
    })
  }
}

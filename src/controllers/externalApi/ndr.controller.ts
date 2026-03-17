import { Response } from 'express'
import { getNdrTimeline, listNdrEvents } from '../../models/services/ndr.service'

/**
 * Get NDR events
 * GET /api/v1/ndr
 */
export const getNdrEventsController = async (req: any, res: Response) => {
  try {
    const userId = req.userId
    const { orderId, page, limit, search, fromDate, toDate } = req.query as any

    const p = Math.max(Number(page) || 1, 1)
    const l = Math.min(Number(limit) || 20, 200)

    const { rows, totalCount } = await listNdrEvents(userId, orderId, {
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
    console.error('Error fetching NDR events via API:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to fetch NDR events',
      message: error.message || 'Internal server error',
    })
  }
}

/**
 * Get NDR timeline for an order
 * GET /api/v1/ndr/timeline
 */
export const getNdrTimelineController = async (req: any, res: Response) => {
  try {
    const { awb, orderId } = req.query as { awb?: string; orderId?: string }

    if (!awb && !orderId) {
      return res.status(400).json({
        success: false,
        error: 'Missing parameters',
        message: 'Provide either awb or orderId',
      })
    }

    const data = await getNdrTimeline({ awb, orderId })

    res.status(200).json({
      success: true,
      data,
    })
  } catch (error: any) {
    console.error('Error fetching NDR timeline via API:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to fetch NDR timeline',
      message: error.message || 'Internal server error',
    })
  }
}

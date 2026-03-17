import { eq } from 'drizzle-orm'
import { Request, Response } from 'express'
import { db } from '../models/client'
import { buildCsv } from '../utils/csv'
import {
  calculateChargedWeight,
  calculateVolumetricWeight,
  roundToWeightSlab,
} from '../models/services/courierWeightCalculation.service'
import {
  acceptWeightDiscrepancy,
  bulkAcceptDiscrepancies,
  bulkRejectDiscrepancies,
  createWeightDiscrepancy,
  createWeightDispute,
  getDiscrepancyById,
  getWeightDiscrepancies,
  getWeightDisputes,
  getWeightReconciliationSettings,
  getWeightReconciliationSummary,
  rejectWeightDiscrepancy,
  updateWeightReconciliationSettings,
} from '../models/services/weightReconciliation.service'
import { b2b_orders, b2c_orders } from '../schema/schema'

/**
 * Get all weight discrepancies for the current user
 * GET /api/weight-reconciliation/discrepancies
 */
export async function getDiscrepancies(req: Request, res: Response) {
  try {
    const userId = (req as any).user?.sub

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' })
    }

    const {
      status,
      courierPartner,
      orderType,
      fromDate,
      toDate,
      hasDispute,
      minWeightDiff,
      minChargeDiff,
      page,
      limit,
    } = req.query

    const filters: any = { userId }

    if (status) {
      filters.status = Array.isArray(status) ? status : [status]
    }

    if (courierPartner) {
      filters.courierPartner = Array.isArray(courierPartner) ? courierPartner : [courierPartner]
    }

    if (orderType) {
      filters.orderType = orderType as 'b2c' | 'b2b'
    }

    if (fromDate) {
      filters.fromDate = new Date(fromDate as string)
    }

    if (toDate) {
      filters.toDate = new Date(toDate as string)
    }

    if (hasDispute !== undefined) {
      filters.hasDispute = hasDispute === 'true'
    }

    if (minWeightDiff) {
      filters.minWeightDiff = Number(minWeightDiff)
    }

    if (minChargeDiff) {
      filters.minChargeDiff = Number(minChargeDiff)
    }

    if (page) {
      filters.page = Number(page)
    }

    if (limit) {
      filters.limit = Number(limit)
    }

    const result = await getWeightDiscrepancies(filters)

    return res.json(result)
  } catch (error: any) {
    console.error('Error getting weight discrepancies:', error)
    return res.status(500).json({ error: error.message || 'Failed to fetch discrepancies' })
  }
}

/**
 * Get a single discrepancy by ID with full details
 * GET /api/weight-reconciliation/discrepancies/:id
 */
export async function getDiscrepancyDetails(req: Request, res: Response) {
  try {
    const userId = (req as any).user?.sub
    const { id } = req.params

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' })
    }

    const result = await getDiscrepancyById(id)

    // Verify user owns this discrepancy
    if (result.discrepancy.user_id !== userId) {
      return res.status(403).json({ error: 'Forbidden' })
    }

    return res.json(result)
  } catch (error: any) {
    console.error('Error getting discrepancy details:', error)
    return res.status(500).json({ error: error.message || 'Failed to fetch discrepancy details' })
  }
}

/**
 * Accept a weight discrepancy
 * POST /api/weight-reconciliation/discrepancies/:id/accept
 */
export async function acceptDiscrepancy(req: Request, res: Response) {
  try {
    const userId = (req as any).user?.sub
    const { id } = req.params
    const { notes } = req.body

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' })
    }

    await acceptWeightDiscrepancy(id, userId, notes)

    return res.json({ success: true, message: 'Discrepancy accepted' })
  } catch (error: any) {
    console.error('Error accepting discrepancy:', error)
    return res.status(500).json({ error: error.message || 'Failed to accept discrepancy' })
  }
}

/**
 * Reject a weight discrepancy
 * POST /api/weight-reconciliation/discrepancies/:id/reject
 */
export async function rejectDiscrepancy(req: Request, res: Response) {
  try {
    const userId = (req as any).user?.sub
    const { id } = req.params
    const { reason } = req.body

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' })
    }

    if (!reason) {
      return res.status(400).json({ error: 'Reason is required' })
    }

    await rejectWeightDiscrepancy(id, userId, reason)

    return res.json({ success: true, message: 'Discrepancy rejected' })
  } catch (error: any) {
    console.error('Error rejecting discrepancy:', error)
    return res.status(500).json({ error: error.message || 'Failed to reject discrepancy' })
  }
}

/**
 * Bulk accept discrepancies
 * POST /api/weight-reconciliation/discrepancies/bulk-accept
 */
export async function bulkAccept(req: Request, res: Response) {
  try {
    const userId = (req as any).user?.sub
    const { discrepancyIds, notes } = req.body

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' })
    }

    if (!discrepancyIds || !Array.isArray(discrepancyIds) || discrepancyIds.length === 0) {
      return res.status(400).json({ error: 'Discrepancy IDs are required' })
    }

    const results = await bulkAcceptDiscrepancies(discrepancyIds, userId, notes)

    return res.json({ success: true, results })
  } catch (error: any) {
    console.error('Error bulk accepting discrepancies:', error)
    return res.status(500).json({ error: error.message || 'Failed to bulk accept discrepancies' })
  }
}

/**
 * Bulk reject discrepancies
 * POST /api/weight-reconciliation/discrepancies/bulk-reject
 */
export async function bulkReject(req: Request, res: Response) {
  try {
    const userId = (req as any).user?.sub
    const { discrepancyIds, reason } = req.body

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' })
    }

    if (!discrepancyIds || !Array.isArray(discrepancyIds) || discrepancyIds.length === 0) {
      return res.status(400).json({ error: 'Discrepancy IDs are required' })
    }

    if (!reason) {
      return res.status(400).json({ error: 'Reason is required' })
    }

    const results = await bulkRejectDiscrepancies(discrepancyIds, userId, reason)

    return res.json({ success: true, results })
  } catch (error: any) {
    console.error('Error bulk rejecting discrepancies:', error)
    return res.status(500).json({ error: error.message || 'Failed to bulk reject discrepancies' })
  }
}

/**
 * Create a dispute for a discrepancy
 * POST /api/weight-reconciliation/disputes
 */
export async function createDispute(req: Request, res: Response) {
  try {
    const userId = (req as any).user?.sub

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' })
    }

    const {
      discrepancyId,
      disputeReason,
      customerComment,
      customerClaimedWeight,
      customerClaimedDimensions,
      evidenceUrls,
    } = req.body

    if (!discrepancyId || !disputeReason || !customerComment) {
      return res.status(400).json({ error: 'Missing required fields' })
    }

    const dispute = await createWeightDispute({
      discrepancyId,
      userId,
      disputeReason,
      customerComment,
      customerClaimedWeight,
      customerClaimedDimensions,
      evidenceUrls,
    })

    return res.json({ success: true, dispute })
  } catch (error: any) {
    console.error('Error creating dispute:', error)
    return res.status(500).json({ error: error.message || 'Failed to create dispute' })
  }
}

/**
 * Get all disputes for the current user
 * GET /api/weight-reconciliation/disputes
 */
export async function getDisputes(req: Request, res: Response) {
  try {
    const userId = (req as any).user?.sub

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' })
    }

    const { status, page, limit } = req.query

    const filters: any = { userId }

    if (status) {
      filters.status = Array.isArray(status) ? status : [status]
    }

    if (page) {
      filters.page = Number(page)
    }

    if (limit) {
      filters.limit = Number(limit)
    }

    const result = await getWeightDisputes(filters)

    return res.json(result)
  } catch (error: any) {
    console.error('Error getting disputes:', error)
    return res.status(500).json({ error: error.message || 'Failed to fetch disputes' })
  }
}

/**
 * Get weight reconciliation summary/analytics
 * GET /api/weight-reconciliation/summary
 */
export async function getSummary(req: Request, res: Response) {
  try {
    const userId = (req as any).user?.sub

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' })
    }

    const { fromDate, toDate } = req.query

    const from = fromDate ? new Date(fromDate as string) : undefined
    const to = toDate ? new Date(toDate as string) : undefined

    const summary = await getWeightReconciliationSummary(userId, from, to)

    return res.json(summary)
  } catch (error: any) {
    console.error('Error getting summary:', error)
    return res.status(500).json({ error: error.message || 'Failed to fetch summary' })
  }
}

/**
 * Get user's weight reconciliation settings
 * GET /api/weight-reconciliation/settings
 */
export async function getSettings(req: Request, res: Response) {
  try {
    const userId = (req as any).user?.sub

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' })
    }

    const settings = await getWeightReconciliationSettings(userId)

    return res.json(settings)
  } catch (error: any) {
    console.error('Error getting settings:', error)
    return res.status(500).json({ error: error.message || 'Failed to fetch settings' })
  }
}

/**
 * Update user's weight reconciliation settings
 * PUT /api/weight-reconciliation/settings
 */
export async function updateSettings(req: Request, res: Response) {
  try {
    const userId = (req as any).user?.sub

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' })
    }

    const updates = req.body

    const settings = await updateWeightReconciliationSettings(userId, updates)

    return res.json({ success: true, settings })
  } catch (error: any) {
    console.error('Error updating settings:', error)
    return res.status(500).json({ error: error.message || 'Failed to update settings' })
  }
}

/**
 * Export discrepancies as CSV
 * GET /api/weight-reconciliation/export
 */
export async function exportDiscrepancies(req: Request, res: Response) {
  try {
    const userId = (req as any).user?.sub

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' })
    }

    const { status, courierPartner, orderType, fromDate, toDate, hasDispute } = req.query

    const filters: any = { userId }

    if (status) {
      filters.status = Array.isArray(status) ? status : [status]
    }

    if (courierPartner) {
      filters.courierPartner = Array.isArray(courierPartner) ? courierPartner : [courierPartner]
    }

    if (orderType) {
      filters.orderType = orderType as 'b2c' | 'b2b'
    }

    if (fromDate) {
      filters.fromDate = new Date(fromDate as string)
    }

    if (toDate) {
      filters.toDate = new Date(toDate as string)
    }

    if (hasDispute !== undefined) {
      filters.hasDispute = hasDispute === 'true'
    }

    // Get all discrepancies without pagination
    const { discrepancies } = await getWeightDiscrepancies({ ...filters, limit: 10000 })

    // Generate CSV
    const headers = [
      'Order Number',
      'AWB Number',
      'Courier',
      'Order Type',
      'Declared Weight (kg)',
      'Actual Weight (kg)',
      'Volumetric Weight (kg)',
      'Charged Weight (kg)',
      'Weight Difference (kg)',
      'Original Charge (₹)',
      'Revised Charge (₹)',
      'Additional Charge (₹)',
      'Status',
      'Auto Accepted',
      'Has Dispute',
      'Created At',
      'Resolved At',
    ]

    const rows = discrepancies.map((d) => [
      d.order_number,
      d.awb_number || '',
      d.courier_partner || '',
      d.order_type,
      Number(d.declared_weight).toFixed(3),
      d.actual_weight ? Number(d.actual_weight).toFixed(3) : '',
      d.volumetric_weight ? Number(d.volumetric_weight).toFixed(3) : '',
      Number(d.charged_weight).toFixed(3),
      Number(d.weight_difference).toFixed(3),
      d.original_shipping_charge || '',
      d.revised_shipping_charge || '',
      Number(d.additional_charge || 0).toFixed(2),
      d.status,
      d.auto_accepted ? 'Yes' : 'No',
      d.has_dispute ? 'Yes' : 'No',
      d.created_at ? new Date(d.created_at as string | Date).toISOString() : '',
      d.resolved_at ? new Date(d.resolved_at as string | Date).toISOString() : '',
    ])

    const csv = buildCsv(headers, rows)

    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="weight-discrepancies-${new Date().toISOString().split('T')[0]}.csv"`,
    )

    return res.send(csv)
  } catch (error: any) {
    console.error('Error exporting discrepancies:', error)
    return res.status(500).json({ error: error.message || 'Failed to export discrepancies' })
  }
}

/**
 * Manually report a weight discrepancy for an order
 * POST /api/weight-reconciliation/discrepancies/manual-report
 */
export async function manuallyReportDiscrepancy(req: Request, res: Response) {
  try {
    const userId = (req as any).user?.sub

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' })
    }

    const {
      orderNumber,
      orderType = 'b2c',
      actualWeight,
      actualDimensions,
      courierReportedChargedWeight,
      evidenceUrls,
      notes,
    } = req.body

    // Validate required fields
    if (!orderNumber) {
      return res.status(400).json({ error: 'Order number is required' })
    }

    // Get order
    const orderTable = orderType === 'b2c' ? b2c_orders : b2b_orders
    const [order] = await db
      .select()
      .from(orderTable)
      .where(eq(orderTable.order_number, orderNumber))

    if (!order) {
      return res.status(404).json({ error: 'Order not found' })
    }

    if (order.user_id !== userId) {
      return res.status(403).json({ error: 'Unauthorized to report for this order' })
    }

    // Calculate weights
    const declaredWeight = Number(order.weight)
    const declaredDimensions = {
      length: Number(order.length || 0),
      breadth: Number(order.breadth || 0),
      height: Number(order.height || 0),
    }

    let volumetricWeight: number | undefined
    let chargedWeight: number

    // Calculate volumetric weight if dimensions provided
    if (actualDimensions?.length && actualDimensions?.breadth && actualDimensions?.height) {
      volumetricWeight = calculateVolumetricWeight(
        actualDimensions,
        order.courier_partner || undefined,
      )
    }

    // Determine charged weight
    if (courierReportedChargedWeight) {
      chargedWeight = Number(courierReportedChargedWeight)
    } else if (actualWeight && volumetricWeight) {
      chargedWeight = calculateChargedWeight(
        actualWeight,
        volumetricWeight,
        order.courier_partner || undefined,
      )
    } else if (actualWeight) {
      chargedWeight = roundToWeightSlab(actualWeight, order.courier_partner || undefined)
    } else {
      return res
        .status(400)
        .json({ error: 'Must provide either actualWeight or courierReportedChargedWeight' })
    }

    // Create discrepancy
    const discrepancy = await createWeightDiscrepancy({
      orderType: orderType as 'b2c' | 'b2b',
      orderId: order.id,
      userId,
      orderNumber,
      awbNumber: order.awb_number || undefined,
      courierPartner: order.courier_partner || undefined,
      declaredWeight,
      actualWeight: actualWeight ? Number(actualWeight) : undefined,
      volumetricWeight,
      chargedWeight,
      declaredDimensions,
      actualDimensions,
      originalShippingCharge: Number(order.shipping_charges || 0),
      courierRemarks: notes,
    })

    // If evidence URLs provided, create a dispute automatically
    if (evidenceUrls && evidenceUrls.length > 0) {
      await createWeightDispute({
        discrepancyId: discrepancy.id,
        userId,
        disputeReason: 'Manual weight report with evidence',
        customerComment: notes,
        evidenceUrls,
      })
    }

    res.json(discrepancy)
  } catch (error) {
    console.error('Error manually reporting discrepancy:', error)
    res.status(500).json({ error: 'Failed to report discrepancy' })
  }
}

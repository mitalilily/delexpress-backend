import { Response } from 'express'
import { eq, inArray } from 'drizzle-orm'
import { db } from '../../models/client'
import { b2c_orders, b2b_orders } from '../../schema/schema'
import { generateManifestService } from '../../models/services/shiprocket.service'

/**
 * Generate manifest for orders
 * POST /api/v1/manifest
 */
export const generateManifestController = async (req: any, res: Response) => {
  try {
    const userId = req.userId // From requireApiKey middleware
    const { awbs, order_numbers, type = 'b2c' } = req.body

    // Validate input
    if ((!awbs || !Array.isArray(awbs) || awbs.length === 0) && 
        (!order_numbers || !Array.isArray(order_numbers) || order_numbers.length === 0)) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
        message: 'awbs or order_numbers (array) is required',
      })
    }

    if (!['b2c', 'b2b'].includes(type)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid manifest type',
        message: 'type must be either "b2c" or "b2b"',
      })
    }

    // Use awbs if provided, otherwise use order_numbers
    const identifiers = awbs || order_numbers

    // Verify that all orders belong to the user
    const table = type === 'b2c' ? b2c_orders : b2b_orders
    const orders = await db
      .select({
        id: table.id,
        awb_number: table.awb_number,
        order_number: table.order_number,
        user_id: table.user_id,
      })
      .from(table)
      .where(
        inArray(
          awbs ? table.awb_number : table.order_number,
          identifiers,
        ),
      )

    if (orders.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Orders not found',
        message: 'No orders found for the provided identifiers',
      })
    }

    // Check if all orders belong to the user
    const unauthorizedOrders = orders.filter((o) => o.user_id !== userId)
    if (unauthorizedOrders.length > 0) {
      return res.status(403).json({
        success: false,
        error: 'Forbidden',
        message: 'You do not have access to some of the specified orders',
      })
    }

    // Extract AWB numbers for manifest generation
    const awbNumbers = orders.map((o) => o.awb_number).filter(Boolean) as string[]

    if (awbNumbers.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid orders',
        message: 'No valid AWB numbers found for the specified orders',
      })
    }

    // Generate manifest
    const { manifest_id, manifest_url, manifest_key, warnings } = await generateManifestService({
      awbs: awbNumbers,
      type: type as 'b2c' | 'b2b',
      userId,
    })

    res.status(200).json({
      success: true,
      message: 'Manifest generated successfully',
      data: {
        manifest_id,
        manifest_url,
        manifest_key,
        warnings,
        order_count: awbNumbers.length,
        type,
      },
    })
  } catch (error: any) {
    console.error('Error generating manifest via API:', error)
    res.status(typeof error?.statusCode === 'number' ? error.statusCode : 500).json({
      success: false,
      error: 'Failed to generate manifest',
      message: error.message || 'Internal server error',
    })
  }
}

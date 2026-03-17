import { eq } from 'drizzle-orm'
import { Response } from 'express'
import { db } from '../../models/client'
import { DelhiveryService } from '../../models/services/couriers/delhivery.service'
import { EkartService } from '../../models/services/couriers/ekart.service'
import { XpressbeesService } from '../../models/services/couriers/xpressbees.service'
import {
  createB2CShipmentService,
  getB2COrdersByUserService,
  retryFailedManifestService,
  ShipmentParams,
  trackByAwbService,
  trackByOrderService,
} from '../../models/services/shiprocket.service'
import { presignDownload } from '../../models/services/upload.service'
import { applyCancellationRefundOnce } from '../../models/services/webhookProcessor'
import { b2c_orders } from '../../schema/schema'
import { sendWebhookEvent } from '../../services/webhookDelivery.service'
import { getOpaqueProviderCode } from '../../utils/externalApiHelpers'

/**
 * Create a B2C order via external API
 * POST /api/v1/orders
 */
export const createOrderController = async (req: any, res: Response) => {
  try {
    const userId = req.userId // From requireApiKey middleware
    const params: ShipmentParams = req.body

    // Validate required fields
    if (!params.order_number || !params.consignee || !params.order_items?.length) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
        message: 'order_number, consignee, and order_items are required',
      })
    }

    // Create the shipment (via external API, so is_external_api = true)
    const result = await createB2CShipmentService(params, userId, true)
    const { order: newOrder, shipment: shipmentData } = result

    // Fetch the full order data
    const [order] = await db
      .select()
      .from(b2c_orders)
      .where(eq(b2c_orders.id, newOrder.id))
      .limit(1)

    if (!order) {
      return res.status(500).json({
        success: false,
        error: 'Order creation failed',
        message: 'Order was created but could not be retrieved',
      })
    }

    // Send webhook event
    await sendWebhookEvent(userId, 'order.created', {
      order_id: order.id,
      order_number: order.order_number,
      awb_number: order.awb_number,
      status: order.order_status || 'booked',
      shipment_data: shipmentData,
    })

    // Delhivery manifestation is part of shipment creation.
    const createManifest = false

    // Generate opaque provider code to hide actual integration_type from external API users
    const providerCode = getOpaqueProviderCode(order.integration_type)

    res.status(201).json({
      success: true,
      message: 'Order created successfully',
      data: {
        order_id: order.id,
        order_number: order.order_number,
        awb_number: order.awb_number,
        status: order.order_status || 'booked',
        label: order.label,
        courier_partner: order.courier_partner,
        createManifest: createManifest,
        provider_code: providerCode, // Opaque code - users cannot determine actual provider
      },
    })
  } catch (error: any) {
    console.error('Error creating order via API:', error)
    res.status(typeof error?.statusCode === 'number' ? error.statusCode : 500).json({
      success: false,
      error: 'Failed to create order',
      message: error.message || 'Internal server error',
    })
  }
}

/**
 * Get orders list
 * GET /api/v1/orders
 */
export const getOrdersController = async (req: any, res: Response) => {
  try {
    const userId = req.userId
    const page = Math.max(parseInt(req.query.page as string, 10) || 1, 1)
    const limit = Math.min(parseInt(req.query.limit as string, 10) || 10, 100)

    const filters = {
      status: req.query.status as string | undefined,
      type: req.query.type as string | undefined,
      courier: req.query.courier as string | undefined,
      fromDate: req.query.fromDate as string | undefined,
      toDate: req.query.toDate as string | undefined,
      search: req.query.search as string | undefined,
    }

    const { orders, totalCount, totalPages } = await getB2COrdersByUserService(
      userId,
      page,
      limit,
      filters,
    )

    res.status(200).json({
      success: true,
      data: orders,
      pagination: {
        page,
        limit,
        total: totalCount,
        totalPages,
      },
    })
  } catch (error: any) {
    console.error('Error fetching orders via API:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to fetch orders',
      message: error.message || 'Internal server error',
    })
  }
}

/**
 * Get order by ID or order number
 * GET /api/v1/orders/:orderId
 */
export const getOrderController = async (req: any, res: Response) => {
  try {
    const userId = req.userId
    const { orderId } = req.params

    // Try to get order by order_number or order_id
    const { orders } = await getB2COrdersByUserService(userId, 1, 1, {
      search: orderId,
    })

    const order = orders.find(
      (o: any) => o.order_number === orderId || o.order_id === orderId || o.id === orderId,
    )

    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Order not found',
        message: `Order with ID ${orderId} not found`,
      })
    }

    res.status(200).json({
      success: true,
      data: order,
    })
  } catch (error: any) {
    console.error('Error fetching order via API:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to fetch order',
      message: error.message || 'Internal server error',
    })
  }
}

export const retryFailedManifestController = async (req: any, res: Response) => {
  try {
    const userId = req.userId
    const { orderId } = req.params

    const result = await retryFailedManifestService(String(orderId), userId)

    res.status(200).json({
      success: true,
      message: 'Manifest retry completed successfully',
      data: result,
    })
  } catch (error: any) {
    console.error('Error retrying failed manifest via API:', error)
    res.status(typeof error?.statusCode === 'number' ? error.statusCode : 500).json({
      success: false,
      error: 'Failed to retry manifest',
      message: error?.message || 'Internal server error',
    })
  }
}

/**
 * Track order by AWB or order number
 * GET /api/v1/orders/track
 */
export const trackOrderController = async (req: any, res: Response) => {
  try {
    const { awb, orderNumber, contact } = req.query

    let awbNumber: string | undefined = awb ? String(awb) : undefined

    if (!awbNumber && orderNumber && contact) {
      const contactStr = String(contact)
      const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactStr)
      const isPhone = /^\d{7,15}$/.test(contactStr)

      if (!isEmail && !isPhone) {
        return res.status(400).json({
          success: false,
          error: 'Invalid contact',
          message: 'Contact must be a valid email or phone number',
        })
      }

      const orderData = await trackByOrderService({
        orderNumber: String(orderNumber),
        email: isEmail ? contactStr : undefined,
        phone: isPhone ? contactStr : undefined,
      })

      awbNumber = orderData?.awb_number ?? ''
      if (!awbNumber) {
        return res.status(404).json({
          success: false,
          error: 'AWB not found',
          message: 'AWB number not found for this order',
        })
      }
    }

    if (awbNumber) {
      const trackingData = await trackByAwbService(awbNumber)
      return res.json({
        success: true,
        data: trackingData,
      })
    }

    return res.status(400).json({
      success: false,
      error: 'Missing parameters',
      message: "Provide either 'awb' or ('orderNumber' with 'contact')",
    })
  } catch (err: any) {
    console.error('Error tracking order via API:', err)
    return res.status(500).json({
      success: false,
      error: 'Failed to track order',
      message: err.message || 'Internal server error',
    })
  }
}

/**
 * Cancel an order
 * POST /api/v1/orders/:orderId/cancel
 */
export const cancelOrderController = async (req: any, res: Response) => {
  try {
    const userId = req.userId
    const { orderId } = req.params
    const { reason } = req.body

    // Find the order
    const { orders } = await getB2COrdersByUserService(userId, 1, 1, {
      search: orderId,
    })

    const order = orders.find(
      (o: any) => o.order_number === orderId || o.order_id === orderId || o.id === orderId,
    )

    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Order not found',
        message: `Order with ID ${orderId} not found`,
      })
    }

    // Check if order can be cancelled
    const cancellableStatuses = ['booked', 'pending', 'confirmed', 'pickup_initiated']
    if (!cancellableStatuses.includes(order.order_status?.toLowerCase() || '')) {
      return res.status(400).json({
        success: false,
        error: 'Order cannot be cancelled',
        message: `Order with status "${order.order_status}" cannot be cancelled`,
      })
    }

    let cancellationResult: any = null
    const provider = String(order.integration_type || '').toLowerCase()
    if (!['delhivery', 'ekart', 'xpressbees'].includes(provider)) {
      return res.status(400).json({
        success: false,
        error: 'Unsupported provider',
        message: `Only Delhivery, Ekart and Xpressbees are supported for cancellation. Found: ${order.integration_type}`,
      })
    }

    if (!order.awb_number) {
      return res.status(400).json({
        success: false,
        error: 'Missing AWB',
        message: 'Cancellation requires an AWB number',
      })
    }

    try {
      if (provider === 'delhivery') {
        const delhivery = new DelhiveryService()
        cancellationResult = await delhivery.cancelShipment(order.awb_number)
      } else if (provider === 'ekart') {
        const ekart = new EkartService()
        cancellationResult = await ekart.cancelShipment(order.awb_number)
      } else {
        const xpressbees = new XpressbeesService()
        cancellationResult = await xpressbees.cancelShipment(order.awb_number)
      }
    } catch (err: any) {
      console.error('Courier cancellation error:', err)
      return res.status(502).json({
        success: false,
        error: 'Courier cancellation failed',
        message: err?.message || 'Courier cancellation failed',
      })
    }

    const providerCancelAccepted =
      cancellationResult?.success === true ||
      cancellationResult?.Success === true ||
      cancellationResult?.status === true ||
      cancellationResult?.status === 'Success' ||
      cancellationResult?.status === 'success' ||
      cancellationResult?.response?.status === true ||
      (typeof cancellationResult?.remark === 'string' &&
        cancellationResult.remark.toLowerCase().includes('cancelled')) ||
      (typeof cancellationResult?.message === 'string' &&
        cancellationResult.message.toLowerCase().includes('cancelled') &&
        !cancellationResult?.error)

    if (!providerCancelAccepted) {
      return res.status(502).json({
        success: false,
        error: 'Courier cancellation rejected',
        message:
          cancellationResult?.error ||
          cancellationResult?.message ||
          'Delhivery did not confirm cancellation',
        data: {
          provider: 'delhivery',
          awb_number: order.awb_number,
          provider_response: cancellationResult,
        },
      })
    }

    await db.transaction(async (tx) => {
      await tx
        .update(b2c_orders)
        .set({
          order_status: 'cancelled',
          updated_at: new Date(),
        })
        .where(eq(b2c_orders.id, order.id))

      await applyCancellationRefundOnce(tx, order, 'cancel_api')
    })

    // Send webhook event
    await sendWebhookEvent(userId, 'order.cancelled', {
      order_id: order.id,
      order_number: order.order_number,
      awb_number: order.awb_number,
      status: 'cancelled',
      cancellation_reason: reason || 'Cancelled via API',
      cancelled_at: new Date().toISOString(),
    })

    res.status(200).json({
      success: true,
      message: 'Order cancelled successfully',
      data: {
        order_id: order.id,
        order_number: order.order_number,
        awb_number: order.awb_number,
        status: 'cancelled',
        cancellation_reason: reason || 'Cancelled via API',
      },
    })
  } catch (error: any) {
    console.error('Error cancelling order via API:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to cancel order',
      message: error.message || 'Internal server error',
    })
  }
}

/**
 * Get shipping label for an order
 * GET /api/v1/orders/:orderId/label
 */
export const getOrderLabelController = async (req: any, res: Response) => {
  try {
    const userId = req.userId
    const { orderId } = req.params

    // Find the order
    const { orders } = await getB2COrdersByUserService(userId, 1, 1, {
      search: orderId,
    })

    const order = orders.find(
      (o: any) => o.order_number === orderId || o.order_id === orderId || o.id === orderId,
    )

    if (!order) {
      return res.status(404).json({
        success: false,
        error: 'Order not found',
        message: `Order with ID ${orderId} not found`,
      })
    }

    if (!order.label) {
      return res.status(404).json({
        success: false,
        error: 'Label not found',
        message: 'Shipping label has not been generated for this order',
      })
    }

    // Generate presigned URL for label
    let labelUrl: string
    try {
      const signed = await presignDownload(order.label)
      labelUrl = Array.isArray(signed) ? signed[0] || order.label : signed
    } catch (err) {
      // Fallback to stored URL if presigning fails
      labelUrl = order.label
    }

    res.status(200).json({
      success: true,
      data: {
        order_id: order.id,
        order_number: order.order_number,
        awb_number: order.awb_number,
        label_url: labelUrl,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours
      },
    })
  } catch (error: any) {
    console.error('Error fetching label via API:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to fetch label',
      message: error.message || 'Internal server error',
    })
  }
}

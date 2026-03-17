import { Response } from 'express'
import { fetchAvailableCouriersWithRates } from '../../models/services/shiprocket.service'
import { extractOrderAmountFromBody } from '../../utils/orderAmount'

/**
 * Get shipping rates for a shipment
 * POST /api/v1/shipping/rates
 *
 * This endpoint calculates shipping rates without creating an order.
 * Use this to show shipping costs to customers before order creation.
 */
export const getShippingRatesController = async (req: any, res: Response) => {
  try {
    const userId = req.userId // From requireApiKey middleware
    const {
      destination,
      payment_type = 'prepaid',
      weight = 500,
      length = 10,
      breadth = 10,
      height = 10,
      shipment_type,
      pickup_id,
      is_reverse,
    } = req.body

    // Validate required fields
    if (!destination) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
        message: 'destination pincode is required',
      })
    }

    // Get origin from user's primary pickup address if not provided
    // For now, we'll require origin or get it from pickup_id
    let origin: number | undefined

    if (pickup_id) {
      // If pickup_id is provided, we'll use it to get the origin pincode
      // The service will handle this internally
    } else {
      // Origin should be provided or will be fetched from user's primary pickup
      origin = req.body.origin ? Number(req.body.origin) : undefined
    }

    const orderAmountResult = extractOrderAmountFromBody(req.body)
    if (orderAmountResult.invalid) {
      return res.status(400).json({
        success: false,
        error: 'order_amount must be a non-negative number',
        message: 'order_amount must be numeric and non-negative',
      })
    }

    // Build serviceability options (no preferred carriers - return all)
    const serviceabilityOptions: any = {}
    if (pickup_id) serviceabilityOptions.pickupId = pickup_id
    if (is_reverse === true || is_reverse === 'true') serviceabilityOptions.isReverseShipment = true

    // Fetch available couriers with rates (returns all available delivery carriers)
    const couriers = await fetchAvailableCouriersWithRates(
      {
        origin: origin || 0, // Will be determined from pickup address if not provided
        destination: Number(destination),
        payment_type: payment_type as 'cod' | 'prepaid' | 'reverse',
        order_amount: orderAmountResult.value,
        shipment_type:
          shipment_type && ['b2b', 'b2c'].includes(shipment_type)
            ? (shipment_type as 'b2b' | 'b2c')
            : undefined,
        weight: Number(weight),
        length: Number(length),
        breadth: Number(breadth),
        height: Number(height),
        ...serviceabilityOptions,
      },
      userId,
    )

    // Format response for shipping rates
    // Note: integration_type is intentionally excluded from external API responses
    const rates = (couriers ?? []).map((courier: any) => ({
      courier_option_key: courier.courier_option_key || null,
      courier_id: courier.id,
      courier_name: courier.displayName || courier.name,
      rate: courier.rate || courier.freight_charges || courier.charge || 0,
      chargeable_weight_g: courier.chargeable_weight ?? null,
      volumetric_weight_g: courier.volumetric_weight ?? null,
      slabs: courier.slabs ?? null,
      max_slab_weight: courier.max_slab_weight ?? null,
      estimated_delivery_days: courier.estimated_delivery_days || courier.tat || '3-5',
      estimated_delivery_date: courier.estimated_delivery_date,
      serviceable: courier.serviceable !== false,
      cod_available: courier.cod_available !== false,
      zone: courier.zone,
    }))

    res.status(200).json({
      success: true,
      data: {
        rates,
        origin_pincode: origin,
        destination_pincode: destination,
        payment_type,
        weight_grams: weight,
        dimensions: {
          length,
          breadth,
          height,
        },
      },
    })
  } catch (error: any) {
    console.error('Error fetching shipping rates via API:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to fetch shipping rates',
      message: error.message || 'Internal server error',
    })
  }
}

import { and, eq, inArray } from 'drizzle-orm'
import { Response } from 'express'
import { db } from '../../models/client'
import { DelhiveryService } from '../../models/services/couriers/delhivery.service'
import {
  createPickupAddressService,
  updatePickupAddressService,
} from '../../models/services/pickupAddresses.service'
import { addresses, b2c_orders, pickupAddresses } from '../../schema/schema'

/**
 * Create/Register pickup address
 * POST /api/v1/pickup-addresses
 */
export const createPickupAddressController = async (req: any, res: Response) => {
  try {
    const userId = req.userId
    const { pickup, rto_address, is_primary, is_pickup_enabled } = req.body

    // Validate required fields
    if (!pickup) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
        message: 'pickup address is required',
      })
    }

    // Validate pickup address required fields
    if (
      !pickup.contact_name ||
      !pickup.contact_phone ||
      !pickup.address_line_1 ||
      !pickup.city ||
      !pickup.state ||
      !pickup.pincode
    ) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
        message:
          'pickup address must include: contact_name, contact_phone, address_line_1, city, state, pincode',
      })
    }

    // Map request body to CreatePickupDto format
    const createPickupDto = {
      pickup: {
        contactName: pickup.contact_name,
        contactPhone: pickup.contact_phone,
        contactEmail: pickup.contact_email,
        addressLine1: pickup.address_line_1,
        addressLine2: pickup.address_line_2,
        landmark: pickup.landmark,
        city: pickup.city,
        state: pickup.state,
        country: pickup.country || 'India',
        pincode: pickup.pincode,
        latitude: pickup.latitude,
        longitude: pickup.longitude,
        gstNumber: pickup.gst_number,
        addressNickname: pickup.address_nickname || pickup.warehouse_name || pickup.contact_name,
      },
      rtoAddress: rto_address
        ? {
            contactName: rto_address.contact_name || pickup.contact_name,
            contactPhone: rto_address.contact_phone || pickup.contact_phone,
            contactEmail: rto_address.contact_email || pickup.contact_email,
            addressLine1: rto_address.address_line_1,
            addressLine2: rto_address.address_line_2,
            landmark: rto_address.landmark,
            city: rto_address.city,
            state: rto_address.state,
            country: rto_address.country || 'India',
            pincode: rto_address.pincode,
            latitude: rto_address.latitude,
            longitude: rto_address.longitude,
            gstNumber: rto_address.gst_number,
          }
        : undefined,
      isPrimary: is_primary ?? false,
      isPickupEnabled: is_pickup_enabled ?? true,
    }

    // Create pickup address (this also registers with courier partners)
    const created = await createPickupAddressService(createPickupDto, userId)

    // Fetch the created pickup with address details
    const [pickupAddr] = await db
      .select()
      .from(addresses)
      .where(eq(addresses.id, created.addressId!))
      .limit(1)

    let rtoAddr = null
    if (created.rtoAddressId && created.rtoAddressId !== created.addressId) {
      const [rto] = await db
        .select()
        .from(addresses)
        .where(eq(addresses.id, created.rtoAddressId))
        .limit(1)
      rtoAddr = rto
    }

    res.status(201).json({
      success: true,
      message: 'Pickup address registered successfully',
      data: {
        id: created.id,
        is_primary: created.isPrimary,
        is_pickup_enabled: created.isPickupEnabled,
        pickup_address: pickupAddr
          ? {
              name: pickupAddr.contactName,
              phone: pickupAddr.contactPhone,
              email: pickupAddr.contactEmail,
              address_line_1: pickupAddr.addressLine1,
              address_line_2: pickupAddr.addressLine2,
              city: pickupAddr.city,
              state: pickupAddr.state,
              pincode: pickupAddr.pincode,
              country: pickupAddr.country,
            }
          : null,
        rto_address: rtoAddr
          ? {
              name: rtoAddr.contactName,
              phone: rtoAddr.contactPhone,
              email: rtoAddr.contactEmail,
              address_line_1: rtoAddr.addressLine1,
              address_line_2: rtoAddr.addressLine2,
              city: rtoAddr.city,
              state: rtoAddr.state,
              pincode: rtoAddr.pincode,
              country: rtoAddr.country,
            }
          : null,
        created_at: pickupAddr?.createdAt?.toISOString() || new Date().toISOString(),
        updated_at: pickupAddr?.updatedAt?.toISOString() || new Date().toISOString(),
      },
    })
  } catch (error: any) {
    console.error('Error creating pickup address via API:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to register pickup address',
      message: error.message || 'Internal server error',
    })
  }
}

/**
 * Get pickup addresses
 * GET /api/v1/pickup-addresses
 */
export const getPickupAddressesController = async (req: any, res: Response) => {
  try {
    const userId = req.userId

    const pickups = await db
      .select({
        id: pickupAddresses.id,
        address_id: pickupAddresses.addressId,
        rto_address_id: pickupAddresses.rtoAddressId,
        is_primary: pickupAddresses.isPrimary,
        is_pickup_enabled: pickupAddresses.isPickupEnabled,
      })
      .from(pickupAddresses)
      .where(eq(pickupAddresses.userId, userId))

    // Fetch address details for each pickup
    const pickupsWithAddresses = await Promise.all(
      pickups.map(async (pickup) => {
        const [pickupAddr] = await db
          .select()
          .from(addresses)
          .where(eq(addresses.id, pickup.address_id!))
          .limit(1)

        let rtoAddr = null
        if (pickup.rto_address_id && pickup.rto_address_id !== pickup.address_id) {
          const [rto] = await db
            .select()
            .from(addresses)
            .where(eq(addresses.id, pickup.rto_address_id))
            .limit(1)
          rtoAddr = rto
        }

        return {
          id: pickup.id,
          is_primary: pickup.is_primary,
          is_pickup_enabled: pickup.is_pickup_enabled,
          pickup_address: pickupAddr
            ? {
                name: pickupAddr.contactName,
                phone: pickupAddr.contactPhone,
                email: pickupAddr.contactEmail,
                address_line_1: pickupAddr.addressLine1,
                address_line_2: pickupAddr.addressLine2,
                city: pickupAddr.city,
                state: pickupAddr.state,
                pincode: pickupAddr.pincode,
                country: pickupAddr.country,
              }
            : null,
          rto_address: rtoAddr
            ? {
                name: rtoAddr.contactName,
                phone: rtoAddr.contactPhone,
                email: rtoAddr.contactEmail,
                address_line_1: rtoAddr.addressLine1,
                address_line_2: rtoAddr.addressLine2,
                city: rtoAddr.city,
                state: rtoAddr.state,
                pincode: rtoAddr.pincode,
                country: rtoAddr.country,
              }
            : null,
          created_at: pickupAddr?.createdAt?.toISOString() || new Date().toISOString(),
          updated_at: pickupAddr?.updatedAt?.toISOString() || new Date().toISOString(),
        }
      }),
    )

    res.status(200).json({
      success: true,
      data: pickupsWithAddresses,
    })
  } catch (error: any) {
    console.error('Error fetching pickup addresses via API:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to fetch pickup addresses',
      message: error.message || 'Internal server error',
    })
  }
}

/**
 * Update pickup address
 * PUT /api/v1/pickup-addresses/:id
 */
export const updatePickupAddressController = async (req: any, res: Response) => {
  try {
    const userId = req.userId
    const pickupId = req.params.id
    const { pickup, rto_address, is_primary, is_pickup_enabled } = req.body

    if (!pickupId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
        message: 'pickup address id is required',
      })
    }

    // Map request body to UpdatePickupDto format
    const updatePickupDto = {
      pickup: pickup
        ? {
            contactName: pickup.contact_name,
            contactPhone: pickup.contact_phone,
            contactEmail: pickup.contact_email,
            addressLine1: pickup.address_line_1,
            addressLine2: pickup.address_line_2,
            landmark: pickup.landmark,
            city: pickup.city,
            state: pickup.state,
            country: pickup.country || 'India',
            pincode: pickup.pincode,
            latitude: pickup.latitude,
            longitude: pickup.longitude,
            gstNumber: pickup.gst_number,
            addressNickname:
              pickup.address_nickname || pickup.warehouse_name || pickup.contact_name,
          }
        : undefined,
      rtoAddress: rto_address
        ? {
            contactName: rto_address.contact_name,
            contactPhone: rto_address.contact_phone,
            contactEmail: rto_address.contact_email,
            addressLine1: rto_address.address_line_1,
            addressLine2: rto_address.address_line_2,
            landmark: rto_address.landmark,
            city: rto_address.city,
            state: rto_address.state,
            country: rto_address.country || 'India',
            pincode: rto_address.pincode,
            latitude: rto_address.latitude,
            longitude: rto_address.longitude,
            gstNumber: rto_address.gst_number,
          }
        : undefined,
      isPrimary: is_primary,
      isPickupEnabled: is_pickup_enabled,
    }

    // Update pickup address
    const updated = await updatePickupAddressService(pickupId, userId, updatePickupDto)

    if (!updated) {
      return res.status(404).json({
        success: false,
        error: 'Pickup address not found',
        message: 'Pickup address not found or not owned by user',
      })
    }

    // Fetch the updated pickup with address details
    const [pickupAddr] = await db
      .select()
      .from(addresses)
      .where(eq(addresses.id, updated.addressId!))
      .limit(1)

    let rtoAddr = null
    if (updated.rtoAddressId && updated.rtoAddressId !== updated.addressId) {
      const [rto] = await db
        .select()
        .from(addresses)
        .where(eq(addresses.id, updated.rtoAddressId))
        .limit(1)
      rtoAddr = rto
    }

    res.status(200).json({
      success: true,
      message: 'Pickup address updated successfully',
      data: {
        id: updated.id,
        is_primary: updated.isPrimary,
        is_pickup_enabled: updated.isPickupEnabled,
        pickup_address: pickupAddr
          ? {
              name: pickupAddr.contactName,
              phone: pickupAddr.contactPhone,
              email: pickupAddr.contactEmail,
              address_line_1: pickupAddr.addressLine1,
              address_line_2: pickupAddr.addressLine2,
              city: pickupAddr.city,
              state: pickupAddr.state,
              pincode: pickupAddr.pincode,
              country: pickupAddr.country,
            }
          : null,
        rto_address: rtoAddr
          ? {
              name: rtoAddr.contactName,
              phone: rtoAddr.contactPhone,
              email: rtoAddr.contactEmail,
              address_line_1: rtoAddr.addressLine1,
              address_line_2: rtoAddr.addressLine2,
              city: rtoAddr.city,
              state: rtoAddr.state,
              pincode: rtoAddr.pincode,
              country: rtoAddr.country,
            }
          : null,
        created_at: pickupAddr?.createdAt?.toISOString() || new Date().toISOString(),
        updated_at: pickupAddr?.updatedAt?.toISOString() || new Date().toISOString(),
      },
    })
  } catch (error: any) {
    console.error('Error updating pickup address via API:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to update pickup address',
      message: error.message || 'Internal server error',
    })
  }
}

/**
 * Request pickup for orders
 * POST /api/v1/pickup-addresses/request-pickup
 */
export const requestPickupController = async (req: any, res: Response) => {
  try {
    const userId = req.userId
    const { awbs, order_numbers, pickup_date, pickup_time, pickup_address_id } = req.body

    // Validate input
    if (
      (!awbs || !Array.isArray(awbs) || awbs.length === 0) &&
      (!order_numbers || !Array.isArray(order_numbers) || order_numbers.length === 0)
    ) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
        message: 'awbs or order_numbers (array) is required',
      })
    }

    const targetAwbs = Array.isArray(awbs)
      ? awbs.map((v: any) => String(v || '').trim()).filter(Boolean)
      : []
    const targetOrderNumbers = Array.isArray(order_numbers)
      ? order_numbers.map((v: any) => String(v || '').trim()).filter(Boolean)
      : []

    const identifiers = targetAwbs.length ? targetAwbs : targetOrderNumbers
    const identifierColumn = targetAwbs.length ? b2c_orders.awb_number : b2c_orders.order_number

    const orders = await db
      .select({
        id: b2c_orders.id,
        user_id: b2c_orders.user_id,
        order_number: b2c_orders.order_number,
        awb_number: b2c_orders.awb_number,
        integration_type: b2c_orders.integration_type,
        pickup_details: b2c_orders.pickup_details,
      })
      .from(b2c_orders)
      .where(and(eq(b2c_orders.user_id, userId), inArray(identifierColumn, identifiers)))

    if (!orders.length) {
      return res.status(404).json({
        success: false,
        error: 'Orders not found',
        message: 'No matching orders found for provided awbs/order_numbers',
      })
    }

    const missingAwb = orders.find((o) => !o.awb_number)
    if (missingAwb) {
      return res.status(400).json({
        success: false,
        error: 'Invalid order',
        message: `Order ${missingAwb.order_number} does not have an AWB yet`,
      })
    }

    const unsupportedOrder = orders.find(
      (o) => String(o.integration_type || '').trim().toLowerCase() !== 'delhivery',
    )
    if (unsupportedOrder) {
      return res.status(400).json({
        success: false,
        error: 'Unsupported provider',
        message: `Order ${unsupportedOrder.order_number} is not configured for Delhivery`,
      })
    }

    let pickupLocation = ''
    if (pickup_address_id) {
      const [pickupAddress] = await db
        .select({
          addressNickname: addresses.addressNickname,
          contactName: addresses.contactName,
        })
        .from(pickupAddresses)
        .innerJoin(addresses, eq(pickupAddresses.addressId, addresses.id))
        .where(and(eq(pickupAddresses.id, String(pickup_address_id)), eq(pickupAddresses.userId, userId)))
        .limit(1)

      if (!pickupAddress) {
        return res.status(404).json({
          success: false,
          error: 'Pickup address not found',
          message: 'pickup_address_id does not exist or is not owned by this user',
        })
      }

      pickupLocation =
        pickupAddress.addressNickname?.trim() || pickupAddress.contactName?.trim() || ''
    } else {
      const details = (orders[0].pickup_details || {}) as Record<string, any>
      pickupLocation = String(details.warehouse_name || '').trim()
    }

    if (!pickupLocation) {
      return res.status(400).json({
        success: false,
        error: 'Missing pickup location',
        message:
          'pickup_location is missing. Provide pickup_address_id or ensure order has pickup_details.warehouse_name',
      })
    }

    const now = new Date()
    const defaultPickupDate = now.toISOString().split('T')[0]
    const oneHourLater = new Date(now.getTime() + 60 * 60 * 1000)
    const defaultPickupTime = oneHourLater.toTimeString().split(' ')[0]

    const delhivery = new DelhiveryService()
    const delhiveryResponse = await delhivery.createPickupRequest({
      pickup_date: String(pickup_date || defaultPickupDate),
      pickup_time: String(pickup_time || defaultPickupTime),
      pickup_location: pickupLocation,
      expected_package_count: orders.length,
    })

    const orderIds = orders.map((o) => o.id)
    if (orderIds.length) {
      await db
        .update(b2c_orders)
        .set({
          order_status: 'pickup_initiated',
          updated_at: new Date(),
        })
        .where(inArray(b2c_orders.id, orderIds))
    }

    res.status(200).json({
      success: true,
      message: 'Pickup request submitted successfully to Delhivery',
      data: {
        requested_awbs: orders.map((o) => o.awb_number).filter(Boolean),
        requested_order_numbers: orders.map((o) => o.order_number).filter(Boolean),
        pickup_date: String(pickup_date || defaultPickupDate),
        pickup_time: String(pickup_time || defaultPickupTime),
        pickup_location: pickupLocation,
        expected_package_count: orders.length,
        status: 'pickup_initiated',
        provider: 'delhivery',
        provider_response: delhiveryResponse,
      },
    })
  } catch (error: any) {
    console.error('Error requesting pickup via API:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to request pickup',
      message: error.message || 'Internal server error',
    })
  }
}

import { Request, Response } from 'express'

import {
  bulkDeletePincodes,
  bulkMovePincodes,
  bulkUpdatePincodeFlags,
  bulkUpsertZoneRates,
  calculateB2BRate,
  createPincode,
  deleteOverheadRule,
  deletePincode,
  deleteZoneToZoneRate,
  importPincodesFromCsv,
  importZoneRatesFromCsv,
  listB2BZones,
  listOverheadRules,
  listPincodes,
  listZoneToZoneRates,
  updatePincode,
  upsertOverheadRule,
  upsertZoneToZoneRate,
} from '../../../models/services/b2bAdmin.service'
import {
  createZone,
  deleteZone,
  getAllZones,
  listAllZoneStates,
  remapZonePincodes,
  updateZone,
} from '../../../models/services/zone.service'

const parseCourierScope = (req: Request) => {
  if (!req) {
    return { courierId: undefined, serviceProvider: undefined }
  }

  const courierIdParam = req.query?.courier_id ?? req.body?.courierId ?? req.body?.courier_id
  const serviceProviderParam =
    req.query?.service_provider ?? req.body?.serviceProvider ?? req.body?.service_provider

  return {
    courierId: courierIdParam != null && courierIdParam !== '' ? Number(courierIdParam) : undefined,
    serviceProvider:
      typeof serviceProviderParam === 'string' && serviceProviderParam.length
        ? serviceProviderParam
        : undefined,
  }
}

const parseBoolean = (value: any): boolean | undefined => {
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value === 'boolean') return value
  const normalized = String(value).toLowerCase()
  if (normalized === 'true') return true
  if (normalized === 'false') return false
  return undefined
}

// -------------------------
// Zones (wrapper around shared service for convenience)
// -------------------------

export const listZonesController = async (req: Request, res: Response) => {
  try {
    const courierIds = req.query.courier_id
      ? String(req.query.courier_id)
          .split(',')
          .map((id) => id.trim())
          .filter(Boolean)
      : undefined

    const zones = await listB2BZones({
      courierIds,
      serviceProvider: (req.query.service_provider as string) ?? undefined,
      includeGlobal: req.query.include_global !== 'false',
    })

    res.json({ success: true, data: zones })
  } catch (error: any) {
    res.status(500).json({ success: false, error: error?.message || 'Failed to fetch zones' })
  }
}

export const createZoneController = async (req: Request, res: Response) => {
  try {
    const zone = await createZone(req.body, 'b2b')
    res.status(201).json({ success: true, data: zone })
  } catch (error: any) {
    res.status(400).json({ success: false, error: error?.message || 'Failed to create zone' })
  }
}

export const remapZonePincodesController = async (req: Request, res: Response) => {
  try {
    await remapZonePincodes(req.params.id)
    res.json({ success: true })
  } catch (error: any) {
    res
      .status(400)
      .json({ success: false, error: error?.message || 'Failed to remap zone pincodes' })
  }
}

export const updateZoneController = async (req: Request, res: Response) => {
  try {
    const zone = await updateZone(req.params.id, req.body)
    res.json({ success: true, data: zone })
  } catch (error: any) {
    res.status(400).json({ success: false, error: error?.message || 'Failed to update zone' })
  }
}

export const deleteZoneController = async (req: Request, res: Response) => {
  try {
    await deleteZone(req.params.id)
    res.json({ success: true })
  } catch (error: any) {
    res.status(400).json({ success: false, error: error?.message || 'Failed to delete zone' })
  }
}

export const legacyGetZonesController = async (req: Request, res: Response) => {
  // small helper to keep backward compatibility for existing UI pieces that rely on /admin/zones
  return getAllZonesController(req, res)
}

const getAllZonesController = async (req: Request, res: Response) => {
  try {
    const { business_type, courier_id } = req.query
    const courierIds = courier_id ? String(courier_id).split(',').filter(Boolean) : null
    const zones = await getAllZones(business_type ? String(business_type) : null, courierIds)
    res.status(200).json(zones)
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Unable to fetch zones' })
  }
}

export const listStatesController = async (_req: Request, res: Response) => {
  try {
    const states = await listAllZoneStates()
    res.json({ success: true, data: states })
  } catch (error: any) {
    res.status(500).json({ success: false, error: error?.message || 'Failed to fetch states' })
  }
}

// -------------------------
// Pincodes
// -------------------------

export const listPincodesController = async (req: Request, res: Response) => {
  try {
    const result = await listPincodes({
      page: req.query.page ? Number(req.query.page) : undefined,
      limit: req.query.limit ? Number(req.query.limit) : undefined,
      zoneId: (req.query.zone_id as string) ?? undefined,
      pincode: (req.query.pincode as string) ?? undefined,
      city: (req.query.city as string) ?? undefined,
      state: (req.query.state as string) ?? undefined,
      includeGlobal: req.query.include_global !== 'false',
      courierScope: parseCourierScope(req),
      isOda: parseBoolean(req.query.is_oda),
      isRemote: parseBoolean(req.query.is_remote),
      isMall: parseBoolean(req.query.is_mall),
      isSez: parseBoolean(req.query.is_sez),
      isAirport: parseBoolean(req.query.is_airport),
      isHighSecurity: parseBoolean(req.query.is_high_security),
      sortBy:
        (req.query.sortBy as 'pincode' | 'city' | 'state' | 'created_at' | undefined) || 'pincode',
      sortOrder: (req.query.sortOrder as 'asc' | 'desc' | undefined) || 'asc',
    })

    res.json({ success: true, data: result.data, pagination: result.pagination })
  } catch (error: any) {
    res.status(500).json({ success: false, error: error?.message || 'Failed to fetch pincodes' })
  }
}

export const createPincodeController = async (req: Request, res: Response) => {
  try {
    const body = req.body
    const record = await createPincode({
      pincode: body.pincode,
      city: body.city,
      state: body.state,
      zoneId: body.zoneId ?? body.zone_id,
      courierScope: parseCourierScope(req),
      flags: {
        isOda: body.isOda ?? body.is_oda,
        isRemote: body.isRemote ?? body.is_remote,
        isMall: body.isMall ?? body.is_mall,
        isSez: body.isSez ?? body.is_sez,
        isAirport: body.isAirport ?? body.is_airport,
        isHighSecurity: body.isHighSecurity ?? body.is_high_security,
      },
    })

    res.status(201).json({ success: true, data: record })
  } catch (error: any) {
    res.status(400).json({ success: false, error: error?.message || 'Failed to create pincode' })
  }
}

export const updatePincodeController = async (req: Request, res: Response) => {
  try {
    // Support both nested flags object and top-level flags
    const flagsFromBody = req.body.flags || {}
    const record = await updatePincode(req.params.id, {
      pincode: req.body.pincode,
      city: req.body.city,
      state: req.body.state,
      zoneId: req.body.zoneId ?? req.body.zone_id,
      courierScope: parseCourierScope(req),
      flags: {
        isOda: flagsFromBody.isOda ?? req.body.isOda ?? req.body.is_oda ?? undefined,
        isRemote: flagsFromBody.isRemote ?? req.body.isRemote ?? req.body.is_remote ?? undefined,
        isMall: flagsFromBody.isMall ?? req.body.isMall ?? req.body.is_mall ?? undefined,
        isSez: flagsFromBody.isSez ?? req.body.isSez ?? req.body.is_sez ?? undefined,
        isAirport:
          flagsFromBody.isAirport ?? req.body.isAirport ?? req.body.is_airport ?? undefined,
        isHighSecurity:
          flagsFromBody.isHighSecurity ??
          req.body.isHighSecurity ??
          req.body.is_high_security ??
          undefined,
      },
    })

    res.json({ success: true, data: record })
  } catch (error: any) {
    res.status(400).json({ success: false, error: error?.message || 'Failed to update pincode' })
  }
}

export const deletePincodeController = async (req: Request, res: Response) => {
  try {
    await deletePincode(req.params.id)
    res.json({ success: true })
  } catch (error: any) {
    res.status(400).json({ success: false, error: error?.message || 'Failed to delete pincode' })
  }
}

export const bulkDeletePincodesController = async (req: Request, res: Response) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids : []
    const result = await bulkDeletePincodes(ids)
    res.json({ success: true, ...result })
  } catch (error: any) {
    res
      .status(400)
      .json({ success: false, error: error?.message || 'Failed to delete selected pincodes' })
  }
}

export const bulkMovePincodesController = async (req: Request, res: Response) => {
  try {
    const ids = Array.isArray(req.body.ids) ? req.body.ids : []
    const targetZoneId = req.body.targetZoneId ?? req.body.zoneId
    if (!targetZoneId) {
      return res.status(400).json({ success: false, error: 'targetZoneId is required' })
    }
    const result = await bulkMovePincodes(ids, targetZoneId)
    res.json({ success: true, ...result })
  } catch (error: any) {
    res
      .status(400)
      .json({ success: false, error: error?.message || 'Failed to move selected pincodes' })
  }
}

export const bulkUpdatePincodeFlagsController = async (req: Request, res: Response) => {
  try {
    const { ids, flags } = req.body
    if (!Array.isArray(ids) || !ids.length) {
      return res.status(400).json({ success: false, error: 'ids array is required' })
    }
    if (!flags || typeof flags !== 'object') {
      return res.status(400).json({ success: false, error: 'flags object is required' })
    }

    const result = await bulkUpdatePincodeFlags(ids, {
      isOda: flags.isOda ?? flags.is_oda,
      isRemote: flags.isRemote ?? flags.is_remote,
      isMall: flags.isMall ?? flags.is_mall,
      isSez: flags.isSez ?? flags.is_sez,
      isAirport: flags.isAirport ?? flags.is_airport,
      isHighSecurity: flags.isHighSecurity ?? flags.is_high_security,
    })

    res.json({ success: true, data: result })
  } catch (error: any) {
    res
      .status(400)
      .json({ success: false, error: error?.message || 'Failed to update pincode flags' })
  }
}

export const importPincodesController = async (req: Request, res: Response) => {
  try {
    if (!req.file?.buffer) {
      return res.status(400).json({ success: false, error: 'CSV file is required' })
    }

    const result = await importPincodesFromCsv(req.file.buffer, {
      courierScope: parseCourierScope(req),
      defaultZoneId: (req.body.defaultZoneId as string) ?? undefined,
      zoneId: (req.body.zoneId as string) ?? (req.query.zoneId as string) ?? undefined,
    })

    res.json({ success: true, ...result })
  } catch (error: any) {
    res.status(400).json({ success: false, error: error?.message || 'Failed to import pincodes' })
  }
}

// -------------------------
// Zone-to-Zone Rates
// -------------------------

export const listZoneRatesController = async (req: Request, res: Response) => {
  try {
    const rates = await listZoneToZoneRates({
      courierScope: parseCourierScope(req),
      originZoneId: (req.query.origin_zone_id as string) ?? undefined,
      destinationZoneId: (req.query.destination_zone_id as string) ?? undefined,
      planId: (req.query.plan_id as string) ?? (req.query.planId as string) ?? undefined,
    })

    res.json({ success: true, data: rates })
  } catch (error: any) {
    res.status(500).json({ success: false, error: error?.message || 'Failed to fetch rates' })
  }
}

export const upsertZoneRateController = async (req: Request, res: Response) => {
  try {
    const body = req.body
    const rate = await upsertZoneToZoneRate({
      id: body.id ?? req.params.id,
      originZoneId: body.originZoneId ?? body.origin_zone_id,
      destinationZoneId: body.destinationZoneId ?? body.destination_zone_id,
      ratePerKg: Number(body.ratePerKg ?? body.rate_per_kg ?? 0),
      courierScope: parseCourierScope(req),
    })

    if (!rate) {
      return res
        .status(500)
        .json({ success: false, error: 'Failed to upsert rate: no record returned' })
    }

    // Update additional fields if provided (volumetric factor only)
    const updateData: any = {}
    if (body.volumetricFactor !== undefined || body.volumetric_factor !== undefined) {
      updateData.volumetric_factor = (body.volumetricFactor ?? body.volumetric_factor).toString()
    }
    if (body.effectiveFrom || body.effective_from) {
      updateData.effective_from = new Date(body.effectiveFrom ?? body.effective_from)
    }
    if (body.effectiveTo || body.effective_to) {
      updateData.effective_to = new Date(body.effectiveTo ?? body.effective_to)
    }
    if (body.isActive !== undefined || body.is_active !== undefined) {
      updateData.is_active = body.isActive ?? body.is_active
    }

    if (Object.keys(updateData).length > 0) {
      updateData.updated_at = new Date()
      const { db } = await import('../../../models/client')
      const { b2bZoneToZoneRates } = await import('../../../models/schema/zones')
      const { eq } = await import('drizzle-orm')
      await db.update(b2bZoneToZoneRates).set(updateData).where(eq(b2bZoneToZoneRates.id, rate.id))
    }

    res.json({ success: true, data: rate })
  } catch (error: any) {
    res.status(400).json({ success: false, error: error?.message || 'Failed to upsert rate' })
  }
}

export const deleteZoneRateController = async (req: Request, res: Response) => {
  try {
    await deleteZoneToZoneRate(req.params.id)
    res.json({ success: true })
  } catch (error: any) {
    res.status(400).json({ success: false, error: error?.message || 'Failed to delete rate' })
  }
}

export const importZoneRatesController = async (req: Request, res: Response) => {
  try {
    if (!req.file?.buffer) {
      return res.status(400).json({ success: false, error: 'CSV file is required' })
    }

    const result = await importZoneRatesFromCsv(req.file.buffer, {
      courierScope: parseCourierScope(req),
    })

    res.json({ success: true, ...result })
  } catch (error: any) {
    res.status(400).json({ success: false, error: error?.message || 'Failed to import rates' })
  }
}

// -------------------------
// Overheads
// -------------------------

export const listOverheadsController = async (req: Request, res: Response) => {
  try {
    const rules = await listOverheadRules({
      courierScope: parseCourierScope(req),
      includeGlobal: req.query.include_global !== 'false',
      onlyActive: req.query.only_active === 'true',
      planId: (req.query.plan_id as string) ?? (req.query.planId as string) ?? undefined,
    })

    res.json({ success: true, data: rules })
  } catch (error: any) {
    res.status(500).json({ success: false, error: error?.message || 'Failed to fetch overheads' })
  }
}

export const upsertOverheadController = async (req: Request, res: Response) => {
  try {
    const rule = await upsertOverheadRule({
      id: req.body.id,
      code: req.body.code,
      name: req.body.name,
      description: req.body.description,
      type: req.body.type,
      amount: req.body.amount ? Number(req.body.amount) : undefined,
      percent: req.body.percent ? Number(req.body.percent) : undefined,
      appliesTo: req.body.appliesTo ?? req.body.applies_to,
      condition: req.body.condition,
      priority: req.body.priority ? Number(req.body.priority) : undefined,
      effectiveFrom: req.body.effectiveFrom ? new Date(req.body.effectiveFrom) : undefined,
      effectiveTo: req.body.effectiveTo ? new Date(req.body.effectiveTo) : undefined,
      isActive: req.body.isActive ?? req.body.is_active,
      courierScope: parseCourierScope(req),
      planId: (req.body.plan_id as string) ?? (req.body.planId as string) ?? undefined,
    })

    res.json({ success: true, data: rule })
  } catch (error: any) {
    res
      .status(400)
      .json({ success: false, error: error?.message || 'Failed to save overhead rule' })
  }
}

export const deleteOverheadController = async (req: Request, res: Response) => {
  try {
    await deleteOverheadRule(req.params.id)
    res.json({ success: true })
  } catch (error: any) {
    res
      .status(400)
      .json({ success: false, error: error?.message || 'Failed to delete overhead rule' })
  }
}

// -------------------------
// Rate calculator
// -------------------------

export const calculateRateController = async (req: Request, res: Response) => {
  try {
    const result = await calculateB2BRate({
      originPincode: req.body.originPincode ?? req.body.origin_pincode ?? req.body.origin,
      destinationPincode:
        req.body.destinationPincode ?? req.body.destination_pincode ?? req.body.destination,
      weightKg: Number(req.body.weightKg ?? req.body.weight ?? 0),
      length: req.body.length ? Number(req.body.length) : undefined,
      width: req.body.width ? Number(req.body.width) : undefined,
      height: req.body.height ? Number(req.body.height) : undefined,
      invoiceValue: req.body.invoiceValue ?? req.body.invoice_value,
      paymentMode: (req.body.paymentMode ?? req.body.payment_mode ?? 'PREPAID').toUpperCase(),
      courierScope: parseCourierScope(req),
      effectiveDate: req.body.effectiveDate ? new Date(req.body.effectiveDate) : undefined,
      isSinglePiece: req.body.isSinglePiece ?? req.body.is_single_piece ?? undefined,
      pieceCount: req.body.pieceCount ?? req.body.piece_count ?? undefined,
      // Optional: Provide orderId or awbNumber to fetch tracking events for demurrage calculation
      orderId: req.body.orderId ?? req.body.order_id ?? undefined,
      awbNumber: req.body.awbNumber ?? req.body.awb_number ?? req.body.awb ?? undefined,
      // Optional: Or provide tracking events directly
      trackingEvents: req.body.trackingEvents ?? req.body.tracking_events ?? undefined,
      // Optional: Pickup date for holiday charge calculation
      pickupDate: req.body.pickupDate ?? req.body.pickup_date ?? undefined,
      // Optional: Delivery time window for time-specific delivery charge (e.g., "11AM", "9AM-11AM", "before 11AM")
      deliveryTime: req.body.deliveryTime ?? req.body.delivery_time ?? undefined,
      // Optional: Delivery address - used to detect CSD locations via keywords
      deliveryAddress:
        req.body.deliveryAddress ?? req.body.delivery_address ?? req.body.address ?? undefined,
      // Optional: Plan ID to fetch plan-specific additional charges
      planId: req.body.planId ?? req.body.plan_id ?? undefined,
    })

    res.json({ success: true, data: result })
  } catch (error: any) {
    res.status(400).json({ success: false, error: error?.message || 'Failed to calculate rate' })
  }
}

// -------------------------
// Bulk Zone Rate Operations
// -------------------------

export const bulkUpsertZoneRatesController = async (req: Request, res: Response) => {
  try {
    const rates = Array.isArray(req.body.rates) ? req.body.rates : []
    if (!rates.length) {
      return res.status(400).json({ success: false, error: 'Rates array is required' })
    }

    const results = await bulkUpsertZoneRates(rates, parseCourierScope(req))
    res.json({ success: true, data: results })
  } catch (error: any) {
    res.status(400).json({ success: false, error: error?.message || 'Failed to bulk upsert rates' })
  }
}

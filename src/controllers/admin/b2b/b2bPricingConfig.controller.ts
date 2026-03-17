import { Request, Response } from 'express'
import {
  bulkCreateZoneStates,
  createZoneState,
  deleteZoneState,
  getAdditionalCharges,
  getVolumetricRules,
  importAdditionalChargesFromCsv,
  listZoneStates,
  seedDefaultAdditionalCharges,
  upsertAdditionalCharges,
  upsertVolumetricRules,
} from '../../../models/services/b2bPricingConfig.service'

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

// -------------------------
// Zone States
// -------------------------

export const listZoneStatesController = async (req: Request, res: Response) => {
  try {
    const states = await listZoneStates({
      zoneId: (req.query.zone_id as string) ?? undefined,
      stateName: (req.query.state_name as string) ?? undefined,
      courierScope: parseCourierScope(req),
      includeGlobal: req.query.include_global !== 'false',
    })

    res.json({ success: true, data: states })
  } catch (error: any) {
    res.status(500).json({ success: false, error: error?.message || 'Failed to fetch zone states' })
  }
}

export const createZoneStateController = async (req: Request, res: Response) => {
  try {
    const state = await createZoneState({
      zoneId: req.body.zoneId ?? req.body.zone_id,
      stateName: req.body.stateName ?? req.body.state_name,
      courierScope: parseCourierScope(req),
    })

    res.status(201).json({ success: true, data: state })
  } catch (error: any) {
    res.status(400).json({ success: false, error: error?.message || 'Failed to create zone state' })
  }
}

export const bulkCreateZoneStatesController = async (req: Request, res: Response) => {
  try {
    const zoneId = req.body.zoneId ?? req.body.zone_id
    const stateNames = Array.isArray(req.body.stateNames ?? req.body.state_names)
      ? req.body.stateNames ?? req.body.state_names
      : []

    if (!zoneId || !stateNames.length) {
      return res.status(400).json({ success: false, error: 'zoneId and stateNames are required' })
    }

    const states = await bulkCreateZoneStates(zoneId, stateNames, parseCourierScope(req))

    res.status(201).json({ success: true, data: states })
  } catch (error: any) {
    res
      .status(400)
      .json({ success: false, error: error?.message || 'Failed to create zone states' })
  }
}

export const deleteZoneStateController = async (req: Request, res: Response) => {
  try {
    await deleteZoneState(req.params.id)
    res.json({ success: true })
  } catch (error: any) {
    res.status(400).json({ success: false, error: error?.message || 'Failed to delete zone state' })
  }
}

// -------------------------
// Additional Charges
// -------------------------

export const getAdditionalChargesController = async (req: Request, res: Response) => {
  try {
    const planId = (req.query.plan_id as string) ?? (req.query.planId as string) ?? undefined
    let charges = await getAdditionalCharges({
      courierScope: parseCourierScope(req),
      includeGlobal: req.query.include_global !== 'false',
      planId,
    })

    // If no charges exist, seed default values
    if (!charges) {
      charges = await seedDefaultAdditionalCharges({
        courierScope: parseCourierScope(req),
        planId,
      })
    }

    res.json({ success: true, data: charges })
  } catch (error: any) {
    res
      .status(500)
      .json({ success: false, error: error?.message || 'Failed to fetch additional charges' })
  }
}

export const upsertAdditionalChargesController = async (req: Request, res: Response) => {
  try {
    const charges = await upsertAdditionalCharges({
      // Exact 20 overhead charge fields
      awbCharges: req.body.awbCharges ?? req.body.awb_charges,
      cftFactor: req.body.cftFactor ?? req.body.cft_factor,
      minimumChargeableAmount:
        req.body.minimumChargeableAmount ?? req.body.minimum_chargeable_amount,
      minimumChargeableWeight:
        req.body.minimumChargeableWeight ?? req.body.minimum_chargeable_weight,
      minimumChargeableMethod:
        req.body.minimumChargeableMethod ??
        req.body.minimum_chargeable_method ??
        'whichever_is_higher',
      freeStorageDays: req.body.freeStorageDays ?? req.body.free_storage_days,
      demurragePerAwbDay: req.body.demurragePerAwbDay ?? req.body.demurrage_per_awb_day,
      demurragePerKgDay: req.body.demurragePerKgDay ?? req.body.demurrage_per_kg_day,
      demurrageMethod:
        req.body.demurrageMethod ?? req.body.demurrage_method ?? 'whichever_is_higher',
      publicHolidayPickupCharge:
        req.body.publicHolidayPickupCharge ?? req.body.public_holiday_pickup_charge,
      fuelSurchargePercentage:
        req.body.fuelSurchargePercentage ?? req.body.fuel_surcharge_percentage,
      greenTax: req.body.greenTax ?? req.body.green_tax,
      odaCharges: req.body.odaCharges ?? req.body.oda_charges,
      odaPerKgCharge: req.body.odaPerKgCharge ?? req.body.oda_per_kg_charge,
      odaMethod: req.body.odaMethod ?? req.body.oda_method ?? 'whichever_is_higher',
      csdDeliveryCharge: req.body.csdDeliveryCharge ?? req.body.csd_delivery_charge,
      timeSpecificPerKg: req.body.timeSpecificPerKg ?? req.body.time_specific_per_kg,
      timeSpecificPerAwb: req.body.timeSpecificPerAwb ?? req.body.time_specific_per_awb ?? 500,
      timeSpecificMethod:
        req.body.timeSpecificMethod ?? req.body.time_specific_method ?? 'whichever_is_higher',
      mallDeliveryPerKg: req.body.mallDeliveryPerKg ?? req.body.mall_delivery_per_kg,
      mallDeliveryPerAwb: req.body.mallDeliveryPerAwb ?? req.body.mall_delivery_per_awb ?? 500,
      mallDeliveryMethod:
        req.body.mallDeliveryMethod ?? req.body.mall_delivery_method ?? 'whichever_is_higher',
      deliveryReattemptPerKg: req.body.deliveryReattemptPerKg ?? req.body.delivery_reattempt_per_kg,
      deliveryReattemptPerAwb:
        req.body.deliveryReattemptPerAwb ?? req.body.delivery_reattempt_per_awb ?? 500,
      deliveryReattemptMethod:
        req.body.deliveryReattemptMethod ??
        req.body.delivery_reattempt_method ??
        'whichever_is_higher',
      handlingSinglePiece: req.body.handlingSinglePiece ?? req.body.handling_single_piece,
      handlingBelow100Kg: req.body.handlingBelow100Kg ?? req.body.handling_below_100_kg,
      handling100To200Kg: req.body.handling100To200Kg ?? req.body.handling_100_to_200_kg,
      handlingAbove200Kg: req.body.handlingAbove200Kg ?? req.body.handling_above_200_kg,
      insuranceCharge: req.body.insuranceCharge ?? req.body.insurance_charge,
      codFixedAmount: req.body.codFixedAmount ?? req.body.cod_fixed_amount ?? 50,
      codPercentage: req.body.codPercentage ?? req.body.cod_percentage ?? 1,
      codMethod: req.body.codMethod ?? req.body.cod_method ?? 'whichever_is_higher',
      rovFixedAmount: req.body.rovFixedAmount ?? req.body.rov_fixed_amount ?? 100,
      rovPercentage: req.body.rovPercentage ?? req.body.rov_percentage ?? 0.5,
      rovMethod: req.body.rovMethod ?? req.body.rov_method ?? 'whichever_is_higher',
      liabilityLimit: req.body.liabilityLimit ?? req.body.liability_limit ?? 5000,
      liabilityMethod:
        req.body.liabilityMethod ?? req.body.liability_method ?? 'whichever_is_lower',
      customFields: req.body.customFields ?? req.body.custom_fields,
      fieldDefinitions: req.body.fieldDefinitions ?? req.body.field_definitions,
      planId: (req.body.plan_id as string) ?? (req.body.planId as string) ?? undefined,
      courierScope: parseCourierScope(req),
    })

    res.json({ success: true, data: charges })
  } catch (error: any) {
    res
      .status(400)
      .json({ success: false, error: error?.message || 'Failed to save overhead charges' })
  }
}

export const importAdditionalChargesController = async (req: Request, res: Response) => {
  try {
    if (!req.file?.buffer) {
      return res.status(400).json({ success: false, error: 'CSV file is required' })
    }

    const courierId = req.body.courier_id
      ? Number(req.body.courier_id)
      : req.body.courierId
      ? Number(req.body.courierId)
      : undefined
    const serviceProvider = req.body.service_provider || req.body.serviceProvider || undefined
    const planId = req.body.plan_id || req.body.planId || undefined

    const result = await importAdditionalChargesFromCsv(req.file.buffer, {
      courierScope: {
        courierId: courierId ?? null,
        serviceProvider: serviceProvider ?? null,
      },
      planId,
    })

    res.json({
      success: true,
      message: `Imported ${result.inserted} new records, updated ${result.updated} existing records`,
      ...result,
    })
  } catch (error: any) {
    console.error('Error importing additional charges:', error)
    res.status(400).json({
      success: false,
      error: error?.message || 'Failed to import additional charges',
    })
  }
}

// -------------------------
// Volumetric Rules
// -------------------------

export const getVolumetricRulesController = async (req: Request, res: Response) => {
  try {
    const rules = await getVolumetricRules({
      courierScope: parseCourierScope(req),
      includeGlobal: req.query.include_global !== 'false',
    })

    res.json({ success: true, data: rules })
  } catch (error: any) {
    res
      .status(500)
      .json({ success: false, error: error?.message || 'Failed to fetch volumetric rules' })
  }
}

export const upsertVolumetricRulesController = async (req: Request, res: Response) => {
  try {
    const rules = await upsertVolumetricRules({
      volumetricDivisor: req.body.volumetricDivisor ?? req.body.volumetric_divisor,
      cftFactor: req.body.cftFactor ?? req.body.cft_factor,
      minimumVolumetricWeight:
        req.body.minimumVolumetricWeight ?? req.body.minimum_volumetric_weight,
      courierScope: parseCourierScope(req),
    })

    res.json({ success: true, data: rules })
  } catch (error: any) {
    res
      .status(400)
      .json({ success: false, error: error?.message || 'Failed to save volumetric rules' })
  }
}

import { and, eq, isNull, or, SQLWrapper } from 'drizzle-orm'
import Papa from 'papaparse'
import { db } from '../client'
import { b2bAdditionalCharges, b2bVolumetricRules, b2bZoneStates } from '../schema/zones'

type CourierScope = {
  courierId?: number | null
  serviceProvider?: string | null
}

const normalizeCourierScope = (scope?: CourierScope) => {
  if (!scope || typeof scope !== 'object') {
    return { courierId: null, serviceProvider: null }
  }
  const courierId = scope.courierId != null ? Number(scope.courierId) : null
  const serviceProvider = scope.serviceProvider ?? null
  return { courierId, serviceProvider }
}

// -----------------------------
// Zone States Management
// -----------------------------

export const listZoneStates = async (params: {
  zoneId?: string
  stateName?: string
  courierScope?: CourierScope
  includeGlobal?: boolean
}) => {
  const { courierId, serviceProvider } = normalizeCourierScope(params.courierScope)
  const includeGlobal = params.includeGlobal ?? true

  const filters: SQLWrapper[] = []

  if (params.zoneId) {
    filters.push(eq(b2bZoneStates.zone_id, params.zoneId) as SQLWrapper)
  }
  if (params.stateName) {
    filters.push(eq(b2bZoneStates.state_name, params.stateName) as SQLWrapper)
  }

  if (courierId || serviceProvider) {
    const courierCondition = courierId
      ? (eq(b2bZoneStates.courier_id, courierId) as SQLWrapper)
      : undefined
    const providerCondition = serviceProvider
      ? (eq(b2bZoneStates.service_provider, serviceProvider) as SQLWrapper)
      : undefined
    const scopedCondition: SQLWrapper | undefined = courierCondition
      ? providerCondition
        ? (and(courierCondition, providerCondition) as SQLWrapper)
        : courierCondition
      : providerCondition

    if (scopedCondition) {
      const combinedFilter = includeGlobal
        ? (or(isNull(b2bZoneStates.courier_id), scopedCondition) as SQLWrapper)
        : scopedCondition
      filters.push(combinedFilter)
    } else if (!includeGlobal) {
      filters.push(isNull(b2bZoneStates.courier_id) as SQLWrapper)
    }
  } else if (!includeGlobal) {
    filters.push(isNull(b2bZoneStates.courier_id) as SQLWrapper)
  }

  const condition = filters.length ? and(...filters) : undefined

  const states = await db.select().from(b2bZoneStates).where(condition)

  return states
}

export const createZoneState = async (payload: {
  zoneId: string
  stateName: string
  courierScope?: CourierScope
}) => {
  const { courierId, serviceProvider } = normalizeCourierScope(payload.courierScope)

  const [record] = await db
    .insert(b2bZoneStates)
    .values({
      zone_id: payload.zoneId,
      state_name: payload.stateName.trim(),
      courier_id: courierId,
      service_provider: serviceProvider,
    })
    .returning()

  return record
}

export const deleteZoneState = async (id: string) => {
  await db.delete(b2bZoneStates).where(eq(b2bZoneStates.id, id))
}

export const bulkCreateZoneStates = async (
  zoneId: string,
  stateNames: string[],
  courierScope?: CourierScope,
) => {
  const { courierId, serviceProvider } = normalizeCourierScope(courierScope)

  const records = await db
    .insert(b2bZoneStates)
    .values(
      stateNames.map((state) => ({
        zone_id: zoneId,
        state_name: state.trim(),
        courier_id: courierId,
        service_provider: serviceProvider,
      })),
    )
    .onConflictDoNothing({
      target: [
        b2bZoneStates.zone_id,
        b2bZoneStates.state_name,
        b2bZoneStates.courier_id,
        b2bZoneStates.service_provider,
      ],
    })
    .returning()

  return records
}

// -----------------------------
// Additional Charges Management
// -----------------------------

export const getAdditionalCharges = async (params: {
  courierScope?: CourierScope
  includeGlobal?: boolean
  planId?: string
}) => {
  const { courierId, serviceProvider } = normalizeCourierScope(params.courierScope)
  const includeGlobal = params.includeGlobal ?? true

  // Try to find plan-specific first, then courier-specific, then global
  const scopes: (CourierScope | null)[] = [
    { courierId: courierId ?? undefined, serviceProvider: serviceProvider ?? undefined },
    { courierId: undefined, serviceProvider: serviceProvider ?? undefined },
    null,
  ]

  for (const scope of scopes) {
    const { courierId: cId, serviceProvider: sProvider } = normalizeCourierScope(scope ?? undefined)

    const conditions: any[] = []
    if (cId) {
      conditions.push(eq(b2bAdditionalCharges.courier_id, cId))
    } else {
      conditions.push(isNull(b2bAdditionalCharges.courier_id))
    }
    if (sProvider) {
      conditions.push(eq(b2bAdditionalCharges.service_provider, sProvider))
    } else {
      conditions.push(isNull(b2bAdditionalCharges.service_provider))
    }

    // Add plan_id filter
    if (params.planId) {
      conditions.push(eq(b2bAdditionalCharges.plan_id, params.planId))
    } else {
      conditions.push(isNull(b2bAdditionalCharges.plan_id))
    }

    const [charges] = await db
      .select()
      .from(b2bAdditionalCharges)
      .where(and(...conditions))
      .limit(1)

    if (charges) return charges
  }

  // Return null if nothing found - frontend will handle empty form
  // This allows admin to configure charges from scratch
  return null
}

// Seed default additional charges if none exist
export const seedDefaultAdditionalCharges = async (params: {
  courierScope?: CourierScope
  planId?: string
}) => {
  const { courierId, serviceProvider } = normalizeCourierScope(params.courierScope)

  // Check if charges already exist
  const existing = await getAdditionalCharges({
    courierScope: { courierId, serviceProvider },
    planId: params.planId,
  })

  if (existing) {
    return existing // Return existing if already seeded
  }

  // Default values for B2B overhead charges (with dual-value fields and methods)
  const defaultCharges = {
    awb_charges: '0',
    cft_factor: '5',
    minimum_chargeable_amount: '0',
    minimum_chargeable_weight: '0',
    minimum_chargeable_method: 'whichever_is_higher',
    free_storage_days: 5,
    demurrage_per_awb_day: '0',
    demurrage_per_kg_day: '0',
    demurrage_method: 'whichever_is_higher',
    public_holiday_pickup_charge: '0',
    fuel_surcharge_percentage: '0',
    green_tax: '0',
    oda_charges: '0',
    oda_per_kg_charge: '0',
    oda_method: 'whichever_is_higher',
    csd_delivery_charge: '0',
    time_specific_per_kg: '0',
    time_specific_per_awb: '500',
    time_specific_method: 'whichever_is_higher',
    mall_delivery_per_kg: '0',
    mall_delivery_per_awb: '500',
    mall_delivery_method: 'whichever_is_higher',
    delivery_reattempt_per_kg: '0',
    delivery_reattempt_per_awb: '500',
    delivery_reattempt_method: 'whichever_is_higher',
    handling_single_piece: '0',
    handling_below_100_kg: '0',
    handling_100_to_200_kg: '0',
    handling_above_200_kg: '0',
    insurance_charge: '0',
    cod_fixed_amount: '50',
    cod_percentage: '1',
    cod_method: 'whichever_is_higher',
    rov_fixed_amount: '100',
    rov_percentage: '0.5',
    rov_method: 'whichever_is_higher',
    liability_limit: '5000',
    liability_method: 'whichever_is_lower',
  }

  const [created] = await db
    .insert(b2bAdditionalCharges)
    .values({
      ...defaultCharges,
      courier_id: courierId,
      service_provider: serviceProvider,
      plan_id: params.planId ?? null,
    })
    .returning()

  return created
}

export const upsertAdditionalCharges = async (
  payload: Partial<{
    // Overhead charge fields (with dual-value fields)
    awbCharges: number
    cftFactor: number
    minimumChargeableAmount: number
    minimumChargeableWeight: number
    minimumChargeableMethod: 'whichever_is_higher' | 'whichever_is_lower'
    freeStorageDays: number
    demurragePerAwbDay: number
    demurragePerKgDay: number
    demurrageMethod: 'whichever_is_higher' | 'whichever_is_lower'
    publicHolidayPickupCharge: number
    fuelSurchargePercentage: number
    greenTax: number
    odaCharges: number
    odaPerKgCharge: number
    odaMethod: 'whichever_is_higher' | 'whichever_is_lower'
    csdDeliveryCharge: number
    timeSpecificPerKg: number
    timeSpecificPerAwb: number
    timeSpecificMethod: 'whichever_is_higher' | 'whichever_is_lower'
    mallDeliveryPerKg: number
    mallDeliveryPerAwb: number
    mallDeliveryMethod: 'whichever_is_higher' | 'whichever_is_lower'
    deliveryReattemptPerKg: number
    deliveryReattemptPerAwb: number
    deliveryReattemptMethod: 'whichever_is_higher' | 'whichever_is_lower'
    handlingSinglePiece: number
    handlingBelow100Kg: number
    handling100To200Kg: number
    handlingAbove200Kg: number
    insuranceCharge: number
    codFixedAmount: number
    codPercentage: number
    codMethod: 'whichever_is_higher' | 'whichever_is_lower'
    rovFixedAmount: number
    rovPercentage: number
    rovMethod: 'whichever_is_higher' | 'whichever_is_lower'
    liabilityLimit: number
    liabilityMethod: 'whichever_is_higher' | 'whichever_is_lower'
    customFields?: Record<string, any> // Admin-defined custom fields
    fieldDefinitions?: Record<
      string,
      {
        label: string
        visible: boolean
        group?: string
        order?: number
        description?: string
        unit?: string
      }
    > // Admin-configured field labels and visibility
    planId?: string
  }> & { courierScope?: CourierScope },
) => {
  const { courierId, serviceProvider } = normalizeCourierScope(payload.courierScope)

  const updateData: any = {
    updated_at: new Date(),
  }

  // Map all overhead charge fields (with dual-value fields)
  if (payload.awbCharges !== undefined) updateData.awb_charges = payload.awbCharges.toString()
  if (payload.cftFactor !== undefined) updateData.cft_factor = payload.cftFactor.toString()
  if (payload.minimumChargeableAmount !== undefined)
    updateData.minimum_chargeable_amount = payload.minimumChargeableAmount.toString()
  if (payload.minimumChargeableWeight !== undefined)
    updateData.minimum_chargeable_weight = payload.minimumChargeableWeight.toString()
  if (payload.minimumChargeableMethod !== undefined)
    updateData.minimum_chargeable_method = payload.minimumChargeableMethod
  if (payload.freeStorageDays !== undefined) updateData.free_storage_days = payload.freeStorageDays
  if (payload.demurragePerAwbDay !== undefined)
    updateData.demurrage_per_awb_day = payload.demurragePerAwbDay.toString()
  if (payload.demurragePerKgDay !== undefined)
    updateData.demurrage_per_kg_day = payload.demurragePerKgDay.toString()
  if (payload.demurrageMethod !== undefined) updateData.demurrage_method = payload.demurrageMethod
  if (payload.publicHolidayPickupCharge !== undefined)
    updateData.public_holiday_pickup_charge = payload.publicHolidayPickupCharge.toString()
  if (payload.fuelSurchargePercentage !== undefined)
    updateData.fuel_surcharge_percentage = payload.fuelSurchargePercentage.toString()
  if (payload.greenTax !== undefined) updateData.green_tax = payload.greenTax.toString()
  if (payload.odaCharges !== undefined) updateData.oda_charges = payload.odaCharges.toString()
  if (payload.odaPerKgCharge !== undefined)
    updateData.oda_per_kg_charge = payload.odaPerKgCharge.toString()
  if (payload.odaMethod !== undefined) updateData.oda_method = payload.odaMethod
  if (payload.csdDeliveryCharge !== undefined)
    updateData.csd_delivery_charge = payload.csdDeliveryCharge.toString()
  if (payload.timeSpecificPerKg !== undefined)
    updateData.time_specific_per_kg = payload.timeSpecificPerKg.toString()
  if (payload.timeSpecificPerAwb !== undefined)
    updateData.time_specific_per_awb = payload.timeSpecificPerAwb.toString()
  if (payload.timeSpecificMethod !== undefined)
    updateData.time_specific_method = payload.timeSpecificMethod
  if (payload.mallDeliveryPerKg !== undefined)
    updateData.mall_delivery_per_kg = payload.mallDeliveryPerKg.toString()
  if (payload.mallDeliveryPerAwb !== undefined)
    updateData.mall_delivery_per_awb = payload.mallDeliveryPerAwb.toString()
  if (payload.mallDeliveryMethod !== undefined)
    updateData.mall_delivery_method = payload.mallDeliveryMethod
  if (payload.deliveryReattemptPerKg !== undefined)
    updateData.delivery_reattempt_per_kg = payload.deliveryReattemptPerKg.toString()
  if (payload.deliveryReattemptPerAwb !== undefined)
    updateData.delivery_reattempt_per_awb = payload.deliveryReattemptPerAwb.toString()
  if (payload.deliveryReattemptMethod !== undefined)
    updateData.delivery_reattempt_method = payload.deliveryReattemptMethod
  if (payload.handlingSinglePiece !== undefined)
    updateData.handling_single_piece = payload.handlingSinglePiece.toString()
  if (payload.handlingBelow100Kg !== undefined)
    updateData.handling_below_100_kg = payload.handlingBelow100Kg.toString()
  if (payload.handling100To200Kg !== undefined)
    updateData.handling_100_to_200_kg = payload.handling100To200Kg.toString()
  if (payload.handlingAbove200Kg !== undefined)
    updateData.handling_above_200_kg = payload.handlingAbove200Kg.toString()
  if (payload.insuranceCharge !== undefined)
    updateData.insurance_charge = payload.insuranceCharge.toString()
  if (payload.codFixedAmount !== undefined)
    updateData.cod_fixed_amount = payload.codFixedAmount.toString()
  if (payload.codPercentage !== undefined)
    updateData.cod_percentage = payload.codPercentage.toString()
  if (payload.codMethod !== undefined) updateData.cod_method = payload.codMethod
  if (payload.rovFixedAmount !== undefined)
    updateData.rov_fixed_amount = payload.rovFixedAmount.toString()
  if (payload.rovPercentage !== undefined)
    updateData.rov_percentage = payload.rovPercentage.toString()
  if (payload.rovMethod !== undefined) updateData.rov_method = payload.rovMethod
  if (payload.liabilityLimit !== undefined)
    updateData.liability_limit = payload.liabilityLimit.toString()
  if (payload.liabilityMethod !== undefined) updateData.liability_method = payload.liabilityMethod
  if (payload.customFields !== undefined) updateData.custom_fields = payload.customFields
  if (payload.fieldDefinitions !== undefined)
    updateData.field_definitions = payload.fieldDefinitions

  // Check if record exists (considering plan_id if provided)
  const conditions: any[] = []
  if (courierId) {
    conditions.push(eq(b2bAdditionalCharges.courier_id, courierId))
  } else {
    conditions.push(isNull(b2bAdditionalCharges.courier_id))
  }
  if (serviceProvider) {
    conditions.push(eq(b2bAdditionalCharges.service_provider, serviceProvider))
  } else {
    conditions.push(isNull(b2bAdditionalCharges.service_provider))
  }
  if (payload.planId) {
    conditions.push(eq(b2bAdditionalCharges.plan_id, payload.planId))
  } else {
    conditions.push(isNull(b2bAdditionalCharges.plan_id))
  }

  const [existing] = await db
    .select()
    .from(b2bAdditionalCharges)
    .where(and(...conditions))
    .limit(1)

  if (existing) {
    const [updated] = await db
      .update(b2bAdditionalCharges)
      .set(updateData)
      .where(eq(b2bAdditionalCharges.id, existing.id))
      .returning()
    return updated
  }

  const [created] = await db
    .insert(b2bAdditionalCharges)
    .values({
      ...updateData,
      courier_id: courierId,
      service_provider: serviceProvider,
      plan_id: payload.planId ?? null,
    })
    .returning()

  return created
}

// -----------------------------
// CSV Import for Additional Charges
// -----------------------------

type AdditionalChargesCsvRecord = {
  courier_id?: string
  service_provider?: string
  plan_id?: string
  awb_charges?: string
  cft_factor?: string
  minimum_chargeable_amount?: string
  minimum_chargeable_weight?: string
  minimum_chargeable_method?: string
  free_storage_days?: string
  demurrage_per_awb_day?: string
  demurrage_per_kg_day?: string
  demurrage_method?: string
  public_holiday_pickup_charge?: string
  fuel_surcharge_percentage?: string
  green_tax?: string
  oda_charges?: string
  oda_per_kg_charge?: string
  oda_method?: string
  csd_delivery_charge?: string
  time_specific_per_kg?: string
  time_specific_per_awb?: string
  time_specific_method?: string
  mall_delivery_per_kg?: string
  mall_delivery_per_awb?: string
  mall_delivery_method?: string
  delivery_reattempt_per_kg?: string
  delivery_reattempt_per_awb?: string
  delivery_reattempt_method?: string
  handling_single_piece?: string
  handling_below_100_kg?: string
  handling_100_to_200_kg?: string
  handling_above_200_kg?: string
  insurance_charge?: string
  cod_fixed_amount?: string
  cod_percentage?: string
  cod_method?: string
  rov_fixed_amount?: string
  rov_percentage?: string
  rov_method?: string
  liability_limit?: string
  liability_method?: string
}

export const importAdditionalChargesFromCsv = async (
  fileBuffer: Buffer,
  options: {
    courierScope?: CourierScope
    planId?: string
  },
) => {
  const csv = fileBuffer.toString('utf8')
  const parsed = Papa.parse<AdditionalChargesCsvRecord>(csv, {
    header: true,
    skipEmptyLines: true,
  })

  if (parsed.errors?.length) {
    throw new Error(`CSV parse error: ${parsed.errors[0].message}`)
  }

  const rows = parsed.data.filter((row) => {
    // At least courier_id or service_provider should be present
    return row.courier_id || row.service_provider
  })

  let inserted = 0
  let updated = 0
  const skipped: any[] = []

  for (const row of rows) {
    try {
      // Use CSV values if provided, otherwise fall back to options
      const courierId = row.courier_id
        ? Number(row.courier_id)
        : options.courierScope?.courierId ?? null
      const serviceProvider = row.service_provider || options.courierScope?.serviceProvider || null
      const planId = row.plan_id || options.planId || null

      // Build payload from CSV row
      const payload: any = {
        planId: planId || undefined,
        awbCharges: row.awb_charges ? Number(row.awb_charges) : undefined,
        cftFactor: row.cft_factor ? Number(row.cft_factor) : undefined,
        minimumChargeableAmount: row.minimum_chargeable_amount
          ? Number(row.minimum_chargeable_amount)
          : undefined,
        minimumChargeableWeight: row.minimum_chargeable_weight
          ? Number(row.minimum_chargeable_weight)
          : undefined,
        minimumChargeableMethod: row.minimum_chargeable_method || undefined,
        freeStorageDays: row.free_storage_days ? Number(row.free_storage_days) : undefined,
        demurragePerAwbDay: row.demurrage_per_awb_day
          ? Number(row.demurrage_per_awb_day)
          : undefined,
        demurragePerKgDay: row.demurrage_per_kg_day ? Number(row.demurrage_per_kg_day) : undefined,
        demurrageMethod: row.demurrage_method || undefined,
        publicHolidayPickupCharge: row.public_holiday_pickup_charge
          ? Number(row.public_holiday_pickup_charge)
          : undefined,
        fuelSurchargePercentage: row.fuel_surcharge_percentage
          ? Number(row.fuel_surcharge_percentage)
          : undefined,
        greenTax: row.green_tax ? Number(row.green_tax) : undefined,
        odaCharges: row.oda_charges ? Number(row.oda_charges) : undefined,
        odaPerKgCharge: row.oda_per_kg_charge ? Number(row.oda_per_kg_charge) : undefined,
        odaMethod: row.oda_method || undefined,
        csdDeliveryCharge: row.csd_delivery_charge ? Number(row.csd_delivery_charge) : undefined,
        timeSpecificPerKg: row.time_specific_per_kg ? Number(row.time_specific_per_kg) : undefined,
        timeSpecificPerAwb: row.time_specific_per_awb
          ? Number(row.time_specific_per_awb)
          : undefined,
        timeSpecificMethod: row.time_specific_method || undefined,
        mallDeliveryPerKg: row.mall_delivery_per_kg ? Number(row.mall_delivery_per_kg) : undefined,
        mallDeliveryPerAwb: row.mall_delivery_per_awb
          ? Number(row.mall_delivery_per_awb)
          : undefined,
        mallDeliveryMethod: row.mall_delivery_method || undefined,
        deliveryReattemptPerKg: row.delivery_reattempt_per_kg
          ? Number(row.delivery_reattempt_per_kg)
          : undefined,
        deliveryReattemptPerAwb: row.delivery_reattempt_per_awb
          ? Number(row.delivery_reattempt_per_awb)
          : undefined,
        deliveryReattemptMethod: row.delivery_reattempt_method || undefined,
        handlingSinglePiece: row.handling_single_piece
          ? Number(row.handling_single_piece)
          : undefined,
        handlingBelow100Kg: row.handling_below_100_kg
          ? Number(row.handling_below_100_kg)
          : undefined,
        handling100To200Kg: row.handling_100_to_200_kg
          ? Number(row.handling_100_to_200_kg)
          : undefined,
        handlingAbove200Kg: row.handling_above_200_kg
          ? Number(row.handling_above_200_kg)
          : undefined,
        insuranceCharge: row.insurance_charge ? Number(row.insurance_charge) : undefined,
        codFixedAmount: row.cod_fixed_amount ? Number(row.cod_fixed_amount) : undefined,
        codPercentage: row.cod_percentage ? Number(row.cod_percentage) : undefined,
        codMethod: row.cod_method || undefined,
        rovFixedAmount: row.rov_fixed_amount ? Number(row.rov_fixed_amount) : undefined,
        rovPercentage: row.rov_percentage ? Number(row.rov_percentage) : undefined,
        rovMethod: row.rov_method || undefined,
        liabilityLimit: row.liability_limit ? Number(row.liability_limit) : undefined,
        liabilityMethod: row.liability_method || undefined,
      }

      // Check if record exists
      const conditions: SQLWrapper[] = []
      if (courierId !== null && courierId !== undefined) {
        conditions.push(eq(b2bAdditionalCharges.courier_id, courierId))
      } else {
        conditions.push(isNull(b2bAdditionalCharges.courier_id))
      }

      if (serviceProvider) {
        conditions.push(eq(b2bAdditionalCharges.service_provider, serviceProvider))
      } else {
        conditions.push(isNull(b2bAdditionalCharges.service_provider))
      }

      if (planId) {
        conditions.push(eq(b2bAdditionalCharges.plan_id, planId))
      } else {
        conditions.push(isNull(b2bAdditionalCharges.plan_id))
      }

      const [existing] = await db
        .select()
        .from(b2bAdditionalCharges)
        .where(and(...conditions))
        .limit(1)

      if (existing) {
        updated += 1
      } else {
        inserted += 1
      }

      // Upsert the record
      await upsertAdditionalCharges({
        ...payload,
        courierScope: { courierId, serviceProvider },
      })
    } catch (err: any) {
      skipped.push({ row, error: err.message })
    }
  }

  return { inserted, updated, skipped }
}

// -----------------------------
// Volumetric Rules Management
// -----------------------------

export const getVolumetricRules = async (params: {
  courierScope?: CourierScope
  includeGlobal?: boolean
}) => {
  const { courierId, serviceProvider } = normalizeCourierScope(params.courierScope)

  const scopes: (CourierScope | null)[] = [
    { courierId: courierId ?? undefined, serviceProvider: serviceProvider ?? undefined },
    { courierId: undefined, serviceProvider: serviceProvider ?? undefined },
    null,
  ]

  for (const scope of scopes) {
    const { courierId: cId, serviceProvider: sProvider } = normalizeCourierScope(scope ?? undefined)

    const [rules] = await db
      .select()
      .from(b2bVolumetricRules)
      .where(
        and(
          cId ? eq(b2bVolumetricRules.courier_id, cId) : isNull(b2bVolumetricRules.courier_id),
          sProvider
            ? eq(b2bVolumetricRules.service_provider, sProvider)
            : isNull(b2bVolumetricRules.service_provider),
        ),
      )
      .limit(1)

    if (rules) return rules
  }

  return null
}

export const upsertVolumetricRules = async (
  payload: Partial<{
    volumetricDivisor: number
    cftFactor: number
    minimumVolumetricWeight: number
  }> & { courierScope?: CourierScope },
) => {
  const { courierId, serviceProvider } = normalizeCourierScope(payload.courierScope)

  const updateData: any = {
    updated_at: new Date(),
  }

  if (payload.volumetricDivisor !== undefined)
    updateData.volumetric_divisor = payload.volumetricDivisor.toString()
  if (payload.cftFactor !== undefined) updateData.cft_factor = payload.cftFactor.toString()
  if (payload.minimumVolumetricWeight !== undefined)
    updateData.minimum_volumetric_weight = payload.minimumVolumetricWeight.toString()

  const [existing] = await db
    .select()
    .from(b2bVolumetricRules)
    .where(
      and(
        courierId
          ? eq(b2bVolumetricRules.courier_id, courierId)
          : isNull(b2bVolumetricRules.courier_id),
        serviceProvider
          ? eq(b2bVolumetricRules.service_provider, serviceProvider)
          : isNull(b2bVolumetricRules.service_provider),
      ),
    )
    .limit(1)

  if (existing) {
    const [updated] = await db
      .update(b2bVolumetricRules)
      .set(updateData)
      .where(eq(b2bVolumetricRules.id, existing.id))
      .returning()
    return updated
  }

  const [created] = await db
    .insert(b2bVolumetricRules)
    .values({
      ...updateData,
      courier_id: courierId,
      service_provider: serviceProvider,
    })
    .returning()

  return created
}

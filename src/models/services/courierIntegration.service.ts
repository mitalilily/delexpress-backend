import { randomUUID } from 'crypto'
import { and, asc, desc, eq, gte, ilike, inArray, sql } from 'drizzle-orm'
import { ShippingRateFilters } from '../../controllers/admin/courier.controller'
import { db } from '../client'
import { couriers } from '../schema/couriers'
import { courierSummary } from '../schema/courierSummary'
import { shippingRates } from '../schema/shippingRates'
import { userPlans } from '../schema/userPlans'
import { zones } from '../schema/zones'
import {
  fetchShippingRateSlabs,
  normalizeB2CShippingMode,
  normalizeB2CServiceProvider,
  normaliseRateCardSlabs,
  replaceShippingRateSlabs,
  validateRateCardSlabs,
  type RateCardSlabInput,
} from './b2cRateCard.service'

// =========================
// 🔷 Types
// =========================
export interface CourierFilters {
  name?: string
  masterCompany?: string
  podAvailable?: string // "yes" | "no" | ""
  realtimeTracking?: string
  isHyperlocal?: boolean
}

export interface GetAllCouriersPaginatedParams {
  limit: number
  offset: number
  filters?: CourierFilters
  sortBy?: 'latest' | 'oldest' | 'az' | 'za'
}

// =========================
// 🛠 Helper: Where Clause
// =========================

export interface CourierFilters {
  name?: string
}

export const buildCourierWhereClause = (filters: CourierFilters = {}) => {
  const conditions = []

  if (filters.name) {
    conditions.push(ilike(couriers.name, `%${filters.name}%`))
  }

  return conditions.length ? and(...conditions) : undefined
}
// =========================
// 🛠 Helper: Sort
// =========================
export const getSortClause = (sortBy?: GetAllCouriersPaginatedParams['sortBy']) => {
  switch (sortBy) {
    case 'az':
      return asc(couriers.name) // A → Z
    case 'za':
      return desc(couriers.name) // Z → A
    default:
      return asc(couriers.id) // fallback to ID
  }
}

// =========================
// 📦 Get Paginated Couriers
// =========================
export const getAllCouriersPaginated = async ({
  limit,
  offset,
  filters,
  sortBy,
}: GetAllCouriersPaginatedParams) => {
  const whereClause = buildCourierWhereClause(filters)

  return await db
    .select()
    .from(couriers)
    .where(whereClause)
    .orderBy(getSortClause(sortBy))
    .limit(limit)
    .offset(offset)
}

// =========================
// 📊 Get Courier Count (with Filters)
// =========================
export const getCourierCount = async (filters: CourierFilters = {}) => {
  const whereClause = buildCourierWhereClause(filters)

  const [result] = await db
    .select({ count: sql<number>`count(*)` })
    .from(couriers)
    .where(whereClause)

  return Number(result?.count ?? 0)
}

// =========================
// 🔍 Get Courier by ID
// =========================
export const getCourierById = async (id: number) => {
  const [courier] = await db.select().from(couriers).where(eq(couriers.id, id))

  return courier
}

// =========================
// 📋 Get Summary Stats
// =========================
export const getCourierSummary = async () => {
  const [summary] = await db.select().from(courierSummary).where(eq(courierSummary.id, 1))

  return summary
}

export const getShippingRates = async (filters: ShippingRateFilters = {}) => {
  const conditions: any[] = []
  const normalizedModeFilter = normalizeB2CShippingMode(filters.mode)

  if (filters.courier_name?.length) {
    conditions.push(inArray(shippingRates.courier_name, filters.courier_name))
  }

  if (filters.min_weight !== undefined && filters.business_type !== 'b2c') {
    conditions.push(gte(shippingRates.min_weight, filters.min_weight.toString()))
  }

  if (filters.plan_id) {
    conditions.push(eq(shippingRates.plan_id, filters.plan_id))
  }

  if (filters.business_type) {
    conditions.push(eq(shippingRates.business_type, filters.business_type))
  }

  // Fetch all rates matching filters - explicitly select service_provider
  const rawResults = await db
    .select({
      rate: shippingRates,
      zone: zones,
    })
    .from(shippingRates)
    .leftJoin(zones, eq(zones.id, shippingRates.zone_id))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(asc(shippingRates.last_updated))
  const filteredResults = normalizedModeFilter
    ? rawResults.filter((row) => normalizeB2CShippingMode(row.rate.mode) === normalizedModeFilter)
    : rawResults

  const slabs = await fetchShippingRateSlabs(filteredResults.map((row) => row.rate.id))
  const slabMap = new Map<string, any[]>()
  for (const slab of slabs) {
    const list = slabMap.get(slab.shipping_rate_id) || []
    list.push({
      id: slab.id,
      weight_from: Number(slab.weight_from),
      weight_to: slab.weight_to === null ? null : Number(slab.weight_to),
      rate: Number(slab.rate),
      extra_rate: slab.extra_rate === null ? null : Number(slab.extra_rate),
      extra_weight_unit:
        slab.extra_weight_unit === null ? null : Number(slab.extra_weight_unit),
    })
    slabMap.set(slab.shipping_rate_id, list)
  }

  const grouped: Record<string, any> = {}

  // Fetch all zones (for B2C)
  const allZones = await db.select().from(zones)

  for (const row of filteredResults) {
    const businessType = row.rate.business_type

    const key = businessType === 'b2b' ? getB2BGroupKey(row.rate) : getB2CGroupKey(row.rate)

    if (!grouped[key]) {
      // Initialize rates object
      let rates: Record<string, any> = {}

      if (businessType === 'b2c') {
        // B2C → initialize all zones
        for (const z of allZones) {
          rates[z.name] = {}
        }
      } else {
        // B2B → only zones associated with the courier
        rates = {} // will populate as we iterate rawResults
      }

      // Explicitly extract service_provider - handle both snake_case and camelCase
      const serviceProvider = normalizeB2CServiceProvider(
        row.rate.service_provider || (row.rate as any).serviceProvider || null,
      )

      grouped[key] = {
        ...row.rate,
        mode: normalizeB2CShippingMode(row.rate.mode),
        service_provider: serviceProvider, // Always include service_provider
        rates,
        zone_slabs: {},
      }

      // Debug log for first item
      if (!grouped[key].service_provider) {
        console.log(
          `[getShippingRates] service_provider is null for courier: ${row.rate.courier_name}, available fields:`,
          Object.keys(row.rate),
        )
      }
    }

    if (row.zone) {
      grouped[key].rates[row.zone.name] = grouped[key].rates[row.zone.name] || {}
      grouped[key].rates[row.zone.name][row.rate.type] = row.rate.rate.toString()

      if (businessType === 'b2c') {
        grouped[key].zone_slabs[row.zone.name] = grouped[key].zone_slabs[row.zone.name] || {}
        grouped[key].zone_slabs[row.zone.name][row.rate.type] = slabMap.get(row.rate.id) || []
      }
    }
  }

  let result = Object.values(grouped)

  // Debug: Log first result to verify service_provider is included
  if (result.length > 0) {
    console.log(`[getShippingRates] Returning ${result.length} grouped rates`)
    console.log(`[getShippingRates] First rate service_provider:`, result[0]?.service_provider)
    console.log(`[getShippingRates] First rate keys:`, Object.keys(result[0] || {}))
  }

  return result
}

export const getUserShippingRates = async (
  userId: string,
  filters: Omit<ShippingRateFilters, 'plan_id'> = {},
) => {
  // 1. Find the user's active plan
  const userPlan = await db
    .select()
    .from(userPlans)
    .where(and(eq(userPlans.userId, userId), eq(userPlans.is_active, true)))
    .limit(1)

  if (!userPlan.length) {
    throw new Error('No active plan found for this user')
  }

  const planId = userPlan[0].plan_id

  // 2. Call existing getShippingRates with plan_id injected
  return getShippingRates({ ...filters, plan_id: planId })
}

export interface ShippingRateUpdatePayload {
  mode?: string
  previous_mode?: string
  cod_charges?: string | number
  cod_percent?: string | number
  other_charges?: string | number
  min_weight?: string | number
  courier_name?: string
  service_provider?: string
  previous_service_provider?: string
  businessType?: 'b2b' | 'b2c'
  rates?: any
  zone_slabs?: Record<string, { forward?: RateCardSlabInput[]; rto?: RateCardSlabInput[] }>
}

const toMoney = (v: any): string => {
  if (v === undefined || v === null || v === '') return '0'
  const n = typeof v === 'string' ? Number(v) : v
  return Number.isFinite(n) ? n.toFixed(2) : '0'
}

const toWeight = (v: any): string => {
  if (v === undefined || v === null || v === '') return '0.000'
  const n = typeof v === 'string' ? Number(v) : v
  return Number.isFinite(n) ? n.toFixed(3) : '0.000'
}

const getB2CGroupKey = (rate: any) =>
  `${rate.courier_id}_${rate.plan_id}_${normalizeB2CServiceProvider(rate.service_provider)}_${normalizeB2CShippingMode(rate.mode)}`

const getB2BGroupKey = (rate: any) =>
  `${rate.courier_name}_${rate.plan_id}_${normalizeB2CShippingMode(rate.mode)}`

export const updateShippingRate = async (
  courierId: number,
  updates: ShippingRateUpdatePayload,
  planId: string,
) => {
  const {
    courier_name,
    mode,
    cod_charges,
    cod_percent,
    other_charges,
    min_weight,
    service_provider,
    previous_service_provider,
    businessType = 'b2b',
    rates,
    zone_slabs,
    previous_mode,
  } = updates

  console.log('MODE!', mode)

  if (!courierId || !courier_name) {
    throw new Error('Both courierId and courier_name are required')
  }

  // Save exactly what the frontend sends - no override logic
  const finalServiceProvider = service_provider?.trim() || null
  const normalizedServiceProvider = normalizeB2CServiceProvider(finalServiceProvider) || null
  const previousServiceProvider =
    normalizeB2CServiceProvider(previous_service_provider) || normalizedServiceProvider
  const normalizedMode = normalizeB2CShippingMode(mode)
  const previousMode = normalizeB2CShippingMode(previous_mode ?? mode)

      console.log(
        `[updateShippingRate] Saving service_provider from frontend: "${normalizedServiceProvider}" for courier_id: ${courierId}, courier_name: "${courier_name}"`,
      )

  const zoneNames = Array.from(
    new Set([
      ...Object.keys(rates || {}).filter((z) => z !== 'cod' && z !== 'other'),
      ...Object.keys(zone_slabs || {}),
    ]),
  )

  if (zoneNames.length > 0) {
    const zoneRows = await db
      .select({ id: zones.id, name: zones.name })
      .from(zones)
      .where(inArray(zones.name, zoneNames))

    for (const zn of zoneRows) {
      const zoneRate = rates[zn.name] || {}
      const zoneSlabs = zone_slabs?.[zn.name] || {}

      for (const type of ['forward', 'rto'] as const) {
        const value = zoneRate[type]
        const explicitSlabs = normaliseRateCardSlabs(zoneSlabs[type] || [])
        validateRateCardSlabs(explicitSlabs)
        const hasLegacyValue = value !== undefined && value !== null && value !== ''
        if (!hasLegacyValue && !explicitSlabs.length) continue

        const fallbackRate = explicitSlabs[0]?.rate ?? value
        const fallbackMinWeight =
          explicitSlabs[0]?.weight_from ?? min_weight ?? '0'
        const rateStr = toMoney(fallbackRate)

        const [existing] = await db
          .select({ id: shippingRates.id })
          .from(shippingRates)
          .where(
            and(
              eq(shippingRates.courier_id, courierId),
              eq(shippingRates.plan_id, planId),
              eq(shippingRates.business_type, businessType),
              eq(shippingRates.zone_id, zn.id),
              eq(shippingRates.type, type),
              eq(sql`LOWER(${shippingRates.mode})`, previousMode),
              previousServiceProvider
                ? eq(sql`LOWER(${shippingRates.service_provider})`, previousServiceProvider)
                : sql`1=1`,
            ),
          )

        if (existing) {
          console.log(
            `[updateShippingRate] Updating existing rate ${existing.id} with service_provider: ${normalizedServiceProvider}`,
          )
          // Build update object - always include service_provider
          const updateData: any = {
            rate: rateStr,
            courier_id: courierId,
            courier_name: String(courier_name),
            last_updated: new Date(),
            min_weight: toWeight(fallbackMinWeight),
            cod_charges: cod_charges !== undefined ? toMoney(cod_charges) : undefined,
            cod_percent: cod_percent !== undefined ? toMoney(cod_percent) : undefined,
            other_charges: other_charges !== undefined ? toMoney(other_charges) : undefined,
            mode: normalizedMode, // keep mode in sync
          }
          // Always set service_provider (even if null)
          updateData.service_provider = normalizedServiceProvider
          console.log(
            `[updateShippingRate] Setting service_provider in update: "${updateData.service_provider}"`,
          )

          await db.update(shippingRates).set(updateData).where(eq(shippingRates.id, existing.id))
          if (businessType === 'b2c') {
            await replaceShippingRateSlabs(existing.id, explicitSlabs)
          }
          console.log(`[updateShippingRate] ✅ Updated rate ${existing.id} successfully`)
        } else {
          console.log(
            `[updateShippingRate] Inserting new rate with service_provider: ${normalizedServiceProvider}`,
          )
          const insertData = {
            id: randomUUID(),
            plan_id: planId,
            courier_id: courierId,
            courier_name: String(courier_name),
            service_provider: normalizedServiceProvider,
            mode: normalizedMode,
            business_type: businessType,
            min_weight: toWeight(fallbackMinWeight),
            zone_id: zn.id,
            type,
            rate: rateStr,
            cod_charges: cod_charges !== undefined ? toMoney(cod_charges) : undefined,
            cod_percent: cod_percent !== undefined ? toMoney(cod_percent) : undefined,
            other_charges: other_charges !== undefined ? toMoney(other_charges) : undefined,
            last_updated: new Date(),
          }
          console.log(
            `[updateShippingRate] Inserting with service_provider: "${insertData.service_provider}"`,
          )
          await db.insert(shippingRates).values(insertData)
          if (businessType === 'b2c') {
            await replaceShippingRateSlabs(insertData.id, explicitSlabs)
          }
          console.log(`[updateShippingRate] ✅ Inserted new rate successfully`)
        }
      }
    }
  }
  return { success: true }
}

interface RateInput {
  courier_id: string
  courier_name: string
  service_provider?: string
  plan_id: string
  mode: string
  business_type: 'b2b' | 'b2c'
  cod_charges?: number | null
  min_weight?: string
  cod_percent?: number | null
  other_charges?: number | null
  rates: { zone_id: string; type: 'forward' | 'rto'; rate: number }[]
  zone_slabs?: Record<string, { forward?: RateCardSlabInput[]; rto?: RateCardSlabInput[] }>
}

export const upsertShippingRate = async (input: RateInput) => {
  // Fetch service_provider from couriers table, but use any provided value as fallback
  let finalServiceProvider: string | null = null
  const normalizedMode = normalizeB2CShippingMode(input.mode)

  // Check if service_provider is provided in input (for CSV imports that might have it)
  const providedServiceProvider = normalizeB2CServiceProvider((input as any).service_provider) || null

  if (input.courier_id && input.courier_name) {
    console.log(
      `[upsertShippingRate] Fetching service_provider for courier_id: ${input.courier_id}, courier_name: ${input.courier_name}, provided: "${providedServiceProvider}"`,
    )
    try {
      const matchingCouriers = await db
        .select({
          serviceProvider: couriers.serviceProvider,
          name: couriers.name,
        })
        .from(couriers)
        .where(
          and(
            eq(couriers.id, Number(input.courier_id)),
            providedServiceProvider
              ? eq(sql`LOWER(${couriers.serviceProvider})`, providedServiceProvider)
              : sql`1=1`,
          ),
        )

      console.log(`[upsertShippingRate] Found ${matchingCouriers.length} matching couriers`)

      // Try to match by courier_name as well if multiple couriers with same id exist
      const matchedCourier =
        matchingCouriers.find(
          (c) =>
            c.name === input.courier_name &&
            (!providedServiceProvider ||
              normalizeB2CServiceProvider(c.serviceProvider) === providedServiceProvider),
        ) || matchingCouriers[0]
      if (matchedCourier) {
        finalServiceProvider =
          normalizeB2CServiceProvider(matchedCourier.serviceProvider) || providedServiceProvider || null
        console.log(
          `[upsertShippingRate] ✅ Matched courier: ${matchedCourier.name}, service_provider: ${finalServiceProvider}`,
        )
      } else {
        console.warn(
          `[upsertShippingRate] ⚠️ No matching courier found for courier_id: ${input.courier_id}, courier_name: ${input.courier_name}. Using provided: "${providedServiceProvider}"`,
        )
        finalServiceProvider = providedServiceProvider
      }
    } catch (error) {
      console.error(`[upsertShippingRate] Error fetching courier:`, error)
      finalServiceProvider = providedServiceProvider
      if (!finalServiceProvider) {
        console.error(`[upsertShippingRate] ❌ No service_provider available`)
      }
    }
  } else {
    // If no courier_id, use provided value
    finalServiceProvider = providedServiceProvider
  }

  for (const r of input.rates) {
    const explicitSlabs = normaliseRateCardSlabs(input.zone_slabs?.[r.zone_id]?.[r.type] || [])
    validateRateCardSlabs(explicitSlabs)
    const fallbackRate = explicitSlabs[0]?.rate ?? r.rate
    const fallbackMinWeight =
      explicitSlabs[0]?.weight_from ?? input?.min_weight ?? '0'
    const existing = await db
      .select()
      .from(shippingRates)
      .where(
        and(
          eq(shippingRates.courier_id, Number(input.courier_id)),
          eq(shippingRates.plan_id, input.plan_id),
          eq(shippingRates.business_type, input.business_type),
          eq(shippingRates.zone_id, r.zone_id),
          eq(shippingRates.type, r.type),
          eq(sql`LOWER(${shippingRates.mode})`, normalizedMode),
          finalServiceProvider
            ? eq(sql`LOWER(${shippingRates.service_provider})`, finalServiceProvider)
            : sql`1=1`,
        ),
      )
      .limit(1)

    if (existing.length) {
      console.log(
        `[upsertShippingRate] Updating existing rate ${existing[0].id} with service_provider: ${finalServiceProvider}`,
      )
      // Build update object - only include service_provider if we have a value
      const updateData: any = {
        rate: fallbackRate.toString(),
        cod_charges: input.cod_charges?.toString() ?? null,
        cod_percent: input.cod_percent?.toString() ?? null,
        min_weight: toWeight(fallbackMinWeight),
        mode: normalizedMode,
        other_charges: input.other_charges?.toString() ?? null,
        last_updated: new Date(),
      }
      // Only update service_provider if we found a value
      if (finalServiceProvider) {
        updateData.service_provider = finalServiceProvider
      }
      await db.update(shippingRates).set(updateData).where(eq(shippingRates.id, existing[0].id))
      if (input.business_type === 'b2c') {
        await replaceShippingRateSlabs(existing[0].id, explicitSlabs)
      }
    } else {
      console.log(
        `[upsertShippingRate] Inserting new rate with service_provider: ${finalServiceProvider}`,
      )
      await db.insert(shippingRates).values({
        id: randomUUID(),
        courier_id: input.courier_id,
        mode: normalizedMode,
        courier_name: input.courier_name,
        plan_id: input.plan_id,
        min_weight: toWeight(fallbackMinWeight),
        business_type: input.business_type,
        zone_id: r.zone_id,
        type: r.type,
        rate: fallbackRate.toString(),
        cod_charges: input.cod_charges?.toString() ?? null,
        cod_percent: input.cod_percent?.toString() ?? null,
        other_charges: input.other_charges?.toString() ?? null,
        service_provider: finalServiceProvider || null,
        created_at: new Date(),
        last_updated: new Date(),
      } as any)
      if (input.business_type === 'b2c') {
        const [inserted] = await db
          .select({ id: shippingRates.id })
          .from(shippingRates)
          .where(
            and(
              eq(shippingRates.courier_id, Number(input.courier_id)),
              eq(shippingRates.plan_id, input.plan_id),
              eq(shippingRates.business_type, input.business_type),
              eq(shippingRates.zone_id, r.zone_id),
              eq(shippingRates.type, r.type),
              eq(sql`LOWER(${shippingRates.mode})`, normalizedMode),
              finalServiceProvider
                ? eq(sql`LOWER(${shippingRates.service_provider})`, finalServiceProvider)
                : sql`1=1`,
            ),
          )
          .orderBy(desc(shippingRates.created_at))
          .limit(1)
        if (inserted) {
          await replaceShippingRateSlabs(inserted.id, explicitSlabs)
        }
      }
    }
  }
}

export const createCourier = async (data: {
  courierName: string
  courierId: string
  serviceProvider?: string
  businessType?: ('b2c' | 'b2b')[] // Optional: defaults to ['b2c', 'b2b']
}) => {
  if (!data?.courierName || !data?.courierName?.trim()) throw new Error('Courier name is required')
  if (!data?.serviceProvider) throw new Error('Service provider is required')
  
  // Validate service provider is one of the allowed providers
  const allowedProviders = ['delhivery', 'ekart', 'xpressbees']
  const normalizedProvider = (data.serviceProvider || '').toLowerCase().trim()
  if (!allowedProviders.includes(normalizedProvider)) {
    throw new Error(
      `Service provider must be one of: ${allowedProviders.join(', ')}. Received: ${data.serviceProvider}`
    )
  }

  console.log('data', data)
  // Check if courier already exists for this service provider
  // Same courier ID can exist for different service providers
  const existing = await db
    .select()
    .from(couriers)
    .where(
      and(
        eq(couriers.id, Number(data?.courierId)),
        eq(couriers.serviceProvider, normalizedProvider),
      ),
    )
  if (existing.length > 0) throw new Error('Courier already exists for this service provider')

  // Validate and set businessType (default to both if not provided)
  const businessType =
    data?.businessType && data.businessType.length > 0 ? data.businessType : ['b2c', 'b2b']

  // Insert new courier
  const [newCourier] = await db
    .insert(couriers)
    .values({
      name: data?.courierName?.trim(),
      id: Number(data?.courierId),
      serviceProvider: normalizedProvider,
      businessType: businessType,
    } as any)
    .returning()

  return newCourier
}

export const deleteShippingRate = async (
  courierId: number,
  planId: string,
  businessType: 'b2b' | 'b2c',
  zoneId?: string,
  serviceProvider?: string,
  mode?: string,
) => {
  console.log('zone id', zoneId)
  const normalizedMode = normalizeB2CShippingMode(mode)
  const normalizedServiceProvider = normalizeB2CServiceProvider(serviceProvider)
  if (businessType === 'b2c') {
    const deleted = await db
      .delete(shippingRates)
      .where(
        and(
          eq(shippingRates.courier_id, courierId),
          eq(shippingRates.plan_id, planId),
          eq(shippingRates.business_type, 'b2c'),
          normalizedMode ? eq(sql`LOWER(${shippingRates.mode})`, normalizedMode) : sql`1=1`,
          normalizedServiceProvider
            ? eq(sql`LOWER(${shippingRates.service_provider})`, normalizedServiceProvider)
            : sql`1=1`,
          zoneId ? eq(shippingRates.zone_id, zoneId) : sql`1=1`,
        ),
      )
      .returning()

    return deleted.length > 0 ? deleted : null
  }

  if (businessType === 'b2b') {
    if (zoneId) {
      // ✅ B2B Zone-level delete
      const deleted = await db
        .delete(shippingRates)
        .where(
          and(
            eq(shippingRates.courier_id, courierId),
            eq(shippingRates.plan_id, planId),
            eq(shippingRates.business_type, 'b2b'),
            normalizedMode ? eq(sql`LOWER(${shippingRates.mode})`, normalizedMode) : sql`1=1`,
            normalizedServiceProvider
              ? eq(sql`LOWER(${shippingRates.service_provider})`, normalizedServiceProvider)
              : sql`1=1`,
            eq(shippingRates.zone_id, zoneId),
          ),
        )
        .returning()

      return deleted.length > 0 ? deleted : null
    } else {
      // ✅ B2B Courier-level delete (all zones for that courier+plan)
      const deleted = await db
        .delete(shippingRates)
        .where(
          and(
            eq(shippingRates.courier_id, courierId),
            eq(shippingRates.plan_id, planId),
            eq(shippingRates.business_type, 'b2b'),
            normalizedMode ? eq(sql`LOWER(${shippingRates.mode})`, normalizedMode) : sql`1=1`,
            normalizedServiceProvider
              ? eq(sql`LOWER(${shippingRates.service_provider})`, normalizedServiceProvider)
              : sql`1=1`,
          ),
        )
        .returning()

      return deleted.length > 0 ? deleted : null
    }
  }

  return null
}

export const deleteCourierService = async (id: string, serviceProvider: string) => {
  const exists = await db
    .select()
    .from(couriers)
    .where(and(eq(couriers.id, Number(id)), eq(couriers.serviceProvider, serviceProvider)))
  if (exists.length === 0) throw new Error('Courier not found')

  await db
    .delete(couriers)
    .where(and(eq(couriers.id, Number(id)), eq(couriers.serviceProvider, serviceProvider)))
}

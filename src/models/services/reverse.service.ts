import { and, eq, sql } from 'drizzle-orm'
import { db } from '../client'
import { b2c_orders } from '../schema/b2cOrders'
import { couriers } from '../schema/couriers'
import { locations } from '../schema/locations'
import { userPlans } from '../schema/userPlans'
import { zones } from '../schema/zones'
import { computeB2CRateCardCharge, fetchResolvedB2CRateCards } from './b2cRateCard.service'

// Weight slab logic removed

type LocRow = {
  id: string
  pincode: string
  city: string
  state: string
  country: string
  tags: string[]
}

function normalizeTags(tags: unknown): string[] {
  if (Array.isArray(tags)) return tags.map((t) => String(t).toLowerCase())
  return []
}

async function fetchLocationByPincode(pincode: string): Promise<LocRow | null> {
  const rows = await db
    .select({
      id: locations.id,
      pincode: locations.pincode,
      city: locations.city,
      state: locations.state,
      country: locations.country,
      tags: locations.tags,
    })
    .from(locations)
    .where(eq(locations.pincode, pincode))
    .limit(1)
  const row = rows[0] as any
  if (!row) return null
  return { ...row, tags: normalizeTags(row.tags) }
}

const hasTag = (loc: LocRow | null, tag: string) =>
  !!loc && Array.isArray(loc.tags) && loc.tags.includes(tag.toLowerCase())

const ZONE_KEY_TO_DB_CODE: Record<string, string> = {
  METRO_TO_METRO: 'Metro to Metro',
  ROI: 'ROI',
  SPECIAL_ZONE: 'Special Zone',
  WITHIN_CITY: 'Within City',
  WITHIN_REGION: 'Within Region',
  WITHIN_STATE: 'Within State',
}

function determineB2CZoneKey(
  origin: LocRow | null,
  destination: LocRow | null,
): { key: string; reason: string } {
  if (!origin || !destination) {
    return { key: 'ROI', reason: 'origin or destination missing' }
  }
  if (
    hasTag(origin, 'special_zones') ||
    hasTag(origin, 'special_zone') ||
    hasTag(destination, 'special_zones') ||
    hasTag(destination, 'special_zone') ||
    hasTag(origin, 'special') ||
    hasTag(destination, 'special')
  ) {
    return { key: 'SPECIAL_ZONE', reason: 'special zone tag present' }
  }
  if (
    origin.city &&
    destination.city &&
    origin.state &&
    destination.state &&
    (origin.city ?? '').toLowerCase() === (destination.city ?? '').toLowerCase() &&
    (origin.state ?? '').toLowerCase() === (destination.state ?? '').toLowerCase()
  ) {
    return { key: 'WITHIN_CITY', reason: 'same city + same state' }
  }
  if (
    origin.state &&
    destination.state &&
    (origin.state ?? '').toLowerCase() === (destination.state ?? '').toLowerCase() &&
    (origin.city ?? '').toLowerCase() !== (destination.city ?? '').toLowerCase()
  ) {
    return { key: 'WITHIN_STATE', reason: 'same state (different city)' }
  }
  if (
    hasTag(origin, 'metros') &&
    hasTag(destination, 'metros') &&
    (origin.city ?? '').toLowerCase() !== (destination.city ?? '').toLowerCase()
  ) {
    return { key: 'METRO_TO_METRO', reason: 'both metros (different cities, cross-state allowed)' }
  }
  const regions = ['north', 'south', 'east', 'west']
  for (const r of regions) {
    if (hasTag(origin, r) && hasTag(destination, r)) {
      return { key: 'WITHIN_REGION', reason: `both in region ${r}` }
    }
  }
  return { key: 'ROI', reason: 'fallback Rest of India' }
}

async function fetchZoneIdByKey(key: string): Promise<{ id: string; code: string; name?: string }> {
  const dbCodeRaw = ZONE_KEY_TO_DB_CODE[key] ?? ZONE_KEY_TO_DB_CODE['ROI']
  const dbCode = dbCodeRaw?.trim()
  if (!dbCode) throw new Error('fetchZoneIdByKey called with empty dbCode')
  const exactTrim = await db
    .select({ id: zones.id, code: zones.code, name: zones.name })
    .from(zones)
    .where(sql`trim(${zones.code}) = ${dbCode}`)
    .limit(1)
  if (exactTrim?.[0]?.id)
    return { id: exactTrim[0].id, code: exactTrim[0].code, name: exactTrim[0].name }
  const ci = await db
    .select({ id: zones.id, code: zones.code, name: zones.name })
    .from(zones)
    .where(sql`lower(trim(${zones.code})) = ${dbCode.toLowerCase()}`)
    .limit(1)
  if (ci?.[0]?.id) return { id: ci[0].id, code: ci[0].code, name: ci[0].name }
  const nameMatch = await db
    .select({ id: zones.id, code: zones.code, name: zones.name })
    .from(zones)
    .where(sql`lower(trim(${zones.name})) = ${dbCode.toLowerCase()}`)
    .limit(1)
  if (nameMatch?.[0]?.id)
    return { id: nameMatch[0].id, code: nameMatch[0].code, name: nameMatch[0].name }
  const roiKeyLower = (ZONE_KEY_TO_DB_CODE['ROI'] ?? 'ROI').toLowerCase().trim()
  const fallback = await db
    .select({ id: zones.id, code: zones.code, name: zones.name })
    .from(zones)
    .where(
      sql`lower(trim(${zones.code})) = ${roiKeyLower} OR lower(trim(${zones.name})) = ${roiKeyLower}`,
    )
    .limit(1)
  if (fallback?.[0]?.id)
    return { id: fallback[0].id, code: fallback[0].code, name: fallback[0].name }
  throw new Error('Zone lookup failed: ROI zone missing')
}

const convertKgToGrams = (value: unknown, fallback = 500) => {
  const numericValue = Number(value ?? 0)
  if (!Number.isFinite(numericValue) || numericValue <= 0) return fallback
  return Math.max(1, Math.round(numericValue * 1000))
}

export async function quoteReverseForOrder(orderId: string, _overrideWeightGrams?: number) {
  // 1) Fetch order and resolve courier
  const [order] = await db.select().from(b2c_orders).where(eq(b2c_orders.id, orderId)).limit(1)
  if (!order) throw new Error('Order not found')

  // Always trust server-stored order weight; ignore any client override
  const weightGrams = convertKgToGrams(order.weight)
  const reverseDestPincode = order?.pickup_details?.pincode || order.pincode

  let resolvedCourierId = order.courier_id ? Number(order.courier_id) : undefined
  if (!resolvedCourierId) {
    const partnerName = (order.courier_partner || '').trim()
    const provider = (order.integration_type || '').trim()
    if (partnerName && provider) {
      const [c] = await db
        .select({ id: couriers.id })
        .from(couriers)
        .where(
          and(
            eq(couriers.serviceProvider, provider),
            eq(couriers.isEnabled, true),
            sql`${couriers.name} ILIKE ${'%' + partnerName + '%'}`,
          ),
        )
        .limit(1)
      if (c?.id) resolvedCourierId = Number(c.id)
    }
  }
  if (!resolvedCourierId) throw new Error('Courier not associated with the order')

  // 2) Determine zone (origin = consignee, destination = original pickup)
  const [originLoc, destLoc] = await Promise.all([
    order.pincode ? fetchLocationByPincode(order.pincode) : Promise.resolve(null),
    reverseDestPincode ? fetchLocationByPincode(reverseDestPincode) : Promise.resolve(null),
  ])
  const { key: zoneKey } = determineB2CZoneKey(originLoc, destLoc)
  const zoneRow = await fetchZoneIdByKey(zoneKey)

  // 3) Fetch user plan (no slab)
  const [uPlan] = await db
    .select({ planId: userPlans.plan_id })
    .from(userPlans)
    .where(eq(userPlans.userId as any, order.user_id as any))
    .limit(1)
  const planId = uPlan?.planId

  const provider = (order.integration_type || '').toLowerCase().trim()

  let rates = planId
    ? await fetchResolvedB2CRateCards({
        planId,
        zoneId: zoneRow.id,
        courierId: resolvedCourierId,
        serviceProvider: provider || null,
        mode: order.shipping_mode ?? null,
        type: 'rto',
      })
    : []

  if (!rates?.length) {
    console.warn(
      '[ReverseQuote] No RTO rows for zone=%s provider=%s plan=%s',
      zoneRow.code,
      provider,
      planId || 'none',
    )
    throw new Error('No reverse rate available for this zone/weight')
  }

  const selected = rates[0]
  const quote = computeB2CRateCardCharge({
    actual_weight_g: weightGrams,
    length_cm: Number(order.length ?? 0),
    width_cm: Number(order.breadth ?? 0),
    height_cm: Number(order.height ?? 0),
    rateCard: selected,
    selected_max_slab_weight: order.selected_max_slab_weight ?? null,
  })
  if (selected.slabs.length && quote.freight <= 0) {
    throw new Error('No reverse rate available for this zone/weight')
  }
  const rate = Number(quote.freight)
  const zoneCode = (zoneRow.code || '').toUpperCase()
  const eddDays =
    zoneCode === 'A' ? 2 : zoneCode === 'B' ? 3 : zoneCode === 'C' ? 4 : zoneCode === 'D' ? 5 : 6
  const tagsArray = Array.isArray(destLoc?.tags) ? (destLoc!.tags as any[]) : []
  const oda = tagsArray.map((t) => String(t).toLowerCase()).includes('oda')

  return {
    rate,
    currency: 'INR',
    weightGrams,
    zoneId: zoneRow.id,
    zoneCode,
    courierId: resolvedCourierId,
    max_slab_weight: quote.max_slab_weight ?? null,
    oda,
    eddDays,
  }
}

import { and, asc, eq, inArray } from 'drizzle-orm'
import { db } from '../client'
import { shippingRates, shippingRateSlabs } from '../schema/shippingRates'
import { calculateFreight } from './pricing/chargeableFreight'

export interface RateCardSlabInput {
  weight_from: number
  weight_to?: number | null
  rate: number
  extra_rate?: number | null
  extra_weight_unit?: number | null
}

export interface ResolvedRateCardSlab {
  id?: string
  weight_from: number
  weight_to: number | null
  rate: number
  extra_rate: number | null
  extra_weight_unit: number | null
}

export interface ResolvedB2CRateCard {
  shippingRateId: string
  courier_id: number
  service_provider: string | null
  zone_id: string
  type: string
  mode: string
  cod_charges: number
  cod_percent: number
  other_charges: number
  min_weight: number
  base_rate: number
  slabs: ResolvedRateCardSlab[]
}

export interface ComputedB2CRateCardCharge {
  actual_weight: number
  volumetric_weight: number
  chargeable_weight: number
  slabs: number | null
  freight: number
  slab_weight: number | null
  base_price: number
  selected_slab: ResolvedRateCardSlab | null
  max_slab_weight: number | null
  matched_by: 'slab' | 'last_slab_extra' | 'legacy'
}

export function normalizeB2CShippingMode(value: unknown): string {
  const raw = String(value ?? '')
    .trim()
    .toLowerCase()

  if (!raw) return ''
  if (['air', 'a', 'express'].includes(raw)) return 'air'
  if (['surface', 's', 'ground'].includes(raw)) return 'surface'
  return raw
}

export function normalizeB2CServiceProvider(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase()
}

function toNumber(value: unknown, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function normaliseSlabInput(slab: RateCardSlabInput): ResolvedRateCardSlab {
  const weightFrom = Math.max(0, toNumber(slab.weight_from))
  const rawWeightTo = slab.weight_to === undefined || slab.weight_to === null ? null : toNumber(slab.weight_to)
  const weightTo = rawWeightTo !== null && rawWeightTo < weightFrom ? weightFrom : rawWeightTo
  const extraWeightUnitRaw =
    slab.extra_weight_unit === undefined || slab.extra_weight_unit === null
      ? null
      : toNumber(slab.extra_weight_unit)
  const extraWeightUnit =
    extraWeightUnitRaw !== null && extraWeightUnitRaw > 0 ? extraWeightUnitRaw : null
  const extraRateRaw =
    slab.extra_rate === undefined || slab.extra_rate === null ? null : toNumber(slab.extra_rate)
  const extraRate = extraRateRaw !== null && extraRateRaw >= 0 ? extraRateRaw : null

  return {
    weight_from: weightFrom,
    weight_to: weightTo,
    rate: toNumber(slab.rate),
    extra_rate: extraRate,
    extra_weight_unit: extraWeightUnit,
  }
}

export function normaliseRateCardSlabs(slabs: RateCardSlabInput[] = []): ResolvedRateCardSlab[] {
  return slabs
    .map(normaliseSlabInput)
    .filter((slab) => slab.rate > 0)
    .sort((a, b) => a.weight_from - b.weight_from || (a.weight_to ?? Infinity) - (b.weight_to ?? Infinity))
}

export function validateRateCardSlabs(slabs: ResolvedRateCardSlab[]) {
  for (let index = 0; index < slabs.length; index += 1) {
    const slab = slabs[index]
    if (slab.weight_to !== null && slab.weight_to < slab.weight_from) {
      throw new Error(`Invalid slab range at row ${index + 1}: weight_to cannot be less than weight_from`)
    }
    if (slab.extra_rate !== null && slab.extra_weight_unit === null) {
      throw new Error(`Invalid slab at row ${index + 1}: extra_weight_unit is required when extra_rate is set`)
    }
    if (slab.extra_weight_unit !== null && slab.extra_rate === null) {
      throw new Error(`Invalid slab at row ${index + 1}: extra_rate is required when extra_weight_unit is set`)
    }
  }

  for (let index = 1; index < slabs.length; index += 1) {
    const previous = slabs[index - 1]
    const current = slabs[index]
    if (previous.weight_to === null) {
      throw new Error(`Invalid slab configuration: open-ended slab at row ${index} must be the last slab`)
    }
    if (current.weight_from < previous.weight_to) {
      throw new Error(
        `Overlapping slab ranges are not allowed: ${previous.weight_from}-${previous.weight_to} overlaps ${current.weight_from}-${current.weight_to ?? 'open'}`,
      )
    }
  }
}

export async function fetchShippingRateSlabs(rateIds: string[]) {
  if (!rateIds.length) return []

  return db
    .select()
    .from(shippingRateSlabs)
    .where(inArray(shippingRateSlabs.shipping_rate_id, rateIds))
    .orderBy(
      asc(shippingRateSlabs.shipping_rate_id),
      asc(shippingRateSlabs.weight_from),
      asc(shippingRateSlabs.weight_to),
    )
}

export async function fetchResolvedB2CRateCards(filters: {
  planId: string
  zoneId: string
  courierId?: number
  serviceProvider?: string | null
  mode?: string | null
  type?: 'forward' | 'rto'
}) {
  const conditions = [
    eq(shippingRates.plan_id, filters.planId),
    eq(shippingRates.business_type, 'b2c'),
    eq(shippingRates.zone_id, filters.zoneId),
  ]

  if (filters.courierId !== undefined) {
    conditions.push(eq(shippingRates.courier_id, filters.courierId))
  }

  if (filters.type) {
    conditions.push(eq(shippingRates.type, filters.type))
  }

  const requestedServiceProvider = normalizeB2CServiceProvider(filters.serviceProvider)
  const requestedMode = normalizeB2CShippingMode(filters.mode)
  const allRateRows = await db.select().from(shippingRates).where(and(...conditions))
  const providerFilteredRows = requestedServiceProvider
    ? (() => {
        const exactProviderRows = allRateRows.filter(
          (row) => normalizeB2CServiceProvider(row.service_provider) === requestedServiceProvider,
        )
        if (exactProviderRows.length) return exactProviderRows
        return allRateRows.filter((row) => !normalizeB2CServiceProvider(row.service_provider))
      })()
    : allRateRows
  const rateRows = requestedMode
    ? (() => {
        const exactModeRows = providerFilteredRows.filter(
          (row) => normalizeB2CShippingMode(row.mode) === requestedMode,
        )
        if (exactModeRows.length) return exactModeRows
        return providerFilteredRows.filter((row) => !normalizeB2CShippingMode(row.mode))
      })()
    : providerFilteredRows
  const slabs = await fetchShippingRateSlabs(rateRows.map((row) => row.id))
  const slabMap = new Map<string, ResolvedRateCardSlab[]>()

  for (const slab of slabs) {
    const list = slabMap.get(slab.shipping_rate_id) || []
    list.push({
      id: slab.id,
      weight_from: toNumber(slab.weight_from),
      weight_to: slab.weight_to === null ? null : toNumber(slab.weight_to),
      rate: toNumber(slab.rate),
      extra_rate: slab.extra_rate === null ? null : toNumber(slab.extra_rate),
      extra_weight_unit:
        slab.extra_weight_unit === null ? null : toNumber(slab.extra_weight_unit),
    })
    slabMap.set(slab.shipping_rate_id, list)
  }

  return rateRows.map(
    (row): ResolvedB2CRateCard => ({
      shippingRateId: row.id,
      courier_id: row.courier_id,
      service_provider: row.service_provider ?? null,
      zone_id: row.zone_id,
      type: row.type,
      mode: row.mode,
      cod_charges: toNumber(row.cod_charges),
      cod_percent: toNumber(row.cod_percent),
      other_charges: toNumber(row.other_charges),
      min_weight: toNumber(row.min_weight),
      base_rate: toNumber(row.rate),
      slabs: slabMap.get(row.id) || [],
    }),
  )
}

export function slabContainsWeight(
  chargeableWeightKg: number,
  slab: ResolvedRateCardSlab,
  slabIndex: number,
) {
  const start = slab.weight_from
  const end = slab.weight_to ?? Infinity
  const lowerBoundMatches = slabIndex === 0 ? chargeableWeightKg >= start : chargeableWeightKg > start
  return lowerBoundMatches && chargeableWeightKg <= end
}

export function findMatchingSlabIndex(chargeableWeightG: number, slabs: ResolvedRateCardSlab[]) {
  const chargeableWeightKg = chargeableWeightG / 1000
  return slabs.findIndex((slab, index) => slabContainsWeight(chargeableWeightKg, slab, index))
}

function findMatchingSlab(chargeableWeightG: number, slabs: ResolvedRateCardSlab[]) {
  const matchingIndex = findMatchingSlabIndex(chargeableWeightG, slabs)
  return matchingIndex >= 0 ? slabs[matchingIndex] : null
}

function calculateChargeableWeight(params: {
  actual_weight_g: number
  length_cm: number
  width_cm: number
  height_cm: number
}) {
  return calculateFreight({
    actual_weight_g: params.actual_weight_g,
    length_cm: params.length_cm,
    width_cm: params.width_cm,
    height_cm: params.height_cm,
    slab_weight_g: 1,
    base_price: 0,
  })
}

function getLastFiniteSlab(slabs: ResolvedRateCardSlab[]) {
  for (let index = slabs.length - 1; index >= 0; index -= 1) {
    if (slabs[index].weight_to !== null) return slabs[index]
  }
  return null
}

export function formatCourierSlabDisplayName(courierName: string, slabWeightTo: number | null) {
  if (slabWeightTo === null || slabWeightTo === undefined || !Number.isFinite(Number(slabWeightTo))) {
    return courierName
  }
  return `${courierName} - (${Number(slabWeightTo)}) kg`
}

export function computeB2CRateCardCharge(params: {
  actual_weight_g: number
  length_cm: number
  width_cm: number
  height_cm: number
  rateCard: ResolvedB2CRateCard
  selected_max_slab_weight?: number | null
}): ComputedB2CRateCardCharge {
  const preview = calculateChargeableWeight({
    actual_weight_g: params.actual_weight_g,
    length_cm: params.length_cm,
    width_cm: params.width_cm,
    height_cm: params.height_cm,
  })

  if (!params.rateCard.slabs.length) {
    const legacy = calculateFreight({
      actual_weight_g: params.actual_weight_g,
      length_cm: params.length_cm,
      width_cm: params.width_cm,
      height_cm: params.height_cm,
      slab_weight_g: Math.max(1, params.rateCard.min_weight * 1000 || 1),
      base_price: params.rateCard.base_rate,
    })
    return {
      ...legacy,
      slab_weight: params.rateCard.min_weight ? params.rateCard.min_weight * 1000 : null,
      base_price: params.rateCard.base_rate,
      selected_slab: null,
      max_slab_weight: params.rateCard.min_weight || null,
      matched_by: 'legacy',
    }
  }

  const chargeableWeightKg = preview.chargeable_weight / 1000
  const selectedMaxSlabWeight =
    params.selected_max_slab_weight === undefined || params.selected_max_slab_weight === null
      ? null
      : toNumber(params.selected_max_slab_weight)
  const lastFiniteSlab = getLastFiniteSlab(params.rateCard.slabs)

  if (selectedMaxSlabWeight !== null) {
    const explicitlySelectedSlab =
      params.rateCard.slabs.find(
        (slab) =>
          slab.weight_to !== null &&
          Math.abs(Number(slab.weight_to) - Number(selectedMaxSlabWeight)) < 0.0001,
      ) || null

    if (explicitlySelectedSlab) {
      if (
        explicitlySelectedSlab.weight_to !== null &&
        chargeableWeightKg <= explicitlySelectedSlab.weight_to
      ) {
        return {
          actual_weight: preview.actual_weight,
          volumetric_weight: preview.volumetric_weight,
          chargeable_weight: preview.chargeable_weight,
          slabs: null,
          freight: explicitlySelectedSlab.rate,
          slab_weight: null,
          base_price: explicitlySelectedSlab.rate,
          selected_slab: explicitlySelectedSlab,
          max_slab_weight: explicitlySelectedSlab.weight_to,
          matched_by: 'slab',
        }
      }

      if (
        lastFiniteSlab &&
        explicitlySelectedSlab.weight_to !== null &&
        lastFiniteSlab.weight_to !== null &&
        Math.abs(Number(lastFiniteSlab.weight_to) - Number(explicitlySelectedSlab.weight_to)) <
          0.0001 &&
        chargeableWeightKg > explicitlySelectedSlab.weight_to &&
        explicitlySelectedSlab.extra_rate !== null &&
        explicitlySelectedSlab.extra_weight_unit !== null
      ) {
        const extraUnits = Math.ceil(
          (chargeableWeightKg - explicitlySelectedSlab.weight_to) /
            explicitlySelectedSlab.extra_weight_unit,
        )
        return {
          actual_weight: preview.actual_weight,
          volumetric_weight: preview.volumetric_weight,
          chargeable_weight: preview.chargeable_weight,
          slabs: null,
          freight: explicitlySelectedSlab.rate + extraUnits * explicitlySelectedSlab.extra_rate,
          slab_weight: explicitlySelectedSlab.extra_weight_unit * 1000,
          base_price: explicitlySelectedSlab.rate,
          selected_slab: explicitlySelectedSlab,
          max_slab_weight: explicitlySelectedSlab.weight_to,
          matched_by: 'last_slab_extra',
        }
      }
    }
  }

  const selectedSlab = findMatchingSlab(preview.chargeable_weight, params.rateCard.slabs)
  if (selectedSlab) {
    return {
      actual_weight: preview.actual_weight,
      volumetric_weight: preview.volumetric_weight,
      chargeable_weight: preview.chargeable_weight,
      slabs: null,
      freight: selectedSlab.rate,
      slab_weight: null,
      base_price: selectedSlab.rate,
      selected_slab: selectedSlab,
      max_slab_weight: selectedSlab.weight_to,
      matched_by: 'slab',
    }
  }

  if (
    lastFiniteSlab &&
    lastFiniteSlab.weight_to !== null &&
    chargeableWeightKg > lastFiniteSlab.weight_to &&
    lastFiniteSlab.extra_rate !== null &&
    lastFiniteSlab.extra_weight_unit !== null
  ) {
    const extraUnits = Math.ceil(
      (chargeableWeightKg - lastFiniteSlab.weight_to) / lastFiniteSlab.extra_weight_unit,
    )
    const extraFreight = lastFiniteSlab.rate + extraUnits * lastFiniteSlab.extra_rate
    return {
      actual_weight: preview.actual_weight,
      volumetric_weight: preview.volumetric_weight,
      chargeable_weight: preview.chargeable_weight,
      slabs: null,
      freight: extraFreight,
      slab_weight: lastFiniteSlab.extra_weight_unit * 1000,
      base_price: lastFiniteSlab.rate,
      selected_slab: lastFiniteSlab,
      max_slab_weight: lastFiniteSlab.weight_to,
      matched_by: 'last_slab_extra',
    }
  }

  return {
    actual_weight: preview.actual_weight,
    volumetric_weight: preview.volumetric_weight,
    chargeable_weight: preview.chargeable_weight,
    slabs: null,
    freight: 0,
    slab_weight: null,
    base_price: 0,
    selected_slab: null,
    max_slab_weight: null,
    matched_by: 'slab',
  }
}

export async function replaceShippingRateSlabs(shippingRateId: string, slabs: RateCardSlabInput[]) {
  const normalised = normaliseRateCardSlabs(slabs)
  validateRateCardSlabs(normalised)

  await db.delete(shippingRateSlabs).where(eq(shippingRateSlabs.shipping_rate_id, shippingRateId))
  if (!normalised.length) return

  await db.insert(shippingRateSlabs).values(
    normalised.map((slab) => ({
      shipping_rate_id: shippingRateId,
      weight_from: slab.weight_from.toFixed(3),
      weight_to: slab.weight_to === null ? null : slab.weight_to.toFixed(3),
      rate: slab.rate.toFixed(2),
      extra_rate: slab.extra_rate === null ? null : slab.extra_rate.toFixed(2),
      extra_weight_unit:
        slab.extra_weight_unit === null ? null : slab.extra_weight_unit.toFixed(3),
      updated_at: new Date(),
    })),
  )
}

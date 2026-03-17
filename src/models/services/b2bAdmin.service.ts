import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNull,
  lte,
  or,
  SQLWrapper,
} from 'drizzle-orm'
import Papa from 'papaparse'

import { db } from '../client'
// Try importing the entire module first to debug
import { checkHolidayCharge } from '../../utils/holidayChecker'
import { tracking_events } from '../schema/trackingEvents'
import * as zonesModule from '../schema/zones'
import { getAdditionalCharges } from './b2bPricingConfig.service'
const { b2bOverheadRules, b2bPincodes, b2bZoneToZoneRates, b2bZoneRegions, zones } = zonesModule

// Debug: Check import at module load time
console.log('[b2bAdmin.service] Module load - zonesModule check:', {
  hasB2bZoneToZoneRates: 'b2bZoneToZoneRates' in zonesModule,
  allExports: Object.keys(zonesModule).filter((k) => k.includes('b2b') || k.includes('zone')),
  b2bZoneToZoneRatesType: typeof zonesModule.b2bZoneToZoneRates,
  b2bZoneToZoneRatesValue: zonesModule.b2bZoneToZoneRates ? 'defined' : 'undefined',
})

if (typeof b2bZoneToZoneRates === 'undefined') {
  console.error('[b2bAdmin.service] CRITICAL: b2bZoneToZoneRates is undefined at module load time!')
  console.error('[b2bAdmin.service] Available exports from zones module:', Object.keys(zonesModule))
  console.error('[b2bAdmin.service] This indicates an import/export issue')
}

type CourierScope = {
  courierId?: number | null
  serviceProvider?: string | null
}

type PincodeFlags = {
  isOda?: boolean
  isRemote?: boolean
  isMall?: boolean
  isSez?: boolean
  isAirport?: boolean
  isHighSecurity?: boolean
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
// Zones
// -----------------------------

export const listB2BZones = async (
  params: {
    courierIds?: (string | number)[] // Deprecated - zones are always global
    serviceProvider?: string // Deprecated - zones are always global
    includeGlobal?: boolean // Deprecated - zones are always global
  } = {},
) => {
  // Zones are always global (industry standard)
  // courierIds, serviceProvider, and includeGlobal parameters are kept for backward compatibility but ignored

  const conditions: SQLWrapper[] = [eq(zones.business_type, 'B2B') as SQLWrapper]

  const result = await db
    .select()
    .from(zones)
    .where(and(...conditions))
    .orderBy(zones.code)

  return result
}

// -----------------------------
// Pincode Management
// -----------------------------

export const listPincodes = async (params: {
  page?: number
  limit?: number
  zoneId?: string
  pincode?: string
  city?: string
  state?: string
  courierScope?: CourierScope
  includeGlobal?: boolean
  isOda?: boolean
  isRemote?: boolean
  isMall?: boolean
  isSez?: boolean
  isAirport?: boolean
  isHighSecurity?: boolean
  sortBy?: 'pincode' | 'city' | 'state' | 'created_at'
  sortOrder?: 'asc' | 'desc'
}) => {
  const {
    page = 1,
    limit = 20,
    zoneId,
    pincode,
    city,
    state,
    courierScope,
    includeGlobal = true,
    isOda,
    isRemote,
    isMall,
    isSez,
    isAirport,
    isHighSecurity,
    sortBy = 'pincode',
    sortOrder = 'asc',
  } = params

  const offset = (page - 1) * limit

  const { courierId, serviceProvider } = normalizeCourierScope(courierScope)

  const filters: any[] = []

  if (zoneId) filters.push(eq(b2bPincodes.zone_id, zoneId) as SQLWrapper)
  if (pincode) filters.push(ilike(b2bPincodes.pincode, `%${pincode}%`) as SQLWrapper)
  if (city) filters.push(ilike(b2bPincodes.city, `%${city}%`) as SQLWrapper)
  if (state) filters.push(ilike(b2bPincodes.state, `%${state}%`) as SQLWrapper)
  if (isOda === true || isOda === false) filters.push(eq(b2bPincodes.is_oda, isOda) as SQLWrapper)
  if (isRemote === true || isRemote === false)
    filters.push(eq(b2bPincodes.is_remote, isRemote) as SQLWrapper)
  if (isMall === true || isMall === false)
    filters.push(eq(b2bPincodes.is_mall, isMall) as SQLWrapper)
  if (isSez === true || isSez === false) filters.push(eq(b2bPincodes.is_sez, isSez) as SQLWrapper)
  if (isAirport === true || isAirport === false)
    filters.push(eq(b2bPincodes.is_airport, isAirport) as SQLWrapper)
  if (isHighSecurity === true || isHighSecurity === false)
    filters.push(eq(b2bPincodes.is_high_security, isHighSecurity) as SQLWrapper)

  if (courierId || serviceProvider) {
    const courierCondition = courierId
      ? (eq(b2bPincodes.courier_id, courierId) as SQLWrapper)
      : undefined
    const providerCondition: SQLWrapper | undefined = serviceProvider
      ? (eq(b2bPincodes.service_provider, serviceProvider) as SQLWrapper)
      : undefined
    const scopedCondition: SQLWrapper | undefined = courierCondition
      ? providerCondition
        ? (and(courierCondition, providerCondition) as SQLWrapper)
        : courierCondition
      : providerCondition

    if (scopedCondition) {
      const combinedFilter = includeGlobal
        ? (or(isNull(b2bPincodes.courier_id), scopedCondition) as SQLWrapper)
        : scopedCondition
      filters.push(combinedFilter)
    } else if (!includeGlobal) {
      filters.push(isNull(b2bPincodes.courier_id) as SQLWrapper)
    }
  } else if (!includeGlobal) {
    filters.push(isNull(b2bPincodes.courier_id) as SQLWrapper)
  }

  const condition = filters.length ? and(...(filters as SQLWrapper[])) : undefined

  // Determine sort column
  const sortColumns: Record<string, any> = {
    pincode: b2bPincodes.pincode,
    city: b2bPincodes.city,
    state: b2bPincodes.state,
    created_at: b2bPincodes.created_at,
  }
  const sortColumn = sortColumns[sortBy] || b2bPincodes.pincode
  const orderClause = sortOrder === 'asc' ? asc(sortColumn) : desc(sortColumn)

  const data = await db
    .select({
      id: b2bPincodes.id,
      pincode: b2bPincodes.pincode,
      city: b2bPincodes.city,
      state: b2bPincodes.state,
      zoneId: b2bPincodes.zone_id,
      courierId: b2bPincodes.courier_id,
      serviceProvider: b2bPincodes.service_provider,
      isOda: b2bPincodes.is_oda,
      isRemote: b2bPincodes.is_remote,
      isMall: b2bPincodes.is_mall,
      isSez: b2bPincodes.is_sez,
      isAirport: b2bPincodes.is_airport,
      isHighSecurity: b2bPincodes.is_high_security,
      createdAt: b2bPincodes.created_at,
      updatedAt: b2bPincodes.updated_at,
    })
    .from(b2bPincodes)
    .where(condition)
    .limit(limit)
    .offset(offset)
    .orderBy(orderClause)

  const [{ totalCount }] = await db
    .select({ totalCount: count(b2bPincodes.id) })
    .from(b2bPincodes)
    .where(condition)

  return {
    data,
    pagination: {
      total: Number(totalCount ?? 0),
      page,
      limit,
    },
  }
}

export const createPincode = async (payload: {
  pincode: string
  city: string
  state: string
  zoneId: string
  courierScope?: CourierScope
  flags?: PincodeFlags
}) => {
  const { courierId, serviceProvider } = normalizeCourierScope(payload.courierScope)

  const [record] = await db
    .insert(b2bPincodes)
    .values({
      pincode: payload.pincode.trim(),
      city: payload.city.trim(),
      state: payload.state.trim(),
      zone_id: payload.zoneId,
      courier_id: courierId ?? null,
      service_provider: serviceProvider ?? null,
      is_oda: payload.flags?.isOda ?? false,
      is_remote: payload.flags?.isRemote ?? false,
      is_mall: payload.flags?.isMall ?? false,
      is_sez: payload.flags?.isSez ?? false,
      is_airport: payload.flags?.isAirport ?? false,
      is_high_security: payload.flags?.isHighSecurity ?? false,
    })
    .returning()

  return record
}

export const updatePincode = async (
  id: string,
  payload: Partial<{
    pincode: string
    city: string
    state: string
    zoneId: string
    flags: PincodeFlags
  }> & { courierScope?: CourierScope },
) => {
  const updateData: Record<string, any> = {}
  if (payload.pincode) updateData.pincode = payload.pincode.trim()
  if (payload.city) updateData.city = payload.city.trim()
  if (payload.state) updateData.state = payload.state.trim()
  if (payload.zoneId) updateData.zone_id = payload.zoneId

  if (payload.flags) {
    if (payload.flags.isOda != null) updateData.is_oda = payload.flags.isOda
    if (payload.flags.isRemote != null) updateData.is_remote = payload.flags.isRemote
    if (payload.flags.isMall != null) updateData.is_mall = payload.flags.isMall
    if (payload.flags.isSez != null) updateData.is_sez = payload.flags.isSez
    if (payload.flags.isAirport != null) updateData.is_airport = payload.flags.isAirport
    if (payload.flags.isHighSecurity != null)
      updateData.is_high_security = payload.flags.isHighSecurity
  }

  if (payload.courierScope) {
    const { courierId, serviceProvider } = normalizeCourierScope(payload.courierScope)
    updateData.courier_id = courierId
    updateData.service_provider = serviceProvider
  }

  const [record] = await db
    .update(b2bPincodes)
    .set(updateData)
    .where(eq(b2bPincodes.id, id))
    .returning()

  return record
}

export const deletePincode = async (id: string) => {
  await db.delete(b2bPincodes).where(eq(b2bPincodes.id, id))
}

export const bulkDeletePincodes = async (ids: string[]) => {
  if (!ids.length) return { deleted: 0 }
  const deleted = await db
    .delete(b2bPincodes)
    .where(inArray(b2bPincodes.id, ids))
    .returning({ id: b2bPincodes.id })
  return { deleted: deleted.length }
}

export const bulkMovePincodes = async (ids: string[], targetZoneId: string) => {
  if (!ids.length) return { updated: 0 }
  const updated = await db
    .update(b2bPincodes)
    .set({ zone_id: targetZoneId, updated_at: new Date() })
    .where(inArray(b2bPincodes.id, ids))
    .returning({ id: b2bPincodes.id })
  return { updated: updated.length }
}

export const bulkUpdatePincodeFlags = async (ids: string[], flags: PincodeFlags) => {
  if (!ids.length) return { updated: 0 }

  const updateData: Record<string, any> = {
    updated_at: new Date(),
  }

  // Only update flags that are explicitly provided (not undefined)
  if (flags.isOda !== undefined) updateData.is_oda = flags.isOda
  if (flags.isRemote !== undefined) updateData.is_remote = flags.isRemote
  if (flags.isMall !== undefined) updateData.is_mall = flags.isMall
  if (flags.isSez !== undefined) updateData.is_sez = flags.isSez
  if (flags.isAirport !== undefined) updateData.is_airport = flags.isAirport
  if (flags.isHighSecurity !== undefined) updateData.is_high_security = flags.isHighSecurity

  if (Object.keys(updateData).length === 1) {
    // Only updated_at was set, no flags to update
    return { updated: 0 }
  }

  const updated = await db
    .update(b2bPincodes)
    .set(updateData)
    .where(inArray(b2bPincodes.id, ids))
    .returning({ id: b2bPincodes.id })

  return { updated: updated.length }
}

type PincodeCsvRecord = {
  pincode: string
  zone_code?: string
  zone_id?: string
  is_oda?: string
  is_remote?: string
  is_mall?: string
  is_sez?: string
  is_airport?: string
  is_high_security?: string
  // city and state are optional - will use existing values from DB if not provided
  city?: string
  state?: string
}

const truthy = (value?: string) => {
  if (!value) return false
  return ['1', 'true', 'yes', 'y'].includes(value.toLowerCase())
}

export const importPincodesFromCsv = async (
  fileBuffer: Buffer,
  options: {
    courierScope?: CourierScope
    defaultZoneId?: string
    zoneId?: string // Optional: filter by specific zone
  },
) => {
  const { courierId, serviceProvider } = normalizeCourierScope(options.courierScope)

  const csv = fileBuffer.toString('utf8')

  const parsed = Papa.parse<PincodeCsvRecord>(csv, {
    header: true,
    skipEmptyLines: true,
  })

  if (parsed.errors?.length) {
    throw new Error(`CSV parse error: ${parsed.errors[0].message}`)
  }

  const rows = parsed.data.filter(
    (row) => row.pincode && row.pincode.trim(), // Only require pincode
  )

  const zoneCache = new Map<string, string>()

  const resolveZoneId = async (row: PincodeCsvRecord) => {
    if (row.zone_id) return row.zone_id

    const key = (row.zone_code ?? '').trim().toUpperCase()
    if (!key && options.defaultZoneId) return options.defaultZoneId

    if (!key) throw new Error('Zone code missing for pincode row')

    if (zoneCache.has(key)) return zoneCache.get(key) as string

    const [zone] = await db
      .select({ id: zones.id })
      .from(zones)
      .where(and(eq(zones.code, key), eq(zones.business_type, 'B2B')))
      .limit(1)

    if (!zone) {
      throw new Error(`Zone code ${key} not found`)
    }
    zoneCache.set(key, zone.id)
    return zone.id
  }

  let inserted = 0
  let updated = 0
  const skipped: any[] = []

  for (const row of rows) {
    // For B2B, we need zoneId - use defaultZoneId from options if available
    // Since we're only updating existing pincodes, they already have a zone_id
    // We'll find the pincode first and use its zone_id
    const pincode = row.pincode.trim()

    try {
      // Find existing pincode by pincode only (since we're updating attributes)
      // We need to match by pincode and courier scope
      const whereConditions: any[] = [eq(b2bPincodes.pincode, pincode)]

      if (courierId) {
        whereConditions.push(eq(b2bPincodes.courier_id, courierId))
      } else {
        whereConditions.push(isNull(b2bPincodes.courier_id))
      }

      if (serviceProvider) {
        whereConditions.push(eq(b2bPincodes.service_provider, serviceProvider))
      } else {
        whereConditions.push(isNull(b2bPincodes.service_provider))
      }

      // Add zone filter if provided
      if (options.zoneId) {
        whereConditions.push(eq(b2bPincodes.zone_id, options.zoneId))
      }

      const [existing] = await db
        .select({
          id: b2bPincodes.id,
          city: b2bPincodes.city,
          state: b2bPincodes.state,
          zone_id: b2bPincodes.zone_id,
        })
        .from(b2bPincodes)
        .where(and(...whereConditions))
        .limit(1)

      if (existing) {
        // Update existing pincode attributes
        // Only update city/state if provided in CSV, otherwise keep existing values
        const updateData: any = {
          is_oda: truthy(row.is_oda),
          is_remote: truthy(row.is_remote),
          is_mall: truthy(row.is_mall),
          is_sez: truthy(row.is_sez),
          is_airport: truthy(row.is_airport),
          is_high_security: truthy(row.is_high_security),
          updated_at: new Date(),
        }

        // Only update city/state if provided in CSV
        if (row.city?.trim()) {
          updateData.city = row.city.trim()
        }
        if (row.state?.trim()) {
          updateData.state = row.state.trim()
        }

        await db.update(b2bPincodes).set(updateData).where(eq(b2bPincodes.id, existing.id))
        updated += 1
      } else {
        // Skip new pincodes - only update existing ones
        skipped.push({
          row,
          error: `Pincode ${pincode} not found. Only existing pincodes can be updated.`,
        })
      }
    } catch (err: any) {
      skipped.push({ row, error: err.message })
    }
  }

  return { inserted, updated, skipped, total: inserted + updated }
}

// -----------------------------
// Zone-to-Zone Rates
// -----------------------------

export const listZoneToZoneRates = async (params: {
  courierScope?: CourierScope
  originZoneId?: string
  destinationZoneId?: string
  planId?: string
}) => {
  // Early validation - check at function entry before try block
  if (typeof b2bZoneToZoneRates === 'undefined' || b2bZoneToZoneRates === null) {
    const errorMsg =
      'b2bZoneToZoneRates table schema is not defined. ' +
      'This usually means:\n' +
      '1. The schema file was not properly compiled/loaded\n' +
      '2. There is a circular dependency issue\n' +
      '3. The server needs to be restarted\n' +
      'Please check the import path and ensure the server has been restarted.'
    console.error('CRITICAL ERROR:', errorMsg)
    console.error('Import path: ../schema/zones')
    console.error('Expected export: b2bZoneToZoneRates')
    throw new Error(errorMsg)
  }

  try {
    // Validate table has required properties
    if (!b2bZoneToZoneRates.id) {
      console.error('ERROR: b2bZoneToZoneRates.id is undefined. Table object:', b2bZoneToZoneRates)
      throw new Error(
        'b2bZoneToZoneRates.id is undefined. The table schema may not be properly initialized. Please restart the server.',
      )
    }

    const { courierId, serviceProvider } = normalizeCourierScope(params.courierScope)

    const filters: SQLWrapper[] = []

    if (params.originZoneId) {
      if (!b2bZoneToZoneRates.origin_zone_id) {
        throw new Error('b2bZoneToZoneRates.origin_zone_id is undefined')
      }
      filters.push(eq(b2bZoneToZoneRates.origin_zone_id, params.originZoneId))
    }
    if (params.destinationZoneId) {
      if (!b2bZoneToZoneRates.destination_zone_id) {
        throw new Error('b2bZoneToZoneRates.destination_zone_id is undefined')
      }
      filters.push(eq(b2bZoneToZoneRates.destination_zone_id, params.destinationZoneId))
    }

    // Handle plan_id filtering
    // Note: plan_id column will be available after migration is run
    // For now, we skip plan filtering if the column doesn't exist in the database
    // We'll check this by trying to use it, and if it fails, we'll retry without it
    let shouldFilterByPlan = false
    if (b2bZoneToZoneRates.plan_id) {
      if (params.planId) {
        shouldFilterByPlan = true
        filters.push(eq(b2bZoneToZoneRates.plan_id, params.planId))
      } else {
        // If no plan_id provided, only show rates without plan_id (generic rates)
        shouldFilterByPlan = true
        filters.push(isNull(b2bZoneToZoneRates.plan_id))
      }
    }

    // Handle courier scope filtering
    // Only add filters if we have actual values (not null/undefined)
    if (courierId != null || serviceProvider != null) {
      const courierCondition =
        courierId != null && b2bZoneToZoneRates.courier_id
          ? (eq(b2bZoneToZoneRates.courier_id, courierId) as SQLWrapper)
          : undefined
      const providerCondition =
        serviceProvider != null && b2bZoneToZoneRates.service_provider
          ? (eq(b2bZoneToZoneRates.service_provider, serviceProvider) as SQLWrapper)
          : undefined
      const scopedCondition: SQLWrapper | undefined = courierCondition
        ? providerCondition
          ? (and(courierCondition, providerCondition) as SQLWrapper)
          : courierCondition
        : providerCondition

      if (scopedCondition) {
        filters.push(scopedCondition)
      }
    }

    const condition = filters.length ? and(...filters) : undefined

    // Validate all required table columns exist
    if (!b2bZoneToZoneRates.id) {
      throw new Error('b2bZoneToZoneRates.id is undefined')
    }

    // Build the query step by step to catch any undefined references
    let query = db
      .select({
        id: b2bZoneToZoneRates.id,
        originZoneId: b2bZoneToZoneRates.origin_zone_id,
        destinationZoneId: b2bZoneToZoneRates.destination_zone_id,
        courierId: b2bZoneToZoneRates.courier_id,
        serviceProvider: b2bZoneToZoneRates.service_provider,
        // Rate per kg (only field)
        ratePerKg: b2bZoneToZoneRates.rate_per_kg,
        volumetricFactor: b2bZoneToZoneRates.volumetric_factor,
        // Metadata
        metadata: b2bZoneToZoneRates.metadata,
        createdAt: b2bZoneToZoneRates.created_at,
        updatedAt: b2bZoneToZoneRates.updated_at,
      })
      .from(b2bZoneToZoneRates)

    if (condition) {
      query = query.where(condition) as any
    }

    // Add orderBy only if columns exist
    if (
      b2bZoneToZoneRates.origin_zone_id &&
      b2bZoneToZoneRates.destination_zone_id &&
      b2bZoneToZoneRates.updated_at
    ) {
      query = query.orderBy(
        b2bZoneToZoneRates.origin_zone_id,
        b2bZoneToZoneRates.destination_zone_id,
        desc(b2bZoneToZoneRates.updated_at),
      ) as any
    }

    let rows
    try {
      rows = await query
    } catch (error: any) {
      // If plan_id column doesn't exist yet (migration not run), retry without plan filtering
      const errorMessage = String(error?.message || error?.cause?.message || '')
      const errorCode = String(error?.code || error?.cause?.code || '')
      const isPlanIdError =
        errorMessage.includes('plan_id') ||
        errorCode === '42703' ||
        errorMessage.includes('does not exist') ||
        error?.cause?.code === '42703'

      if (isPlanIdError && shouldFilterByPlan) {
        console.warn(
          '[listZoneToZoneRates] plan_id column not available in database, retrying without plan filter',
        )
        // Rebuild filters without plan_id
        const filtersWithoutPlan: SQLWrapper[] = []
        if (params.originZoneId && b2bZoneToZoneRates.origin_zone_id) {
          filtersWithoutPlan.push(eq(b2bZoneToZoneRates.origin_zone_id, params.originZoneId))
        }
        if (params.destinationZoneId && b2bZoneToZoneRates.destination_zone_id) {
          filtersWithoutPlan.push(
            eq(b2bZoneToZoneRates.destination_zone_id, params.destinationZoneId),
          )
        }
        // Add courier scope filters
        if (courierId != null || serviceProvider != null) {
          const courierCondition =
            courierId != null && b2bZoneToZoneRates.courier_id
              ? (eq(b2bZoneToZoneRates.courier_id, courierId) as SQLWrapper)
              : undefined
          const providerCondition =
            serviceProvider != null && b2bZoneToZoneRates.service_provider
              ? (eq(b2bZoneToZoneRates.service_provider, serviceProvider) as SQLWrapper)
              : undefined
          const scopedCondition: SQLWrapper | undefined = courierCondition
            ? providerCondition
              ? (and(courierCondition, providerCondition) as SQLWrapper)
              : courierCondition
            : providerCondition
          if (scopedCondition) {
            filtersWithoutPlan.push(scopedCondition)
          }
        }
        const conditionWithoutPlan =
          filtersWithoutPlan.length > 0 ? and(...filtersWithoutPlan) : undefined
        let retryQuery = db
          .select({
            id: b2bZoneToZoneRates.id,
            originZoneId: b2bZoneToZoneRates.origin_zone_id,
            destinationZoneId: b2bZoneToZoneRates.destination_zone_id,
            courierId: b2bZoneToZoneRates.courier_id,
            serviceProvider: b2bZoneToZoneRates.service_provider,
            // Core pricing fields
            ratePerKg: b2bZoneToZoneRates.rate_per_kg,
            volumetricFactor: b2bZoneToZoneRates.volumetric_factor,
            // Metadata
            metadata: b2bZoneToZoneRates.metadata,
            createdAt: b2bZoneToZoneRates.created_at,
            updatedAt: b2bZoneToZoneRates.updated_at,
          })
          .from(b2bZoneToZoneRates)
        if (conditionWithoutPlan) {
          retryQuery = retryQuery.where(conditionWithoutPlan) as any
        }
        if (
          b2bZoneToZoneRates.origin_zone_id &&
          b2bZoneToZoneRates.destination_zone_id &&
          b2bZoneToZoneRates.updated_at
        ) {
          retryQuery = retryQuery.orderBy(
            b2bZoneToZoneRates.origin_zone_id,
            b2bZoneToZoneRates.destination_zone_id,
            desc(b2bZoneToZoneRates.updated_at),
          ) as any
        }
        rows = await retryQuery
      } else {
        throw error
      }
    }

    return rows || []
  } catch (error: any) {
    console.error('Error in listZoneToZoneRates:', error)
    console.error('Error stack:', error?.stack)

    // Check if the error is due to missing table (migration not run)
    if (
      error?.message?.includes('does not exist') ||
      error?.message?.includes('relation') ||
      error?.code === '42P01' // PostgreSQL error code for "relation does not exist"
    ) {
      const migrationPath = 'backend/src/drizzle/migrations/0008_b2b_admin_system.sql'
      throw new Error(
        `Database table 'meracourierwala_b2b_zone_to_zone_rates' not found. Please run the migration first.\n` +
          `To run the migration:\n` +
          `1. Using psql: psql $DATABASE_URL -f ${migrationPath}\n` +
          `2. Or connect to your database and run the SQL file: ${migrationPath}`,
      )
    }
    throw error
  }
}

export const upsertZoneToZoneRate = async (payload: {
  id?: string
  originZoneId: string
  destinationZoneId: string
  ratePerKg: number // Only field needed - rate per kg
  volumetricFactor?: number
  courierScope?: CourierScope
  planId?: string | null
}) => {
  // Validate required fields
  if (!payload.originZoneId || !payload.destinationZoneId) {
    throw new Error('Origin zone ID and destination zone ID are required')
  }

  if (payload.ratePerKg == null || isNaN(Number(payload.ratePerKg))) {
    throw new Error('Rate per kg is required and must be a valid number')
  }

  const { courierId, serviceProvider } = normalizeCourierScope(payload.courierScope)

  try {
    // If an explicit ID is provided, prefer a direct update on that record.
    // This avoids surprises where composite lookup might hit a different row.
    if (payload.id) {
      // Verify that both zones exist
      const [originZone, destZone] = await Promise.all([
        db.select().from(zones).where(eq(zones.id, payload.originZoneId)).limit(1),
        db.select().from(zones).where(eq(zones.id, payload.destinationZoneId)).limit(1),
      ])

      if (!originZone[0]) {
        throw new Error(`Origin zone not found: ${payload.originZoneId}`)
      }

      if (!destZone[0]) {
        throw new Error(`Destination zone not found: ${payload.destinationZoneId}`)
      }

      const updateData: any = {
        origin_zone_id: payload.originZoneId,
        destination_zone_id: payload.destinationZoneId,
        rate_per_kg: payload.ratePerKg.toString(),
        updated_at: new Date(),
      }

      // Note: we deliberately DO NOT change courier_id, service_provider or plan_id when editing by id.
      // Those scopes are considered part of the identity of the rate and are controlled by how the user
      // filters/selects rates in the UI.

      const [updated] = await db
        .update(b2bZoneToZoneRates)
        .set(updateData)
        .where(eq(b2bZoneToZoneRates.id, payload.id))
        .returning()

      if (!updated) {
        throw new Error(`Zone rate not found for id ${payload.id}`)
      }

      return updated
    }

    // Verify that both zones exist
    const [originZone, destZone] = await Promise.all([
      db.select().from(zones).where(eq(zones.id, payload.originZoneId)).limit(1),
      db.select().from(zones).where(eq(zones.id, payload.destinationZoneId)).limit(1),
    ])

    if (!originZone[0]) {
      throw new Error(`Origin zone not found: ${payload.originZoneId}`)
    }

    if (!destZone[0]) {
      throw new Error(`Destination zone not found: ${payload.destinationZoneId}`)
    }
    // Check if record exists first (handles NULL values properly)
    const whereConditions = [
      eq(b2bZoneToZoneRates.origin_zone_id, payload.originZoneId),
      eq(b2bZoneToZoneRates.destination_zone_id, payload.destinationZoneId),
    ]

    if (courierId != null) {
      whereConditions.push(eq(b2bZoneToZoneRates.courier_id, courierId))
    } else {
      whereConditions.push(isNull(b2bZoneToZoneRates.courier_id))
    }

    if (serviceProvider != null) {
      whereConditions.push(eq(b2bZoneToZoneRates.service_provider, serviceProvider))
    } else {
      whereConditions.push(isNull(b2bZoneToZoneRates.service_provider))
    }

    // Plan-scoped rates: if planId provided, match on that; otherwise scope to NULL plan_id
    if (payload.planId) {
      whereConditions.push(eq(b2bZoneToZoneRates.plan_id, payload.planId))
    } else {
      whereConditions.push(isNull(b2bZoneToZoneRates.plan_id))
    }

    const [existing] = await db
      .select()
      .from(b2bZoneToZoneRates)
      .where(and(...whereConditions))
      .limit(1)

    const updateData = {
      rate_per_kg: payload.ratePerKg.toString(),
      plan_id: payload.planId ?? null,
      updated_at: new Date(),
    }

    let record
    if (existing) {
      // Update existing record
      const [updated] = await db
        .update(b2bZoneToZoneRates)
        .set(updateData)
        .where(eq(b2bZoneToZoneRates.id, existing.id))
        .returning()
      record = updated
    } else {
      // Insert new record
      const [inserted] = await db
        .insert(b2bZoneToZoneRates)
        .values({
          origin_zone_id: payload.originZoneId,
          destination_zone_id: payload.destinationZoneId,
          rate_per_kg: payload.ratePerKg.toString(),
          courier_id: courierId,
          service_provider: serviceProvider,
          plan_id: payload.planId ?? null,
        })
        .returning()
      record = inserted
    }

    if (!record) {
      throw new Error('Failed to upsert zone rate: no record returned from database')
    }

    return record
  } catch (error: any) {
    console.error('[upsertZoneToZoneRate] Error:', {
      error: error?.message,
      stack: error?.stack,
      code: error?.code,
      payload: {
        originZoneId: payload.originZoneId,
        destinationZoneId: payload.destinationZoneId,
        ratePerKg: payload.ratePerKg,
        courierId,
        serviceProvider,
        planId: payload.planId ?? null,
      },
    })

    // Check if the error is due to missing table (migration not run)
    if (
      error?.message?.includes('does not exist') ||
      error?.message?.includes('relation') ||
      error?.code === '42P01' // PostgreSQL error code for "relation does not exist"
    ) {
      const migrationPath = 'backend/src/drizzle/migrations/0008_b2b_admin_system.sql'
      throw new Error(
        `Database table 'meracourierwala_b2b_zone_to_zone_rates' not found. Please run the migration first.\n` +
          `To run the migration:\n` +
          `1. Using psql: psql $DATABASE_URL -f ${migrationPath}\n` +
          `2. Or connect to your database and run the SQL file: ${migrationPath}`,
      )
    }

    // Check for foreign key constraint errors
    if (error?.code === '23503' || error?.message?.includes('foreign key')) {
      throw new Error(
        `Invalid zone ID(s). Please ensure both origin and destination zones exist. Origin: ${payload.originZoneId}, Destination: ${payload.destinationZoneId}`,
      )
    }

    // Check for unique constraint errors
    if (error?.code === '23505' || error?.message?.includes('unique constraint')) {
      throw new Error(
        'A rate already exists for this zone pair and courier combination. Please update the existing rate instead.',
      )
    }

    // Re-throw with a more user-friendly message if it's a database query error
    if (error?.message?.includes('Failed query') || error?.message?.includes('query')) {
      throw new Error(
        `Database error while saving rate: ${error.message}. Please check that the zones exist and try again.`,
      )
    }

    throw error instanceof Error ? error : new Error(String(error))
  }
}

export const deleteZoneToZoneRate = async (id: string) => {
  await db.delete(b2bZoneToZoneRates).where(eq(b2bZoneToZoneRates.id, id))
}

type ZoneRateCsvRecord = {
  origin_zone_code: string
  destination_zone_code: string
  rate_per_kg: string
  min_charge?: string
  max_weight_limit?: string
}

export const importZoneRatesFromCsv = async (
  fileBuffer: Buffer,
  options: {
    courierScope?: CourierScope
  },
) => {
  const csv = fileBuffer.toString('utf8')
  const parsed = Papa.parse<ZoneRateCsvRecord>(csv, {
    header: true,
    skipEmptyLines: true,
  })

  if (parsed.errors?.length) {
    throw new Error(`CSV parse error: ${parsed.errors[0].message}`)
  }

  const rows = parsed.data.filter((row) => row.origin_zone_code && row.destination_zone_code)
  const zoneCache = new Map<string, string>()

  const resolveZoneId = async (code: string) => {
    const key = code.trim().toUpperCase()
    if (zoneCache.has(key)) return zoneCache.get(key) as string

    const [zone] = await db
      .select({ id: zones.id })
      .from(zones)
      .where(and(eq(zones.code, key), eq(zones.business_type, 'B2B')))
      .limit(1)

    if (!zone) throw new Error(`Zone code ${key} not found`)

    zoneCache.set(key, zone.id)
    return zone.id
  }

  let inserted = 0
  const skipped: any[] = []

  for (const row of rows) {
    try {
      const originZoneId = await resolveZoneId(row.origin_zone_code)
      const destinationZoneId = await resolveZoneId(row.destination_zone_code)

      await upsertZoneToZoneRate({
        originZoneId,
        destinationZoneId,
        ratePerKg: Number(row.rate_per_kg),
        courierScope: options.courierScope,
      })

      inserted += 1
    } catch (err: any) {
      skipped.push({ row, error: err.message })
    }
  }

  return { inserted, skipped }
}

// -----------------------------
// Overhead Rules
// -----------------------------

export const listOverheadRules = async (
  params: {
    courierScope?: CourierScope
    includeGlobal?: boolean
    onlyActive?: boolean
    effectiveDate?: Date
    planId?: string
  } = {},
) => {
  const { courierId, serviceProvider } = normalizeCourierScope(params.courierScope)
  const includeGlobal = params.includeGlobal ?? true
  const onlyActive = params.onlyActive ?? false
  const effectiveDate = params.effectiveDate ?? new Date()

  const filters: SQLWrapper[] = [eq(b2bOverheadRules.business_type, 'B2B')]

  if (onlyActive) filters.push(eq(b2bOverheadRules.is_active, true))

  // Filter by effective dates
  filters.push(
    or(
      isNull(b2bOverheadRules.effective_from),
      lte(b2bOverheadRules.effective_from, effectiveDate),
    ) as SQLWrapper,
  )
  filters.push(
    or(
      isNull(b2bOverheadRules.effective_to),
      gte(b2bOverheadRules.effective_to, effectiveDate),
    ) as SQLWrapper,
  )

  if (courierId || serviceProvider) {
    const courierCondition = courierId
      ? (eq(b2bOverheadRules.courier_id, courierId) as SQLWrapper)
      : undefined
    const providerCondition = serviceProvider
      ? (eq(b2bOverheadRules.service_provider, serviceProvider) as SQLWrapper)
      : undefined
    const scopedCondition: SQLWrapper | undefined = courierCondition
      ? providerCondition
        ? (and(courierCondition, providerCondition) as SQLWrapper)
        : courierCondition
      : providerCondition
    if (scopedCondition) {
      const combinedFilter = includeGlobal
        ? (or(isNull(b2bOverheadRules.courier_id), scopedCondition) as SQLWrapper)
        : scopedCondition
      filters.push(combinedFilter)
    } else if (!includeGlobal) {
      filters.push(isNull(b2bOverheadRules.courier_id) as SQLWrapper)
    }
  } else if (!includeGlobal) {
    filters.push(isNull(b2bOverheadRules.courier_id) as SQLWrapper)
  }

  // Build base filters (without plan_id)
  const baseFilters: SQLWrapper[] = [...filters]
  let planIdFilterAdded = false

  // Handle plan_id filtering - include rules with matching plan_id OR null plan_id (global rules)
  if (params.planId) {
    baseFilters.push(
      or(
        eq(b2bOverheadRules.plan_id, params.planId),
        isNull(b2bOverheadRules.plan_id),
      ) as SQLWrapper,
    )
    planIdFilterAdded = true
  }

  const condition = baseFilters.length ? and(...baseFilters) : undefined

  try {
    const rows = await db
      .select()
      .from(b2bOverheadRules)
      .where(condition)
      .orderBy(b2bOverheadRules.priority, desc(b2bOverheadRules.updated_at))

    return rows
  } catch (error: any) {
    // Check if error is related to plan_id column not existing
    const errorMessage = error?.message || error?.cause?.message || ''
    const errorCode = error?.code || error?.cause?.code || ''
    const errorDetail = error?.cause?.detail || ''

    console.error('[listOverheadRules] Query failed:', {
      message: errorMessage,
      code: errorCode,
      detail: errorDetail,
      cause: error?.cause,
    })

    // If plan_id column doesn't exist (migration not run), retry without plan_id filter
    if (
      (errorMessage.includes('plan_id') ||
        errorMessage.includes('does not exist') ||
        errorCode === '42703' ||
        errorMessage.includes('Failed query') ||
        errorDetail.includes('plan_id')) &&
      planIdFilterAdded
    ) {
      console.warn(
        '[listOverheadRules] plan_id column not found or query failed, retrying without plan filter. Error:',
        errorMessage,
        'Detail:',
        errorDetail,
      )

      // Use original filters (without plan_id filter)
      const conditionWithoutPlan = filters.length ? and(...filters) : undefined

      try {
        // Explicitly select all columns except plan_id (which doesn't exist in DB)
        const rows = await db
          .select({
            id: b2bOverheadRules.id,
            code: b2bOverheadRules.code,
            name: b2bOverheadRules.name,
            description: b2bOverheadRules.description,
            type: b2bOverheadRules.type,
            amount: b2bOverheadRules.amount,
            percent: b2bOverheadRules.percent,
            applies_to: b2bOverheadRules.applies_to,
            condition: b2bOverheadRules.condition,
            priority: b2bOverheadRules.priority,
            courier_id: b2bOverheadRules.courier_id,
            service_provider: b2bOverheadRules.service_provider,
            business_type: b2bOverheadRules.business_type,
            effective_from: b2bOverheadRules.effective_from,
            effective_to: b2bOverheadRules.effective_to,
            is_active: b2bOverheadRules.is_active,
            metadata: b2bOverheadRules.metadata,
            created_at: b2bOverheadRules.created_at,
            updated_at: b2bOverheadRules.updated_at,
          })
          .from(b2bOverheadRules)
          .where(conditionWithoutPlan)
          .orderBy(b2bOverheadRules.priority, desc(b2bOverheadRules.updated_at))

        // Map results and add plan_id as null to match expected type
        return rows.map((row: any) => ({
          ...row,
          plan_id: null,
        })) as any
      } catch (retryError: any) {
        console.error('[listOverheadRules] Retry also failed:', {
          message: retryError?.message,
          cause: retryError?.cause?.message,
          code: retryError?.code || retryError?.cause?.code,
          detail: retryError?.cause?.detail,
          stack: retryError?.stack,
        })
        // If retry also fails, return empty array to prevent API crash
        // This can happen if the table structure is different than expected
        console.warn('[listOverheadRules] Returning empty array due to query failure')
        return []
      }
    }
    throw error
  }
}

// Helper function to check if a surcharge rule overlaps with Additional Charges
const checkOverlapWithAdditionalCharges = (
  code: string | undefined,
  name: string,
  type: string,
  condition: string | object | null | undefined,
): { overlaps: boolean; message: string } => {
  const codeUpper = code?.toUpperCase() || ''
  const nameUpper = name.toUpperCase()

  // Check for AWB charge overlap
  if (type === 'flat_awb' || codeUpper.includes('AWB') || nameUpper.includes('AWB')) {
    return {
      overlaps: true,
      message:
        'AWB charge is already configured in Additional Charges. Use Additional Charges instead to avoid double-charging.',
    }
  }

  // Check for fuel surcharge overlap
  if (
    (type === 'percent' && (codeUpper.includes('FUEL') || nameUpper.includes('FUEL'))) ||
    codeUpper === 'FUEL_SURCHARGE'
  ) {
    return {
      overlaps: true,
      message:
        'Fuel surcharge is already configured in Additional Charges. Use Additional Charges instead to avoid double-charging.',
    }
  }

  // Check for ODA charge overlap
  if (
    codeUpper.includes('ODA') ||
    nameUpper.includes('ODA') ||
    (condition &&
      (typeof condition === 'string'
        ? condition.includes('oda') || condition.includes('ODA')
        : JSON.stringify(condition).toUpperCase().includes('ODA')))
  ) {
    return {
      overlaps: true,
      message:
        'ODA charge is already configured in Additional Charges. Use Additional Charges instead to avoid double-charging.',
    }
  }

  // Check for COD charge overlap
  if (
    codeUpper.includes('COD') ||
    nameUpper.includes('COD') ||
    (condition &&
      (typeof condition === 'string'
        ? condition.includes('cod') ||
          condition.includes('COD') ||
          condition.includes('paymentMode')
        : JSON.stringify(condition).toUpperCase().includes('COD')))
  ) {
    return {
      overlaps: true,
      message:
        'COD charge is already configured in Additional Charges. Use Additional Charges instead to avoid double-charging.',
    }
  }

  // Check for ROV charge overlap
  if (codeUpper.includes('ROV') || nameUpper.includes('ROV')) {
    return {
      overlaps: true,
      message:
        'ROV charge is already configured in Additional Charges. Use Additional Charges instead to avoid double-charging.',
    }
  }

  // Check for insurance overlap
  if (codeUpper.includes('INSURANCE') || nameUpper.includes('INSURANCE')) {
    return {
      overlaps: true,
      message:
        'Insurance is already configured in Additional Charges. Use Additional Charges instead to avoid double-charging.',
    }
  }

  // Check for mall delivery overlap
  if (
    codeUpper.includes('MALL') ||
    nameUpper.includes('MALL') ||
    (condition &&
      (typeof condition === 'string'
        ? condition.includes('mall') || condition.includes('MALL')
        : JSON.stringify(condition).toUpperCase().includes('MALL')))
  ) {
    return {
      overlaps: true,
      message:
        'Mall delivery charge is already configured in Additional Charges. Use Additional Charges instead to avoid double-charging.',
    }
  }

  // Check for handling charge overlap
  if (codeUpper.includes('HANDLING') || nameUpper.includes('HANDLING')) {
    return {
      overlaps: true,
      message:
        'Handling charges are already configured in Additional Charges. Use Additional Charges instead to avoid double-charging.',
    }
  }

  // Check for attempt charge overlap
  if (codeUpper.includes('ATTEMPT') || nameUpper.includes('ATTEMPT')) {
    return {
      overlaps: true,
      message:
        'Attempt charge is already configured in Additional Charges. Use Additional Charges instead to avoid double-charging.',
    }
  }

  // Check for demurrage overlap
  if (
    codeUpper.includes('DEMURRAGE') ||
    nameUpper.includes('DEMURRAGE') ||
    type === 'per_awb_day'
  ) {
    return {
      overlaps: true,
      message:
        'Demurrage is already configured in Additional Charges. Use Additional Charges instead to avoid double-charging.',
    }
  }

  // Check for time-specific delivery overlap
  if (codeUpper.includes('TIME_SPECIFIC') || nameUpper.includes('TIME SPECIFIC')) {
    return {
      overlaps: true,
      message:
        'Time-specific delivery charge is already configured in Additional Charges. Use Additional Charges instead to avoid double-charging.',
    }
  }

  return { overlaps: false, message: '' }
}

export const upsertOverheadRule = async (payload: {
  id?: string
  code?: string
  name: string
  description?: string
  type: 'flat_awb' | 'flat' | 'percent' | 'per_kg' | 'per_awb_day'
  amount?: number
  percent?: number
  appliesTo?: 'freight' | 'final' | 'cod' | 'all'
  condition?: string | object
  priority?: number
  effectiveFrom?: Date
  effectiveTo?: Date
  isActive?: boolean
  courierScope?: CourierScope
  planId?: string
}) => {
  // Check for overlap with Additional Charges
  const overlapCheck = checkOverlapWithAdditionalCharges(
    payload.code,
    payload.name,
    payload.type,
    payload.condition,
  )

  if (overlapCheck.overlaps) {
    throw new Error(overlapCheck.message)
  }

  const { courierId, serviceProvider } = normalizeCourierScope(payload.courierScope)

  const conditionValue =
    typeof payload.condition === 'string'
      ? payload.condition
      : payload.condition
      ? JSON.stringify(payload.condition)
      : null

  if (payload.id) {
    const updateData: any = {
      name: payload.name,
      description: payload.description,
      type: payload.type,
      applies_to: payload.appliesTo ?? 'freight',
      condition: conditionValue,
      is_active: payload.isActive ?? true,
      courier_id: courierId,
      service_provider: serviceProvider,
      updated_at: new Date(),
    }

    if (payload.code) updateData.code = payload.code
    if (payload.amount !== undefined) updateData.amount = payload.amount.toString()
    if (payload.percent !== undefined) updateData.percent = payload.percent.toString()
    if (payload.priority !== undefined) updateData.priority = payload.priority
    if (payload.effectiveFrom) updateData.effective_from = payload.effectiveFrom
    if (payload.effectiveTo) updateData.effective_to = payload.effectiveTo
    if (payload.planId) updateData.plan_id = payload.planId

    const [record] = await db
      .update(b2bOverheadRules)
      .set(updateData)
      .where(eq(b2bOverheadRules.id, payload.id))
      .returning()

    return record
  }

  const insertData: any = {
    name: payload.name,
    description: payload.description,
    type: payload.type,
    applies_to: payload.appliesTo ?? 'freight',
    condition: conditionValue,
    is_active: payload.isActive ?? true,
    courier_id: courierId,
    service_provider: serviceProvider,
  }

  if (payload.code) insertData.code = payload.code
  if (payload.amount !== undefined) insertData.amount = payload.amount.toString()
  if (payload.percent !== undefined) insertData.percent = payload.percent.toString()
  if (payload.priority !== undefined) insertData.priority = payload.priority
  if (payload.effectiveFrom) insertData.effective_from = payload.effectiveFrom
  if (payload.effectiveTo) insertData.effective_to = payload.effectiveTo

  const [record] = await db
    .insert(b2bOverheadRules)
    .values(insertData)
    .onConflictDoUpdate({
      target: [
        b2bOverheadRules.code,
        b2bOverheadRules.courier_id,
        b2bOverheadRules.service_provider,
      ],
      set: {
        name: payload.name,
        description: payload.description,
        type: payload.type,
        amount: payload.amount !== undefined ? payload.amount.toString() : undefined,
        percent: payload.percent !== undefined ? payload.percent.toString() : undefined,
        applies_to: payload.appliesTo ?? 'freight',
        condition: conditionValue,
        priority: payload.priority,
        is_active: payload.isActive ?? true,
        updated_at: new Date(),
        plan_id: payload.planId ?? undefined,
      },
    })
    .returning()

  return record
}

export const deleteOverheadRule = async (id: string) => {
  await db.delete(b2bOverheadRules).where(eq(b2bOverheadRules.id, id))
}

// -----------------------------
// Rate Calculation
// -----------------------------

// Helper function to fetch tracking events by AWB number or order ID
const fetchTrackingEvents = async (params: {
  orderId?: string
  awbNumber?: string
}): Promise<
  Array<{
    status_code?: string
    status_text?: string
    location?: string
    created_at?: Date | string
    timestamp?: Date | string
  }>
> => {
  if (!params.orderId && !params.awbNumber) {
    return []
  }

  try {
    // Fetch tracking events by AWB number (works for both B2C and B2B)
    if (params.awbNumber) {
      const events = await db
        .select({
          status_code: tracking_events.status_code,
          status_text: tracking_events.status_text,
          location: tracking_events.location,
          created_at: tracking_events.created_at,
        })
        .from(tracking_events)
        .where(eq(tracking_events.awb_number, params.awbNumber))
        .orderBy(asc(tracking_events.created_at))

      return events.map((e) => ({
        status_code: e.status_code || undefined,
        status_text: e.status_text || undefined,
        location: e.location || undefined,
        created_at: e.created_at || undefined,
        timestamp: e.created_at || undefined, // Alias for compatibility
      }))
    }

    // Fetch tracking events by order ID (B2C orders)
    if (params.orderId) {
      const events = await db
        .select({
          status_code: tracking_events.status_code,
          status_text: tracking_events.status_text,
          location: tracking_events.location,
          created_at: tracking_events.created_at,
        })
        .from(tracking_events)
        .where(eq(tracking_events.order_id, params.orderId))
        .orderBy(asc(tracking_events.created_at))

      return events.map((e) => ({
        status_code: e.status_code || undefined,
        status_text: e.status_text || undefined,
        location: e.location || undefined,
        created_at: e.created_at || undefined,
        timestamp: e.created_at || undefined, // Alias for compatibility
      }))
    }

    return []
  } catch (error) {
    console.error('Error fetching tracking events:', error)
    return []
  }
}

export const calculateB2BChargeableWeight = (params: {
  weightKg: number
  length?: number
  width?: number
  height?: number
  cftFactor: number
}) => {
  const { weightKg, length, width, height, cftFactor } = params

  // Calculate volumetric weight if dimensions provided
  let volumetricWeight = weightKg
  if (length && width && height) {
    const volumeCm3 = length * width * height
    volumetricWeight = volumeCm3 / cftFactor
  }

  // Billable weight is max of actual and volumetric (ALWAYS applies)
  const billableWeight = Math.max(weightKg, volumetricWeight)

  return { billableWeight, volumetricWeight }
}

export const calculateB2BRate = async (params: {
  originPincode: string
  destinationPincode: string
  weightKg: number
  length?: number // in cm
  width?: number // in cm
  height?: number // in cm
  invoiceValue?: number
  paymentMode?: 'COD' | 'PREPAID'
  courierScope?: CourierScope
  effectiveDate?: Date
  isSinglePiece?: boolean // If true, applies single piece handling charge instead of weight-based
  pieceCount?: number // Number of pieces in shipment (if 1, isSinglePiece should be true)
  orderId?: string // Optional: B2C order ID to fetch tracking events
  awbNumber?: string // Optional: AWB number to fetch tracking events
  trackingEvents?: Array<{
    status_code?: string // e.g., 'ndr', 'undelivered', 'delivered', 'rto', etc.
    status_text?: string // e.g., 'NDR', 'Delivery Attempt Failed', etc.
    location?: string
    created_at?: Date | string // Event timestamp
    timestamp?: Date | string // Alternative timestamp field
  }> // Optional: Tracking events for demurrage calculation (if not provided, will fetch from DB using orderId/awbNumber)
  pickupDate?: Date | string // Optional: Pickup date for holiday charge calculation (YYYY-MM-DD or Date object)
  deliveryTime?: string // Optional: Delivery time window (e.g., "11AM", "9AM-11AM", "before 11AM") - if provided, applies time-specific delivery charge
  deliveryAddress?: string // Optional: Delivery address - used to detect CSD locations via keywords
  planId?: string // Optional: Plan ID to fetch plan-specific additional charges
}) => {
  const { courierId, serviceProvider } = normalizeCourierScope(params.courierScope)
  const effectiveDate = params.effectiveDate ?? new Date()

  // Fetch tracking events if not provided but orderId/awbNumber is available
  let trackingEvents = params.trackingEvents
  if (!trackingEvents && (params.orderId || params.awbNumber)) {
    trackingEvents = await fetchTrackingEvents({
      orderId: params.orderId,
      awbNumber: params.awbNumber,
    })
  }

  const origin = await findZoneForPincode(params.originPincode, { courierId, serviceProvider })
  const destination = await findZoneForPincode(params.destinationPincode, {
    courierId,
    serviceProvider,
  })

  if (!origin) {
    throw new Error(`No zone mapping found for origin pincode ${params.originPincode}`)
  }
  if (!destination) {
    throw new Error(`No zone mapping found for destination pincode ${params.destinationPincode}`)
  }

  const rate = await findZoneRate({
    originZoneId: origin.zoneId,
    destinationZoneId: destination.zoneId,
    courierId,
    serviceProvider,
    effectiveDate,
  })

  if (!rate) {
    throw new Error('No zone-to-zone rate configured for the selected courier')
  }

  // Fetch admin-controlled additional charges first (needed for CFT factor)
  // Always use database values - no hardcoded fallbacks
  // Fetch charges according to plan_id if provided (charges are saved for specific plans)
  const additionalCharges = await getAdditionalCharges({
    courierScope: { courierId, serviceProvider },
    includeGlobal: true,
    planId: params.planId,
  })

  // If no charges configured, throw error - admin must configure charges
  if (!additionalCharges) {
    throw new Error(
      'Additional charges not configured. Please configure charges in the admin panel before calculating rates.',
    )
  }

  // CFT Factor - ALWAYS used in weight calculation
  // Formula: volumetricWeight = (L × B × H) / cftFactor
  // chargeableWeight = max(volumetricWeight, actualWeight)
  const cftFactor = Number(additionalCharges.cft_factor || 5000) // Default to 5000 if not configured

  // Use shared helper for weight calculation
  const { billableWeight, volumetricWeight } = calculateB2BChargeableWeight({
    weightKg: params.weightKg,
    length: params.length,
    width: params.width,
    height: params.height,
    cftFactor,
  })

  // Fetch admin-controlled pricing flags (if needed)

  // Calculate base freight
  let baseFreight = 0

  // Calculate base freight using rate per kg only
  if (rate.rate_per_kg) {
    baseFreight = Number(rate.rate_per_kg) * billableWeight
  } else {
    throw new Error('Rate per kg is required for B2B pricing')
  }

  // Minimum Chargeable - ALWAYS applied after calculating freight
  // Condition: "₹200 OR 10kg × rate/kg" (admin selectable method: whichever_is_higher or whichever_is_lower)
  // Formula:
  //   minChargeByAmount = minimum_chargeable_amount (e.g., ₹200)
  //   minChargeByWeight = minimum_chargeable_weight × rate_per_kg (e.g., 10kg × rate/kg)
  //   minimumCharge = max(minChargeByAmount, minChargeByWeight) if method is "whichever_is_higher"
  //   minimumCharge = min(minChargeByAmount, minChargeByWeight) if method is "whichever_is_lower"
  //   baseFreight = max(baseFreight, minimumCharge)
  const minChargeAmount = Number(additionalCharges.minimum_chargeable_amount || 0)
  const minChargeWeight = Number(additionalCharges.minimum_chargeable_weight || 0)
  const minChargeMethod = additionalCharges.minimum_chargeable_method || 'whichever_is_higher'

  // Calculate both values
  const minChargeByAmount = minChargeAmount
  const minChargeByWeight =
    rate.rate_per_kg && minChargeWeight > 0 ? Number(rate.rate_per_kg) * minChargeWeight : 0

  // Apply selected method to determine minimum charge
  let minimumCharge = 0
  if (minChargeMethod === 'whichever_is_lower') {
    // Take whichever is lower (but only if both are > 0)
    if (minChargeByAmount > 0 && minChargeByWeight > 0) {
      minimumCharge = Math.min(minChargeByAmount, minChargeByWeight)
    } else if (minChargeByAmount > 0) {
      minimumCharge = minChargeByAmount
    } else if (minChargeByWeight > 0) {
      minimumCharge = minChargeByWeight
    }
  } else {
    // Default: whichever is higher
    minimumCharge = Math.max(minChargeByAmount, minChargeByWeight)
  }

  // Apply minimum charge to base freight (ALWAYS - if baseFreight < minimumCharge, set to minimumCharge)
  if (minimumCharge > 0 && baseFreight < minimumCharge) {
    baseFreight = minimumCharge
  }

  // Get active overhead rules for the effective date
  const overheadRules = await listOverheadRules({
    courierScope: {
      courierId: courierId ?? undefined,
      serviceProvider: serviceProvider ?? undefined,
    },
    includeGlobal: true,
    onlyActive: true,
    effectiveDate,
  })

  // Sort by priority
  overheadRules.sort((a: any, b: any) => (a.priority ?? 0) - (b.priority ?? 0))

  // Check if pickup date is a holiday (Sunday or in holiday list)
  // Fetch state from pincode for holiday checking
  let pickupState: string | undefined = undefined
  if (params.originPincode) {
    try {
      const [pincodeData] = await db
        .select({ state: b2bPincodes.state })
        .from(b2bPincodes)
        .where(eq(b2bPincodes.pincode, params.originPincode))
        .limit(1)
      pickupState = pincodeData?.state || undefined
    } catch (error) {
      console.error('Error fetching state from pincode:', error)
    }
  }

  let isHoliday = false
  if (params.pickupDate) {
    try {
      isHoliday = await checkHolidayCharge(params.pickupDate, {
        pickupState: pickupState,
        courierScope: { courierId, serviceProvider },
      })
    } catch (error) {
      console.error('Error checking holiday:', error)
      // Default to false if check fails
      isHoliday = false
    }
  }

  // Helper function to check if address contains CSD keywords
  const checkCsdKeywords = (address: string | undefined): boolean => {
    if (!address) return false
    const addressUpper = address.toUpperCase()
    const csdKeywords = [
      'CSD',
      'CANTEEN STORES DEPARTMENT',
      'ARMY CANTEEN',
      'NAVY CANTEEN',
      'AIR FORCE CANTEEN',
      'DEFENCE CANTEEN',
    ]
    return csdKeywords.some((keyword) => addressUpper.includes(keyword))
  }

  // CSD detection: Check pincode flag OR address keywords
  const isCsdByPincode = origin.isCsd || destination.isCsd
  const isCsdByAddress = checkCsdKeywords(params.deliveryAddress)
  const isCsd = isCsdByPincode || isCsdByAddress

  const context = {
    paymentMode: (params.paymentMode ?? 'PREPAID').toUpperCase(),
    isOda: destination.isOda, // ODA charges apply only if destination pincode is ODA
    isRemote: origin.isRemote || destination.isRemote,
    isSez: origin.isSez || destination.isSez,
    isAirport: origin.isAirport || destination.isAirport,
    isHighSecurity: origin.isHighSecurity || destination.isHighSecurity,
    isMall: destination.isMall, // Mall delivery charges apply only if destination pincode is a mall
    isCsd: isCsd, // CSD: pincode flag OR address contains CSD keywords
    isHoliday: isHoliday,
    isExpress: false, // TODO: Add support for express delivery flag
    isTimeSpecific: params.deliveryTime ? true : false, // Apply if delivery time window is provided from frontend
    isFragile: false, // TODO: Add support for fragile items flag
    isInsurance: false, // TODO: Add support for insurance flag
    courierId: courierId || null,
    origin,
    destination,
    weightKg: params.weightKg,
    billableWeight,
    volumetricWeight,
    invoiceValue: params.invoiceValue ?? 0,
    baseFreight,
  }

  let runningTotal = baseFreight
  const overheadBreakdown: {
    id: string
    code?: string
    name: string
    type: string
    amount: number
    description?: string
  }[] = []

  // Demurrage variables (declared outside charges block for return statement access)
  let demurrageCharge = 0
  let demurrageBreakdown: any = {
    applied: false,
    storageStartDate: null,
    storageEndDate: null,
    storedDays: 0,
    freeStorageDays: 0,
    extraDays: 0,
    method: null,
    amount: 0,
  }

  // Helper function to calculate dual-value charges based on admin-configured method
  const calculateDualValueCharge = (
    perAWB: number,
    perKg: number,
    weight: number,
    method: string | null | undefined,
  ): number => {
    const calculationMethod = method || 'whichever_is_higher'
    const perKgTotal = perKg * weight

    switch (calculationMethod) {
      case 'whichever_is_higher':
        return Math.max(perAWB, perKgTotal)
      case 'whichever_is_lower':
        return Math.min(perAWB, perKgTotal)
      case 'sum':
        return perAWB + perKgTotal
      case 'per_awb_only':
        return perAWB
      case 'per_kg_only':
        return perKgTotal
      default:
        return Math.max(perAWB, perKgTotal) // Default to whichever is higher
    }
  }

  // Apply admin-controlled overhead charges (always from database)
  // Using exact 20 fields from requirements
  {
    // AWB Charges - ALWAYS applies to every shipment created
    // Condition: "Per AWB / LR Fee"
    // This is a flat administrative charge for generating the LR/AWB number
    if (additionalCharges.awb_charges) {
      const awbCharge = Number(additionalCharges.awb_charges || 0)
      if (awbCharge > 0) {
        overheadBreakdown.push({
          id: 'awb_charges',
          code: 'AWB',
          name: 'AWB Charges',
          type: 'flat',
          amount: awbCharge,
        })
        runningTotal += awbCharge
      }
    }

    // Public Holiday Pickup Charge - condition: "Rs Additional"
    if (context.isHoliday && additionalCharges.public_holiday_pickup_charge) {
      const holidayPickupCharge = Number(additionalCharges.public_holiday_pickup_charge || 0)
      if (holidayPickupCharge > 0) {
        overheadBreakdown.push({
          id: 'public_holiday_pickup_charge',
          code: 'HOLIDAY_PICKUP',
          name: 'Public Holiday Pickup Charge',
          type: 'flat',
          amount: holidayPickupCharge,
        })
        runningTotal += holidayPickupCharge
      }
    }

    // Green Tax - ALWAYS applies per AWB as an environmental compliance fee
    // Condition: "Per AWB environmental compliance fee" (unless set to 0 or disabled)
    if (additionalCharges.green_tax) {
      const greenTaxCharge = Number(additionalCharges.green_tax || 0)
      if (greenTaxCharge > 0) {
        overheadBreakdown.push({
          id: 'green_tax',
          code: 'GREEN_TAX',
          name: 'Green Tax',
          type: 'flat',
          amount: greenTaxCharge,
        })
        runningTotal += greenTaxCharge
      }
    }

    // Fuel Surcharge Percentage - ALWAYS applies to every shipment (COD or Prepaid, B2B or B2C)
    // Condition: "% on basic freight"
    // Formula: fuelSurcharge = (basicFreight * fuelPercentage) / 100
    // This is a mandatory courier fee to cover diesel/air-fuel price fluctuations
    if (additionalCharges.fuel_surcharge_percentage) {
      const fuelSurcharge =
        (baseFreight * Number(additionalCharges.fuel_surcharge_percentage)) / 100
      if (fuelSurcharge > 0) {
        overheadBreakdown.push({
          id: 'fuel_surcharge',
          code: 'FUEL_SURCHARGE',
          name: 'Fuel Surcharge',
          type: 'percent',
          amount: fuelSurcharge,
        })
        runningTotal += fuelSurcharge
      }
    }

    // ODA Charges - Per AWB OR Per KG (using method provided by admin)
    // Apply if: destination pincode is ODA (Out of Delivery Area)
    if (context.isOda && billableWeight > 0) {
      const odaPerAwb = Number(additionalCharges.oda_charges || 0)
      const odaPerKg = Number(additionalCharges.oda_per_kg_charge || 0)
      const odaByWeight = odaPerKg * billableWeight
      const odaMethod = additionalCharges.oda_method || 'whichever_is_higher'
      // Apply selected method: Per AWB OR Per KG based on admin configuration
      const odaCharge =
        odaMethod === 'whichever_is_lower'
          ? Math.min(odaPerAwb, odaByWeight)
          : Math.max(odaPerAwb, odaByWeight)
      if (odaCharge > 0) {
        overheadBreakdown.push({
          id: 'oda_charge',
          code: 'ODA',
          name: 'ODA Charges',
          type: 'flat',
          amount: odaCharge,
        })
        runningTotal += odaCharge
      }
    }

    // CSD Delivery Charge - Always flat per AWB
    // Apply if:
    //   1. Delivery address belongs to CSD (Canteen Stores Department), OR
    //   2. Admin marks pincode as isCsd, OR
    //   3. Address contains keywords like "CSD", "Army Canteen", etc.
    if (context.isCsd && additionalCharges.csd_delivery_charge) {
      const csdCharge = Number(additionalCharges.csd_delivery_charge || 0)
      if (csdCharge > 0) {
        overheadBreakdown.push({
          id: 'csd_delivery_charge',
          code: 'CSD',
          name: 'CSD Delivery Charge',
          type: 'flat',
          amount: csdCharge,
        })
        runningTotal += csdCharge
      }
    }

    // Time Specific Delivery Charge
    // Apply if: Sender/buyer requests a specific delivery time window (e.g., deliver before 11AM)
    // Formula: charge = max(perKg × weight, perAwb)
    if (context.isTimeSpecific && billableWeight > 0) {
      const timeSpecificPerKg = Number(additionalCharges.time_specific_per_kg || 0)
      const timeSpecificPerAwb = Number(additionalCharges.time_specific_per_awb || 500)
      const timeSpecificByWeight = timeSpecificPerKg * billableWeight
      const timeSpecificMethod = additionalCharges.time_specific_method || 'whichever_is_higher'
      // Apply selected method: max(perKg × weight, perAwb) or min based on admin configuration
      const timeSpecificCharge =
        timeSpecificMethod === 'whichever_is_lower'
          ? Math.min(timeSpecificByWeight, timeSpecificPerAwb)
          : Math.max(timeSpecificByWeight, timeSpecificPerAwb)
      if (timeSpecificCharge > 0) {
        overheadBreakdown.push({
          id: 'time_specific_delivery_charge',
          code: 'TIME_SPECIFIC',
          name: 'Time Specific Delivery Charge',
          type: 'flat',
          amount: timeSpecificCharge,
        })
        runningTotal += timeSpecificCharge
      }
    }

    // Mall Delivery Charge - Per AWB OR Per KG (according to calculation method from admin)
    // Apply if: Destination is a mall and courier needs security check-in, dock entry, gate pass etc.
    if (context.isMall && billableWeight > 0) {
      const mallPerKg = Number(additionalCharges.mall_delivery_per_kg || 0)
      const mallPerAwb = Number(additionalCharges.mall_delivery_per_awb || 500)
      const mallByWeight = mallPerKg * billableWeight
      const mallMethod = additionalCharges.mall_delivery_method || 'whichever_is_higher'
      // Apply selected method: Per AWB OR Per KG based on admin configuration
      const mallCharge =
        mallMethod === 'whichever_is_lower'
          ? Math.min(mallByWeight, mallPerAwb)
          : Math.max(mallByWeight, mallPerAwb)
      if (mallCharge > 0) {
        overheadBreakdown.push({
          id: 'mall_delivery_charge',
          code: 'MALL_DELIVERY',
          name: 'Mall Delivery Charge',
          type: 'flat',
          amount: mallCharge,
        })
        runningTotal += mallCharge
      }
    }

    // Delivery Reattempt Charge - Per AWB OR Per KG (according to admin calculation method)
    // Apply if:
    //   1. First delivery attempt fails due to customer or address issue
    //   2. Courier attempts a second or third reattempt
    //   3. Reason falls under NDR codes (customer not available, future delivery request, etc.)
    // Logic: Count NDR events - if 2 or more, it means at least one reattempt occurred
    if (trackingEvents && trackingEvents.length > 0 && billableWeight > 0) {
      // Define NDR events (same as demurrage logic)
      const NDR_EVENTS = [
        'ndr',
        'undelivered',
        'delivery_attempt_failed',
        'door_closed',
        'address_issue',
        'attempt_failed',
        'customer_not_available',
        'door_locked',
        'future_delivery_requested',
        'consignee_refused',
        'attempt_undelivered',
        'delivery_rescheduled',
        'shipment_held',
      ]

      // Count NDR events from tracking events
      let ndrEventCount = 0
      for (const event of trackingEvents) {
        const eventCode = (event.status_code || '').toLowerCase()
        const eventText = (event.status_text || '').toLowerCase()
        const matchesNdr = NDR_EVENTS.some(
          (ndr) => eventCode.includes(ndr) || eventText.includes(ndr),
        )
        if (matchesNdr) {
          ndrEventCount++
        }
      }

      // Apply reattempt charge if there are 2 or more NDR events (first failure + at least one reattempt)
      if (ndrEventCount >= 2) {
        const reattemptPerKg = Number(additionalCharges.delivery_reattempt_per_kg || 0)
        const reattemptPerAwb = Number(additionalCharges.delivery_reattempt_per_awb || 500)
        const reattemptByWeight = reattemptPerKg * billableWeight
        const reattemptMethod = additionalCharges.delivery_reattempt_method || 'whichever_is_higher'
        // Apply selected method: Per AWB OR Per KG based on admin configuration
        const reattemptCharge =
          reattemptMethod === 'whichever_is_lower'
            ? Math.min(reattemptByWeight, reattemptPerAwb)
            : Math.max(reattemptByWeight, reattemptPerAwb)
        if (reattemptCharge > 0) {
          overheadBreakdown.push({
            id: 'delivery_reattempt_charge',
            code: 'REATTEMPT',
            name: 'Delivery Reattempt Charge',
            type: 'flat',
            amount: reattemptCharge,
          })
          runningTotal += reattemptCharge
        }
      }
    }

    // Handling Charges - single piece or weight-based slabs
    {
      let handlingCharge = 0
      let handlingLabel = 'Handling Charge'

      // Single Piece Handling Charge
      // Apply only when: numberOfPieces === 1
      const numberOfPieces = params.pieceCount ?? (params.isSinglePiece ? 1 : undefined)
      const isSinglePiece = numberOfPieces === 1

      if (isSinglePiece && additionalCharges.handling_single_piece) {
        // Apply single piece handling charge
        handlingCharge = Number(additionalCharges.handling_single_piece)
        handlingLabel = 'Handling Charge (Single Piece)'
      } else {
        // Handling by Weight - Always flat per AWB
        // Apply based on billable weight (max of volumetric weight or actual weight)
        // Weight slabs:
        //   weight < 100kg    → handlingBelow100Kg
        //   weight 100–200kg  → handling100To200Kg
        //   weight > 200kg    → handlingAbove200Kg
        if (billableWeight < 100 && additionalCharges.handling_below_100_kg) {
          // Applied when billable weight < 100 kg
          handlingCharge = Number(additionalCharges.handling_below_100_kg)
          handlingLabel = 'Handling Charge (< 100 kg)'
        } else if (
          billableWeight >= 100 &&
          billableWeight <= 200 &&
          additionalCharges.handling_100_to_200_kg
        ) {
          // Applied when billable weight is 100–200 kg
          handlingCharge = Number(additionalCharges.handling_100_to_200_kg)
          handlingLabel = 'Handling Charge (100-200 kg)'
        } else if (billableWeight > 200 && additionalCharges.handling_above_200_kg) {
          // Applied when billable weight > 200 kg
          handlingCharge = Number(additionalCharges.handling_above_200_kg)
          handlingLabel = 'Handling Charge (> 200 kg)'
        }
      }

      if (handlingCharge > 0) {
        overheadBreakdown.push({
          id: 'handling_charge',
          code: 'HANDLING',
          name: handlingLabel,
          type: 'flat',
          amount: handlingCharge,
        })
        runningTotal += handlingCharge
      }
    }

    // COD Charges
    // Apply only if: payment_mode = COD
    // Formula: max(codFixedAmount, invoiceValue × (codPercentage / 100))
    // Formula according to admin added calculation method
    if (params.paymentMode === 'COD') {
      const codFixedAmount = Number(additionalCharges.cod_fixed_amount || 50)
      const codPercentage = Number(additionalCharges.cod_percentage || 1)
      const codMethod = additionalCharges.cod_method || 'whichever_is_higher'

      const codByFixed = codFixedAmount
      // Calculate percentage-based COD if invoiceValue is provided, otherwise use 0
      const codByPercentage = params.invoiceValue ? (params.invoiceValue * codPercentage) / 100 : 0

      // Apply selected method: max(codFixedAmount, invoiceValue × (codPercentage / 100)) or min based on admin configuration
      const codCharge =
        codMethod === 'whichever_is_lower'
          ? Math.min(codByFixed, codByPercentage || codByFixed)
          : Math.max(codByFixed, codByPercentage)

      if (codCharge > 0) {
        overheadBreakdown.push({
          id: 'cod_charge',
          code: 'COD',
          name: 'COD Charge',
          type: 'flat',
          amount: codCharge,
        })
        runningTotal += codCharge
      }
    }

    // ROV Charges (Risk On Value)
    // Apply ONLY IF: declaredValue > 0, regardless of COD or prepaid
    // Formula: max(rovFixedAmount, declaredValue × (rovPercentage / 100))
    // min or max according to admin configured calculation method
    if (params.invoiceValue && params.invoiceValue > 0) {
      const rovFixedAmount = Number(additionalCharges.rov_fixed_amount || 100)
      const rovPercentage = Number(additionalCharges.rov_percentage || 0.5)
      const rovMethod = additionalCharges.rov_method || 'whichever_is_higher'

      const rovByFixed = rovFixedAmount
      const rovByPercentage = (params.invoiceValue * rovPercentage) / 100

      // Apply selected method: max(rovFixedAmount, declaredValue × (rovPercentage / 100)) or min based on admin configuration
      const rovCharge =
        rovMethod === 'whichever_is_lower'
          ? Math.min(rovByFixed, rovByPercentage)
          : Math.max(rovByFixed, rovByPercentage)

      if (rovCharge > 0) {
        overheadBreakdown.push({
          id: 'rov_charge',
          code: 'ROV',
          name: 'ROV Charge',
          type: 'flat',
          amount: rovCharge,
        })
        runningTotal += rovCharge
      }
    }

    // Insurance Charge - DISABLED for B2B rate calculation
    // if (context.isInsurance && additionalCharges.insurance_charge) {
    //   const insuranceCharge = Number(additionalCharges.insurance_charge || 0)
    //   if (insuranceCharge > 0) {
    //     overheadBreakdown.push({
    //       id: 'insurance_charge',
    //       code: 'INSURANCE',
    //       name: 'Insurance Charge',
    //       type: 'flat',
    //       amount: insuranceCharge,
    //     })
    //     runningTotal += insuranceCharge
    //   }
    // }

    // Liability Charge - DISABLED for B2B rate calculation
    // if (params.invoiceValue) {
    //   const liabilityLimit = Number(additionalCharges.liability_limit || 5000)
    //   const liabilityMethod = additionalCharges.liability_method || 'whichever_is_lower'
    //
    //   const liabilityByLimit = liabilityLimit
    //   const liabilityByActual = params.invoiceValue
    //
    //   // Apply selected method
    //   const liabilityCharge =
    //     liabilityMethod === 'whichever_is_higher'
    //       ? Math.max(liabilityByLimit, liabilityByActual)
    //       : Math.min(liabilityByLimit, liabilityByActual)
    //
    //   if (liabilityCharge > 0) {
    //     overheadBreakdown.push({
    //       id: 'liability_charge',
    //       code: 'LIABILITY',
    //       name: 'Liability Charge',
    //       type: 'flat',
    //       amount: liabilityCharge,
    //     })
    //     // Note: Liability is typically a limit, not an additional charge
    //     // This might need to be handled differently based on business logic
    //   }
    // }

    // Demurrage Charges - Event-based Storage & Demurrage logic
    // Apply ONLY IF:
    //   1. Shipment fails delivery (NDR raised) - storage starts on first NDR date
    //   2. Shipment stays in courier warehouse longer than freeStorageDays
    // Storage ends on: delivery / RTO / customer-requested date
    // If storedDays <= freeStorageDays → no demurrage
    // Else: extraDays × (perAwb/day OR perKg/day × weight) according to admin method
    if (trackingEvents && trackingEvents.length > 0) {
      // Define NDR events that start storage (aligned with existing NDR detection logic)
      // Storage starts on: first NDR date
      const NDR_EVENTS = [
        'ndr',
        'undelivered',
        'delivery_attempt_failed',
        'door_closed',
        'address_issue',
        'attempt_failed',
        'customer_not_available',
        'door_locked',
        'future_delivery_requested',
        'consignee_refused',
        'attempt_undelivered',
        'delivery_rescheduled',
        'shipment_held',
      ]

      // Define events that end storage
      // Storage ends on: delivery / RTO / customer-requested date
      const END_EVENTS = [
        'delivered',
        'rto',
        'rto_delivered',
        'rto_in_transit',
        'return_created',
        'return_initiated',
        'disposed',
        'cancelled',
        'canceled',
      ]

      // Sort events by timestamp (oldest first), filter out events without timestamps
      const sortedEvents = [...trackingEvents]
        .filter((e) => e.timestamp || e.created_at)
        .sort((a, b) => {
          const timestampA = a.timestamp || a.created_at
          const timestampB = b.timestamp || b.created_at
          if (!timestampA || !timestampB) return 0
          const dateA = timestampA instanceof Date ? timestampA : new Date(timestampA)
          const dateB = timestampB instanceof Date ? timestampB : new Date(timestampB)
          return dateA.getTime() - dateB.getTime()
        })

      // 1. Find storage start date (first NDR event)
      let storageStartDate: Date | null = null
      for (const event of sortedEvents) {
        const eventCode = (event.status_code || '').toLowerCase()
        const eventText = (event.status_text || '').toLowerCase()
        const matchesNdr = NDR_EVENTS.some(
          (ndr) => eventCode.includes(ndr) || eventText.includes(ndr),
        )

        if (matchesNdr) {
          const timestamp = event.timestamp || event.created_at
          if (timestamp) {
            storageStartDate = timestamp instanceof Date ? timestamp : new Date(timestamp)
            break
          }
        }
      }

      // 2. Find storage end date (earliest END event, or current date if none)
      let storageEndDate: Date | null = null
      for (const event of sortedEvents) {
        const eventCode = (event.status_code || '').toLowerCase()
        const eventText = (event.status_text || '').toLowerCase()
        const matchesEnd = END_EVENTS.some(
          (end) => eventCode.includes(end) || eventText.includes(end),
        )

        if (matchesEnd) {
          const timestamp = event.timestamp || event.created_at
          if (timestamp) {
            storageEndDate = timestamp instanceof Date ? timestamp : new Date(timestamp)
            break
          }
        }
      }

      // If no end event found, use current date (shipment still held)
      if (!storageEndDate) {
        storageEndDate = new Date()
      }

      // 3. Calculate stored days
      if (storageStartDate) {
        const timeDiff = storageEndDate.getTime() - storageStartDate.getTime()
        const storedDays = Math.ceil(timeDiff / 86400000) // 86400000 ms = 1 day

        // 4. Apply free storage logic
        // Free Storage Days - Days courier stores the shipment for free after first NDR or hold
        const freeStorageDays = Number(additionalCharges.free_storage_days || 5)
        const extraDays = storedDays - freeStorageDays

        // If storedDays <= freeStorageDays → no demurrage
        if (storedDays > 0 && extraDays > 0) {
          // 5. Compute demurrage based on admin method
          // Formula: extraDays × (perAwb/day OR perKg/day × weight)
          const demurragePerAwbDay = Number(additionalCharges.demurrage_per_awb_day || 0)
          const demurragePerKgDay = Number(additionalCharges.demurrage_per_kg_day || 0)
          const demurrageMethod = additionalCharges.demurrage_method || 'per_awb_day'

          if (demurrageMethod === 'per_awb_day') {
            // Per AWB per day method
            demurrageCharge = extraDays * demurragePerAwbDay
          } else if (demurrageMethod === 'per_kg_day') {
            // Per Kg per day method
            demurrageCharge = extraDays * demurragePerKgDay * billableWeight
          } else {
            // Default: per_awb_day
            demurrageCharge = extraDays * demurragePerAwbDay
          }

          // Build demurrage breakdown
          demurrageBreakdown = {
            applied: demurrageCharge > 0,
            storageStartDate: storageStartDate.toISOString(),
            storageEndDate: storageEndDate.toISOString(),
            storedDays,
            freeStorageDays,
            extraDays: Math.max(extraDays, 0),
            method: demurrageMethod,
            amount: demurrageCharge,
          }

          // Add to overhead breakdown if charge > 0
          if (demurrageCharge > 0) {
            overheadBreakdown.push({
              id: 'demurrage_charge',
              code: 'DEMURRAGE',
              name: `Demurrage Charge (${extraDays} extra days)`,
              type: 'flat',
              amount: demurrageCharge,
            })
            runningTotal += demurrageCharge
          }
        } else {
          // No demurrage (within free storage period or no storage)
          demurrageBreakdown = {
            applied: false,
            storageStartDate: storageStartDate ? storageStartDate.toISOString() : null,
            storageEndDate: storageEndDate ? storageEndDate.toISOString() : null,
            storedDays: storedDays > 0 ? storedDays : 0,
            freeStorageDays,
            extraDays: 0,
            method: additionalCharges.demurrage_method || null,
            amount: 0,
          }
        }
      }
    }

    // Minimum chargeable amount (admin-controlled) - already applied above in base freight calculation

    // Apply custom fields (admin-defined charges)
    if (additionalCharges.custom_fields && typeof additionalCharges.custom_fields === 'object') {
      for (const [fieldKey, fieldValue] of Object.entries(additionalCharges.custom_fields)) {
        const fieldDefRaw = additionalCharges.field_definitions?.[fieldKey]
        const fieldDef = fieldDefRaw && typeof fieldDefRaw === 'object' ? fieldDefRaw : {}
        const chargeName = (fieldDef as any)?.label || fieldKey.replace(/([A-Z])/g, ' $1').trim()
        const fieldType = (fieldDef as any)?.fieldType || 'single'
        const chargeType = (fieldDef as any)?.chargeType || 'flat'
        const appliesTo = (fieldDef as any)?.appliesTo || 'total'

        // Check if field should be applied based on condition
        if ((fieldDef as any)?.condition) {
          // TODO: Implement condition evaluation if needed
          // For now, skip if condition exists (can be enhanced later)
          continue
        }

        let customCharge = 0

        if (fieldType === 'dual') {
          // Dual-value field (per AWB + per Kg)
          const fieldValueObj = fieldValue && typeof fieldValue === 'object' ? fieldValue : {}
          const perAWB = Number(
            (fieldValueObj as any)?.perAWB || (fieldValueObj as any)?.per_awb || 0,
          )
          const perKg = Number((fieldValueObj as any)?.perKg || (fieldValueObj as any)?.per_kg || 0)
          const calculationMethod = (fieldDef as any)?.calculationMethod || 'whichever_is_higher'

          customCharge = calculateDualValueCharge(perAWB, perKg, billableWeight, calculationMethod)
        } else {
          // Single-value field
          customCharge = Number(fieldValue || 0)

          // Apply charge type logic
          if (chargeType === 'percent' && appliesTo === 'freight') {
            customCharge = (baseFreight * customCharge) / 100
          } else if (chargeType === 'percent' && appliesTo === 'total') {
            customCharge = (runningTotal * customCharge) / 100
          } else if (chargeType === 'per_kg') {
            customCharge = customCharge * billableWeight
          }
          // 'flat' type uses the value as-is
        }

        if (customCharge > 0) {
          overheadBreakdown.push({
            id: `custom_${fieldKey}`,
            code: fieldKey.toUpperCase(),
            name: chargeName,
            type: chargeType,
            amount: customCharge,
          })
          runningTotal += customCharge
        }
      }
    }
  }

  // Apply overhead rules (legacy system, still supported)
  for (const rule of overheadRules) {
    if (!ruleApplies(rule, context)) continue

    const amount = computeOverheadAmount(rule, {
      baseFreight,
      currentTotal: runningTotal,
      weightKg: params.weightKg,
      billableWeight,
      invoiceValue: params.invoiceValue ?? 0,
    })

    if (amount === 0) continue

    overheadBreakdown.push({
      id: rule.id,
      code: rule.code ?? undefined,
      name: rule.name,
      type: rule.type,
      amount,
      description: rule.description ?? undefined,
    })

    runningTotal += amount
  }

  return {
    origin,
    destination,
    rate,
    calculation: {
      actualWeight: params.weightKg,
      volumetricWeight,
      billableWeight,
      volumetricDivisor: cftFactor,
      usedVolumetric: volumetricWeight > params.weightKg,
    },
    charges: {
      baseFreight,
      overheads: overheadBreakdown,
      demurrage: demurrageCharge,
      total: runningTotal,
    },
    breakdown: {
      demurrage: demurrageBreakdown,
    },
    config: {
      additionalCharges: additionalCharges
        ? {
            awbCharges: Number(additionalCharges.awb_charges || 0),
            fuelSurchargePercentage: Number(additionalCharges.fuel_surcharge_percentage || 0),
            odaCharges: Number(additionalCharges.oda_charges || 0),
            odaPerKgCharge: Number(additionalCharges.oda_per_kg_charge || 0),
            codFixedAmount: Number(additionalCharges.cod_fixed_amount || 50),
            codPercentage: Number(additionalCharges.cod_percentage || 1),
            rovFixedAmount: Number(additionalCharges.rov_fixed_amount || 100),
            rovPercentage: Number(additionalCharges.rov_percentage || 0.5),
            liabilityLimit: Number(additionalCharges.liability_limit || 5000),
            cftFactor: Number(additionalCharges.cft_factor || 5),
          }
        : null,
      volumetricDivisor: cftFactor, // Uses CFT factor from additional charges configuration
    },
  }
}

export type ZoneLookupResult = {
  zoneId: string
  zoneCode: string
  zoneName: string
  isOda: boolean
  isRemote: boolean
  isMall: boolean
  isSez: boolean
  isAirport: boolean
  isHighSecurity: boolean
  isCsd: boolean
}

export const findZoneForPincode = async (
  pincode: string,
  scope: { courierId: number | null; serviceProvider: string | null },
): Promise<ZoneLookupResult | null> => {
  const prioritizedScopes: (CourierScope | null)[] = [
    {
      courierId: scope.courierId ?? undefined,
      serviceProvider: scope.serviceProvider ?? undefined,
    },
    { courierId: undefined, serviceProvider: scope.serviceProvider ?? undefined },
    null,
  ]

  for (const currentScope of prioritizedScopes) {
    const { courierId, serviceProvider } = normalizeCourierScope(currentScope ?? undefined)

    const [row] = await db
      .select({
        id: b2bPincodes.id,
        zoneId: b2bPincodes.zone_id,
        isOda: b2bPincodes.is_oda,
        isRemote: b2bPincodes.is_remote,
        isMall: b2bPincodes.is_mall,
        isSez: b2bPincodes.is_sez,
        isAirport: b2bPincodes.is_airport,
        isHighSecurity: b2bPincodes.is_high_security,
        isCsd: b2bPincodes.is_csd,
        zoneCode: zones.code,
        zoneName: zones.name,
      })
      .from(b2bPincodes)
      .innerJoin(zones, eq(zones.id, b2bPincodes.zone_id))
      .where(
        and(
          eq(zones.business_type, 'B2B'),
          eq(b2bPincodes.pincode, pincode),
          courierId ? eq(b2bPincodes.courier_id, courierId) : isNull(b2bPincodes.courier_id),
          serviceProvider
            ? eq(b2bPincodes.service_provider, serviceProvider)
            : isNull(b2bPincodes.service_provider),
        ),
      )
      .limit(1)

    if (row) {
      return {
        zoneId: row.zoneId,
        zoneCode: row.zoneCode,
        zoneName: row.zoneName,
        isOda: row.isOda,
        isRemote: row.isRemote,
        isMall: row.isMall,
        isSez: row.isSez,
        isAirport: row.isAirport,
        isHighSecurity: row.isHighSecurity,
        isCsd: row.isCsd,
      }
    }
  }

  return null
}

export const findZoneRate = async (params: {
  originZoneId: string
  destinationZoneId: string
  courierId: number | null
  serviceProvider: string | null
  effectiveDate?: Date
}) => {
  const effectiveDate = params.effectiveDate ?? new Date()
  const scopes: (CourierScope | null)[] = [
    {
      courierId: params.courierId ?? undefined,
      serviceProvider: params.serviceProvider ?? undefined,
    },
    { courierId: undefined, serviceProvider: params.serviceProvider ?? undefined },
    null,
  ]

  for (const scope of scopes) {
    const { courierId, serviceProvider } = normalizeCourierScope(scope ?? undefined)

    const [row] = await db
      .select()
      .from(b2bZoneToZoneRates)
      .where(
        and(
          eq(b2bZoneToZoneRates.origin_zone_id, params.originZoneId),
          eq(b2bZoneToZoneRates.destination_zone_id, params.destinationZoneId),
          eq(b2bZoneToZoneRates.is_active, true),
          or(
            isNull(b2bZoneToZoneRates.effective_from),
            lte(b2bZoneToZoneRates.effective_from, effectiveDate),
          ),
          or(
            isNull(b2bZoneToZoneRates.effective_to),
            gte(b2bZoneToZoneRates.effective_to, effectiveDate),
          ),
          courierId
            ? eq(b2bZoneToZoneRates.courier_id, courierId)
            : isNull(b2bZoneToZoneRates.courier_id),
          serviceProvider
            ? eq(b2bZoneToZoneRates.service_provider, serviceProvider)
            : isNull(b2bZoneToZoneRates.service_provider),
        ),
      )
      .orderBy(desc(b2bZoneToZoneRates.effective_from))
      .limit(1)

    if (row) return row
  }

  return null
}

const ruleApplies = (
  rule: typeof b2bOverheadRules.$inferSelect,
  context: {
    paymentMode: string
    isOda: boolean
    isRemote: boolean
    isSez: boolean
    isAirport: boolean
    isHighSecurity: boolean
    isMall: boolean
    isHoliday?: boolean
    isExpress?: boolean
    isTimeSpecific?: boolean
    isFragile?: boolean
    isInsurance?: boolean
    courierId?: number | null
    weightKg: number
    billableWeight: number
    invoiceValue: number
    origin: ZoneLookupResult
    destination: ZoneLookupResult
  },
) => {
  if (!rule.condition) return true

  // Support both JSONB and text-based conditions
  let conditionObj: any = null

  if (typeof rule.condition === 'object' && rule.condition !== null) {
    // JSONB condition
    conditionObj = rule.condition
  } else if (typeof rule.condition === 'string') {
    // Try to parse as JSON first
    try {
      conditionObj = JSON.parse(rule.condition)
    } catch {
      // Fall back to text-based parsing (legacy format)
      const conditions = rule.condition
        .split('&')
        .map((part) => part.trim())
        .filter(Boolean)

      for (const condition of conditions) {
        const [lhsRaw, rhsRaw] = condition.split('=').map((v) => v?.trim())
        if (!lhsRaw) continue

        const lhs = lhsRaw.toLowerCase()
        const rhs = rhsRaw?.toLowerCase()

        switch (lhs) {
          case 'paymentmode':
            if (rhs && rhs !== context.paymentMode.toLowerCase()) {
              return false
            }
            break
          case 'is_oda':
            if (rhs === 'true' && !context.isOda) return false
            if (rhs === 'false' && context.isOda) return false
            break
          case 'is_remote':
            if (rhs === 'true' && !context.isRemote) return false
            if (rhs === 'false' && context.isRemote) return false
            break
          case 'is_sez':
            if (rhs === 'true' && !context.isSez) return false
            if (rhs === 'false' && context.isSez) return false
            break
          case 'is_airport':
            if (rhs === 'true' && !context.isAirport) return false
            if (rhs === 'false' && context.isAirport) return false
            break
          case 'is_high_security':
            if (rhs === 'true' && !context.isHighSecurity) return false
            if (rhs === 'false' && context.isHighSecurity) return false
            break
          case 'min_weight':
            if (rhs && context.weightKg < Number(rhs)) return false
            break
          case 'max_weight':
            if (rhs && context.weightKg > Number(rhs)) return false
            break
          default:
            break
        }
      }
      return true
    }
  }

  // JSONB condition evaluation
  if (conditionObj) {
    if (conditionObj.paymentMode && conditionObj.paymentMode !== context.paymentMode) {
      return false
    }
    if (conditionObj.oda === true && !context.isOda) return false
    if (conditionObj.oda === false && context.isOda) return false
    if (conditionObj.remote === true && !context.isRemote) return false
    if (conditionObj.remote === false && context.isRemote) return false
    if (conditionObj.sez === true && !context.isSez) return false
    if (conditionObj.sez === false && context.isSez) return false
    if (conditionObj.airport === true && !context.isAirport) return false
    if (conditionObj.airport === false && context.isAirport) return false
    if (conditionObj.highSecurity === true && !context.isHighSecurity) return false
    if (conditionObj.highSecurity === false && context.isHighSecurity) return false
    if (conditionObj.mall === true && !context.isMall) return false
    if (conditionObj.mall === false && context.isMall) return false
    if (conditionObj.min_weight && context.billableWeight < Number(conditionObj.min_weight)) {
      return false
    }
    if (conditionObj.max_weight && context.billableWeight > Number(conditionObj.max_weight)) {
      return false
    }
    if (conditionObj.zones && Array.isArray(conditionObj.zones)) {
      const originZone = context.origin.zoneCode
      const destZone = context.destination.zoneCode
      const applicableZones = conditionObj.zones.map((z: string) => z.toUpperCase())
      if (
        !applicableZones.includes(originZone) &&
        !applicableZones.includes(destZone) &&
        !applicableZones.includes(`${originZone}-${destZone}`)
      ) {
        return false
      }
    }
    // New condition fields
    if (conditionObj.isHoliday === true && !context.isHoliday) return false
    if (conditionObj.isHoliday === false && context.isHoliday) return false
    if (conditionObj.isExpress === true && !context.isExpress) return false
    if (conditionObj.isExpress === false && context.isExpress) return false
    if (conditionObj.isTimeSpecific === true && !context.isTimeSpecific) return false
    if (conditionObj.isTimeSpecific === false && context.isTimeSpecific) return false
    if (conditionObj.isFragile === true && !context.isFragile) return false
    if (conditionObj.isFragile === false && context.isFragile) return false
    if (conditionObj.isInsurance === true && !context.isInsurance) return false
    if (conditionObj.isInsurance === false && context.isInsurance) return false
    if (conditionObj.minValue && context.invoiceValue < Number(conditionObj.minValue)) {
      return false
    }
    if (conditionObj.maxValue && context.invoiceValue > Number(conditionObj.maxValue)) {
      return false
    }
    if (conditionObj.courierId && context.courierId !== Number(conditionObj.courierId)) {
      return false
    }
  }

  return true
}

const computeOverheadAmount = (
  rule: typeof b2bOverheadRules.$inferSelect,
  context: {
    baseFreight: number
    currentTotal: number
    weightKg: number
    billableWeight: number
    invoiceValue: number
  },
) => {
  const appliesOn = rule.applies_to?.toLowerCase() ?? 'freight'

  switch (rule.type) {
    case 'flat_awb':
      return Number(rule.amount ?? 0)
    case 'flat':
      return Number(rule.amount ?? 0)
    case 'percent': {
      const percent = Number(rule.percent ?? 0)
      let base = context.baseFreight
      if (appliesOn === 'total') base = context.currentTotal
      else if (appliesOn === 'cod' && context.invoiceValue > 0) {
        // For COD charges, can apply on invoice value
        base = context.invoiceValue
      }
      return (base * percent) / 100
    }
    case 'per_kg':
      const perKgRate = Number(rule.amount ?? 0)
      return perKgRate * context.billableWeight
    case 'per_awb_day':
      // This would need additional context (days in storage)
      return Number(rule.amount ?? 0)
    default:
      return 0
  }
}

export const bulkUpsertZoneRates = async (
  rates: Array<{
    originZoneId: string
    destinationZoneId: string
    ratePerKg: number // Only rate per kg needed
    volumetricFactor?: number
    effectiveFrom?: Date
    effectiveTo?: Date
  }>,
  courierScope?: CourierScope,
) => {
  const { courierId, serviceProvider } = normalizeCourierScope(courierScope)
  const results = []

  for (const rate of rates) {
    try {
      const result = await upsertZoneToZoneRate({
        originZoneId: rate.originZoneId,
        destinationZoneId: rate.destinationZoneId,
        ratePerKg: rate.ratePerKg ?? 0,
        volumetricFactor: rate.volumetricFactor,
        courierScope,
      })

      // Update additional fields if they exist
      if (rate.volumetricFactor !== undefined || rate.effectiveFrom || rate.effectiveTo) {
        const updateData: any = {}
        if (rate.volumetricFactor !== undefined)
          updateData.volumetric_factor = rate.volumetricFactor.toString()
        if (rate.effectiveFrom) updateData.effective_from = rate.effectiveFrom
        if (rate.effectiveTo) updateData.effective_to = rate.effectiveTo
        updateData.updated_at = new Date()

        await db
          .update(b2bZoneToZoneRates)
          .set(updateData)
          .where(eq(b2bZoneToZoneRates.id, result.id))
      }

      results.push({ success: true, id: result.id })
    } catch (error: any) {
      results.push({ success: false, error: error.message, rate })
    }
  }

  return results
}

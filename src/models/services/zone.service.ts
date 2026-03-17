import { randomUUID } from 'crypto'
import { and, asc, count, desc, eq, ilike, inArray, isNull, ne, or, SQLWrapper } from 'drizzle-orm'
import fs from 'fs'
import Papa from 'papaparse'
import { db } from '../client'
import { locations } from '../schema/locations'
import { b2bPincodes, zoneMappings, zones } from '../schema/zones'

const sanitizeStates = (input: any): string[] => {
  if (!Array.isArray(input)) return []
  const unique = new Set<string>()
  for (const value of input) {
    if (typeof value !== 'string') continue
    const trimmed = value.trim()
    if (trimmed) unique.add(trimmed)
  }
  return Array.from(unique)
}

// Zones
export const createZone = async (data: any, businessType: 'b2b' | 'b2c') => {
  const normalizedBusinessType = businessType?.toUpperCase() === 'B2C' ? 'B2C' : 'B2B'

  const {
    id,
    name,
    code,
    description,
    region,
    metadata,
    business_type,
    states,
  } = data

  const effectiveBusinessType = (business_type ?? normalizedBusinessType).toUpperCase()
  const sanitizedStates = sanitizeStates(states)

  if (effectiveBusinessType === 'B2B' && sanitizedStates.length === 0) {
    throw new Error('Select at least one state for a B2B zone')
  }

  // Zones are always global - no courier-specific zones (industry standard)

  try {
    const zone = await db.transaction(async (tx) => {
      // Validate required fields
      if (!name || !code) {
        throw new Error('Zone name and code are required')
      }

      const insertValues: any = {
        name,
        code,
        description: description ?? null,
        region: region ?? null,
        metadata: metadata ?? null,
        business_type: effectiveBusinessType,
        states: sanitizedStates,
      }

      const [created] = await tx.insert(zones).values(insertValues).returning()

      if (!created) {
        throw new Error('Failed to create zone: no record returned')
      }

      if (created.business_type === 'B2B') {
        await remapB2BPincodesForZone(created.id, tx)
      }

      // Map the returned fields to the expected format
      const zoneStates = Array.isArray(created.states)
        ? created.states
        : created.states
        ? [created.states]
        : []

      return {
        id: created.id,
        code: created.code,
        name: created.name,
        business_type: created.business_type,
        states: zoneStates,
        description: created.description,
        region: created.region,
        metadata: created.metadata,
        created_at: created.created_at,
        updated_at: created.updated_at,
      }
    })

    return zone
  } catch (error) {
    console.error('[createZone] failed', {
      payload: {
        business_type: effectiveBusinessType,
        code,
        name,
        states: sanitizedStates,
      },
      error,
    })
    throw error instanceof Error ? error : new Error(String(error))
  }
}

export const getAllZones = async (
  businessType?: string | null,
  courierIds?: string[] | number[] | null, // Deprecated - zones are always global
) => {
  try {
    const normalizedBusinessType = businessType ? String(businessType).toUpperCase() : undefined

    const conditions: any[] = []

    if (normalizedBusinessType) {
      conditions.push(eq(zones.business_type, normalizedBusinessType))
    }

    // Zones are always global - no courier filtering needed
    // courierIds parameter is kept for backward compatibility but ignored

    const whereClause = conditions.length ? and(...conditions) : undefined

    const result = await db.select().from(zones).where(whereClause).orderBy(asc(zones.code))

    return result || []
  } catch (error) {
    console.error('Error fetching zones:', error)
    return []
  }
}

export const updateZoneMapping = async (mapping: any) => {
  const { id, created_at, ...safeData } = mapping
  const [updated] = await db
    .update(zoneMappings)
    .set(safeData)
    .where(eq(zoneMappings.id, id))
    .returning()
  return updated
}

export const getZoneById = async (id: string) => {
  const [zone] = await db.select().from(zones).where(eq(zones.id, id))
  return zone
}

export const updateZone = async (id: string, data: any) => {
  // remove fields that should not be updated manually
  const {
    created_at,
    updated_at,
    id: _,
    business_type,
    states,
    ...rest
  } = data

  // Filter out any date fields or other fields that shouldn't be updated
  const allowedFields = ['name', 'code', 'description', 'region', 'metadata']
  const updatePayload: Record<string, any> = {}

  // Only include allowed fields from rest (exclude any date fields)
  for (const key of allowedFields) {
    if (key in rest && rest[key] !== undefined) {
      updatePayload[key] = rest[key]
    }
  }

  // Explicitly set updated_at to current date (Drizzle will handle the conversion)
  updatePayload.updated_at = new Date()

  if (business_type) {
    updatePayload.business_type = String(business_type).toUpperCase()
  }

  // Removed courier_id, service_provider, is_global updates
  // Zones are always global (industry standard)

  if (states !== undefined) {
    updatePayload.states = sanitizeStates(states)
  }

  const updated = await db.transaction(async (tx) => {
    const [zone] = await tx
      .update(zones)
      .set(updatePayload) // only update allowed fields
      .where(eq(zones.id, id))
      .returning()

    if (zone?.business_type === 'B2B') {
      await remapB2BPincodesForZone(zone.id, tx)
    }

    return zone
  })

  return updated
}

export const deleteZone = async (id: string) => {
  await db.transaction(async (tx) => {
    // First, delete all pincode mappings associated with this zone
    // This handles both B2B (b2bPincodes) and B2C (zoneMappings) zones
    await tx.delete(b2bPincodes).where(eq(b2bPincodes.zone_id, id))
    await tx.delete(zoneMappings).where(eq(zoneMappings.zone_id, id))
    
    // Then delete the zone itself
    await tx.delete(zones).where(eq(zones.id, id))
  })
}

// Zone Mappings
export const addZoneMapping = async (zoneId: string, data: any) => {
  const { id, ...safeData } = data
  const [mapping] = await db
    .insert(zoneMappings)
    .values({ ...safeData, zone_id: zoneId, id: randomUUID(), created_at: new Date() })
    .returning()
  return mapping
}

export const getZoneMappingsPaginated = async (
  zoneId: string,
  options?: {
    page?: number
    limit?: number
    filters?: { pincode?: string; city?: string; state?: string }
    sortBy?: 'pincode' | 'city' | 'state' | 'created_at'
    sortOrder?: 'asc' | 'desc'
  },
) => {
  try {
    const page = options?.page ?? 1
    const limit = options?.limit ?? 20
    const offset = (page - 1) * limit

    // Base condition: filter by zone
    const conditions: (SQLWrapper | undefined)[] = [eq(zoneMappings.zone_id, zoneId)]

    // Apply filters on locations table
    if (options?.filters) {
      const { pincode, city, state } = options.filters
      if (pincode) conditions.push(ilike(locations.pincode, `%${pincode}%`))
      if (city) conditions.push(ilike(locations.city, `%${city}%`))
      if (state) conditions.push(ilike(locations.state, `%${state}%`))
    }

    // Whitelisted sort columns (use locations.* instead of zoneMappings)
    const sortColumns: Record<string, any> = {
      pincode: locations.pincode,
      city: locations.city,
      state: locations.state,
      created_at: zoneMappings.created_at, // keep mapping created_at for fallback
    }

    const sortCol =
      options?.sortBy && sortColumns[options.sortBy]
        ? sortColumns[options.sortBy]
        : zoneMappings.created_at

    const orderClause = options?.sortOrder === 'asc' ? asc(sortCol) : desc(sortCol)

    // Data query with join
    const data = await db
      .select({
        mappingId: zoneMappings.id,
        zoneId: zoneMappings.zone_id,
        createdAt: zoneMappings.created_at,
        locationId: locations.id,
        pincode: locations.pincode,
        city: locations.city,
        state: locations.state,
        country: locations.country,
      })
      .from(zoneMappings)
      .innerJoin(locations, eq(zoneMappings.location_id, locations.id))
      .where(and(...conditions))
      .orderBy(orderClause)
      .limit(limit)
      .offset(offset)

    // Total count query (same join + filters)
    const totalRes = await db
      .select({ count: count() })
      .from(zoneMappings)
      .innerJoin(locations, eq(zoneMappings.location_id, locations.id))
      .where(and(...conditions))

    const total = Number(totalRes[0]?.count ?? 0)

    return { data, total, page, limit }
  } catch (err) {
    console.error('Error fetching paginated zone mappings:', err)
    return {
      data: [],
      total: 0,
      page: options?.page ?? 1,
      limit: options?.limit ?? 20,
    }
  }
}

export const deleteZoneMapping = async (mappingId: string) => {
  await db.delete(zoneMappings).where(eq(zoneMappings.id, mappingId))
}

// ---------------- Bulk Zone Mappings ----------------
export const bulkDeleteMappings = async (mappingIds: string[]) => {
  const deleted = await db
    .delete(zoneMappings)
    .where(inArray(zoneMappings.id, mappingIds))
    .returning()
  return { success: true, deleted }
}

export const bulkMoveMappings = async (mappingIds: string[], targetZoneId: string) => {
  const moved = await db
    .update(zoneMappings)
    .set({ zone_id: targetZoneId })
    .where(inArray(zoneMappings.id, mappingIds))
    .returning()

  return { success: true, moved, targetZone: targetZoneId }
}

const isValidPincode = (pincode: string) => {
  const indianRegex = /^[1-9][0-9]{5}$/ // 6 digits, no leading 0
  const intlRegex = /^[A-Za-z0-9]{3,10}$/ // simple alphanumeric 3-10 chars
  return indianRegex.test(pincode) || intlRegex.test(pincode)
}
type CSVRecord = {
  pincode: string
  city: string
  state: string
  zone_id?: string
}

type ExistingMappingRecord = CSVRecord & { id: string }

export const bulkInsertZoneMappingsFromCSV = async (
  filePath: string,
  zoneId: string,
  userChoices?: Record<string, 'override' | 'skip'>,
): Promise<
  | {
      inserted: number
      duplicates: { existingMapping: ExistingMappingRecord; newMapping: CSVRecord }[]
    }
  | { inserted: number; overridden: ExistingMappingRecord[]; skipped: ExistingMappingRecord[] }
> => {
  return new Promise((resolve, reject) => {
    const file = fs.readFileSync(filePath, 'utf8')

    Papa.parse<CSVRecord>(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          const insertedRecords: CSVRecord[] = []
          const duplicates: {
            existingMapping: ExistingMappingRecord
            newMapping: CSVRecord
          }[] = []
          const overridden: ExistingMappingRecord[] = []
          const skipped: ExistingMappingRecord[] = []

          const validRecords: CSVRecord[] = results.data
            .filter((row) => row.pincode && row.city && row.state)
            .map((row) => ({
              pincode: row.pincode.trim(),
              city: row.city.trim(),
              state: row.state.trim(),
              zone_id: zoneId,
            }))
            .filter((row) => isValidPincode(row.pincode))

          for (const record of validRecords) {
            // Step 1: check if location already exists
            let [location] = await db
              .select()
              .from(locations)
              .where(
                and(
                  eq(locations.pincode, record.pincode),
                  eq(locations.city, record.city),
                  eq(locations.state, record.state),
                ),
              )
              .limit(1)

            if (!location) {
              // Insert into locations table if new
              const [newLocation] = await db
                .insert(locations)
                .values({
                  pincode: record.pincode,
                  city: record.city,
                  state: record.state,
                  country: 'India', // or derive dynamically if CSV has it
                })
                .returning()
              location = newLocation
            }

            // Step 2: check if mapping already exists
            const [existingMapping] = await db
              .select()
              .from(zoneMappings)
              .where(
                and(eq(zoneMappings.zone_id, zoneId), eq(zoneMappings.location_id, location.id)),
              )
              .limit(1)

            if (existingMapping) {
              if (userChoices) {
                const choice = userChoices[existingMapping.id] || 'skip'
                if (choice === 'override') {
                  overridden.push({ ...record, id: existingMapping.id })
                  insertedRecords.push(record)
                } else {
                  skipped.push({ ...record, id: existingMapping.id })
                }
              } else {
                duplicates.push({
                  existingMapping: {
                    id: existingMapping.id,
                    pincode: record.pincode,
                    city: record.city,
                    state: record.state,
                    zone_id: zoneId,
                  },
                  newMapping: record,
                })
              }
            } else {
              // Step 3: create mapping
              await db.insert(zoneMappings).values({
                zone_id: zoneId,
                location_id: location.id,
              })
              insertedRecords.push(record)
            }
          }

          if (userChoices) {
            resolve({ inserted: insertedRecords.length, overridden, skipped })
          } else {
            resolve({ inserted: insertedRecords.length, duplicates })
          }
        } catch (err) {
          reject(err)
        }
      },
      error: (err: any) => reject(err),
    })
  })
}

const remapB2BPincodesForZone = async (zoneId: string, externalClient?: any) => {
  // Validate b2bPincodes is available
  if (!b2bPincodes || typeof b2bPincodes !== 'object' || !b2bPincodes.zone_id) {
    console.error('[remapB2BPincodesForZone] b2bPincodes validation failed:', {
      isDefined: typeof b2bPincodes !== 'undefined',
      isNull: b2bPincodes === null,
      type: typeof b2bPincodes,
      hasZoneId: b2bPincodes?.zone_id ? 'yes' : 'no',
    })
    throw new Error(
      'b2bPincodes table schema is not properly initialized. Please restart the server.',
    )
  }

  const client = externalClient ?? db

  const execute = async (tx: any) => {
    const [zone] = await tx.select().from(zones).where(eq(zones.id, zoneId))

    if (!zone) {
      throw new Error('Zone not found')
    }

    if (zone.business_type !== 'B2B') {
      return
    }

    const selectedStates = sanitizeStates(zone.states)

    // Conflict detection: ensure no other zone has overlapping states
    // Since zones are global, check all B2B zones for state conflicts
    const conflictingZones = await tx
      .select()
      .from(zones)
      .where(
        and(
          eq(zones.business_type, 'B2B'),
          ne(zones.id, zoneId),
        ),
      )

    for (const otherZone of conflictingZones) {
      const otherStates = sanitizeStates(otherZone.states)
      const overlap = otherStates.filter((state) => selectedStates.includes(state))
      if (overlap.length > 0) {
        throw new Error(
          `State(s) ${overlap.join(', ')} already mapped to zone "${
            otherZone.name
          }". Remove conflicts before saving.`,
        )
      }
    }

    // Remove pincodes that no longer belong to this zone
    if (!b2bPincodes) {
      throw new Error(
        'b2bPincodes table schema is not defined. Please ensure the schema is properly imported.',
      )
    }
    const existingRows = await tx.select().from(b2bPincodes).where(eq(b2bPincodes.zone_id, zoneId))

    for (const row of existingRows) {
      if (!selectedStates.includes(row.state)) {
        await tx.delete(b2bPincodes).where(eq(b2bPincodes.id, row.id))
      }
    }

    if (selectedStates.length === 0) {
      return
    }

    const locationRows = await tx
      .select()
      .from(locations)
      .where(inArray(locations.state, selectedStates))

    for (const location of locationRows) {
      // Since zones are global, pincodes are mapped to zones only (no courier filtering)
      const [existing] = await tx
        .select()
        .from(b2bPincodes)
        .where(
          and(
            eq(b2bPincodes.pincode, location.pincode),
            eq(b2bPincodes.state, location.state),
            // Note: b2bPincodes may still have courier_id for rate lookup, but zone mapping is global
          ),
        )
        .limit(1)

      if (existing) {
        if (existing.zone_id !== zoneId) {
          await tx
            .update(b2bPincodes)
            .set({ zone_id: zoneId })
            .where(eq(b2bPincodes.id, existing.id))
        }
      } else {
        await tx.insert(b2bPincodes).values({
          pincode: location.pincode,
          city: location.city,
          state: location.state,
          zone_id: zoneId,
          // courier_id and service_provider are set at rate level, not zone level
          // Leave them null here - they'll be set when rates are configured
          courier_id: null,
          service_provider: null,
          is_oda: false,
          is_remote: false,
          is_mall: false,
          is_sez: false,
          is_airport: false,
          is_high_security: false,
        })
      }
    }
  }

  // If externalClient is provided (transaction), use it directly
  // Otherwise, create a new transaction
  if (externalClient) {
    await execute(externalClient)
  } else {
    await client.transaction(async (tx: any) => {
      await execute(tx)
    })
  }
}

export const remapZonePincodes = async (zoneId: string) => remapB2BPincodesForZone(zoneId)

export const listAllZoneStates = async () => {
  const rows = await db
    .select({ state: locations.state })
    .from(locations)
    .groupBy(locations.state)
    .orderBy(asc(locations.state))

  return rows.map((row) => row.state).filter((state): state is string => Boolean(state))
}

"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.listAllZoneStates = exports.remapZonePincodes = exports.bulkInsertZoneMappingsFromCSV = exports.bulkMoveMappings = exports.bulkDeleteMappings = exports.deleteZoneMapping = exports.getZoneMappingsPaginated = exports.addZoneMapping = exports.deleteZone = exports.updateZone = exports.getZoneById = exports.updateZoneMapping = exports.getAllZones = exports.createZone = void 0;
const crypto_1 = require("crypto");
const drizzle_orm_1 = require("drizzle-orm");
const fs_1 = __importDefault(require("fs"));
const papaparse_1 = __importDefault(require("papaparse"));
const client_1 = require("../client");
const locations_1 = require("../schema/locations");
const zones_1 = require("../schema/zones");
const sanitizeStates = (input) => {
    if (!Array.isArray(input))
        return [];
    const unique = new Set();
    for (const value of input) {
        if (typeof value !== 'string')
            continue;
        const trimmed = value.trim();
        if (trimmed)
            unique.add(trimmed);
    }
    return Array.from(unique);
};
// Zones
const createZone = async (data, businessType) => {
    const normalizedBusinessType = businessType?.toUpperCase() === 'B2C' ? 'B2C' : 'B2B';
    const { id, name, code, description, region, metadata, business_type, states, } = data;
    const effectiveBusinessType = (business_type ?? normalizedBusinessType).toUpperCase();
    const sanitizedStates = sanitizeStates(states);
    if (effectiveBusinessType === 'B2B' && sanitizedStates.length === 0) {
        throw new Error('Select at least one state for a B2B zone');
    }
    // Zones are always global - no courier-specific zones (industry standard)
    try {
        const zone = await client_1.db.transaction(async (tx) => {
            // Validate required fields
            if (!name || !code) {
                throw new Error('Zone name and code are required');
            }
            const insertValues = {
                name,
                code,
                description: description ?? null,
                region: region ?? null,
                metadata: metadata ?? null,
                business_type: effectiveBusinessType,
                states: sanitizedStates,
            };
            const [created] = await tx.insert(zones_1.zones).values(insertValues).returning();
            if (!created) {
                throw new Error('Failed to create zone: no record returned');
            }
            if (created.business_type === 'B2B') {
                await remapB2BPincodesForZone(created.id, tx);
            }
            // Map the returned fields to the expected format
            const zoneStates = Array.isArray(created.states)
                ? created.states
                : created.states
                    ? [created.states]
                    : [];
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
            };
        });
        return zone;
    }
    catch (error) {
        console.error('[createZone] failed', {
            payload: {
                business_type: effectiveBusinessType,
                code,
                name,
                states: sanitizedStates,
            },
            error,
        });
        throw error instanceof Error ? error : new Error(String(error));
    }
};
exports.createZone = createZone;
const getAllZones = async (businessType, courierIds) => {
    try {
        const normalizedBusinessType = businessType ? String(businessType).toUpperCase() : undefined;
        const conditions = [];
        if (normalizedBusinessType) {
            conditions.push((0, drizzle_orm_1.eq)(zones_1.zones.business_type, normalizedBusinessType));
        }
        // Zones are always global - no courier filtering needed
        // courierIds parameter is kept for backward compatibility but ignored
        const whereClause = conditions.length ? (0, drizzle_orm_1.and)(...conditions) : undefined;
        const result = await client_1.db.select().from(zones_1.zones).where(whereClause).orderBy((0, drizzle_orm_1.asc)(zones_1.zones.code));
        return result || [];
    }
    catch (error) {
        console.error('Error fetching zones:', error);
        return [];
    }
};
exports.getAllZones = getAllZones;
const updateZoneMapping = async (mapping) => {
    const { id, created_at, ...safeData } = mapping;
    const [updated] = await client_1.db
        .update(zones_1.zoneMappings)
        .set(safeData)
        .where((0, drizzle_orm_1.eq)(zones_1.zoneMappings.id, id))
        .returning();
    return updated;
};
exports.updateZoneMapping = updateZoneMapping;
const getZoneById = async (id) => {
    const [zone] = await client_1.db.select().from(zones_1.zones).where((0, drizzle_orm_1.eq)(zones_1.zones.id, id));
    return zone;
};
exports.getZoneById = getZoneById;
const updateZone = async (id, data) => {
    // remove fields that should not be updated manually
    const { created_at, updated_at, id: _, business_type, states, ...rest } = data;
    // Filter out any date fields or other fields that shouldn't be updated
    const allowedFields = ['name', 'code', 'description', 'region', 'metadata'];
    const updatePayload = {};
    // Only include allowed fields from rest (exclude any date fields)
    for (const key of allowedFields) {
        if (key in rest && rest[key] !== undefined) {
            updatePayload[key] = rest[key];
        }
    }
    // Explicitly set updated_at to current date (Drizzle will handle the conversion)
    updatePayload.updated_at = new Date();
    if (business_type) {
        updatePayload.business_type = String(business_type).toUpperCase();
    }
    // Removed courier_id, service_provider, is_global updates
    // Zones are always global (industry standard)
    if (states !== undefined) {
        updatePayload.states = sanitizeStates(states);
    }
    const updated = await client_1.db.transaction(async (tx) => {
        const [zone] = await tx
            .update(zones_1.zones)
            .set(updatePayload) // only update allowed fields
            .where((0, drizzle_orm_1.eq)(zones_1.zones.id, id))
            .returning();
        if (zone?.business_type === 'B2B') {
            await remapB2BPincodesForZone(zone.id, tx);
        }
        return zone;
    });
    return updated;
};
exports.updateZone = updateZone;
const deleteZone = async (id) => {
    await client_1.db.transaction(async (tx) => {
        // First, delete all pincode mappings associated with this zone
        // This handles both B2B (b2bPincodes) and B2C (zoneMappings) zones
        await tx.delete(zones_1.b2bPincodes).where((0, drizzle_orm_1.eq)(zones_1.b2bPincodes.zone_id, id));
        await tx.delete(zones_1.zoneMappings).where((0, drizzle_orm_1.eq)(zones_1.zoneMappings.zone_id, id));
        // Then delete the zone itself
        await tx.delete(zones_1.zones).where((0, drizzle_orm_1.eq)(zones_1.zones.id, id));
    });
};
exports.deleteZone = deleteZone;
// Zone Mappings
const addZoneMapping = async (zoneId, data) => {
    const { id, ...safeData } = data;
    const [mapping] = await client_1.db
        .insert(zones_1.zoneMappings)
        .values({ ...safeData, zone_id: zoneId, id: (0, crypto_1.randomUUID)(), created_at: new Date() })
        .returning();
    return mapping;
};
exports.addZoneMapping = addZoneMapping;
const getZoneMappingsPaginated = async (zoneId, options) => {
    try {
        const page = options?.page ?? 1;
        const limit = options?.limit ?? 20;
        const offset = (page - 1) * limit;
        // Base condition: filter by zone
        const conditions = [(0, drizzle_orm_1.eq)(zones_1.zoneMappings.zone_id, zoneId)];
        // Apply filters on locations table
        if (options?.filters) {
            const { pincode, city, state } = options.filters;
            if (pincode)
                conditions.push((0, drizzle_orm_1.ilike)(locations_1.locations.pincode, `%${pincode}%`));
            if (city)
                conditions.push((0, drizzle_orm_1.ilike)(locations_1.locations.city, `%${city}%`));
            if (state)
                conditions.push((0, drizzle_orm_1.ilike)(locations_1.locations.state, `%${state}%`));
        }
        // Whitelisted sort columns (use locations.* instead of zoneMappings)
        const sortColumns = {
            pincode: locations_1.locations.pincode,
            city: locations_1.locations.city,
            state: locations_1.locations.state,
            created_at: zones_1.zoneMappings.created_at, // keep mapping created_at for fallback
        };
        const sortCol = options?.sortBy && sortColumns[options.sortBy]
            ? sortColumns[options.sortBy]
            : zones_1.zoneMappings.created_at;
        const orderClause = options?.sortOrder === 'asc' ? (0, drizzle_orm_1.asc)(sortCol) : (0, drizzle_orm_1.desc)(sortCol);
        // Data query with join
        const data = await client_1.db
            .select({
            mappingId: zones_1.zoneMappings.id,
            zoneId: zones_1.zoneMappings.zone_id,
            createdAt: zones_1.zoneMappings.created_at,
            locationId: locations_1.locations.id,
            pincode: locations_1.locations.pincode,
            city: locations_1.locations.city,
            state: locations_1.locations.state,
            country: locations_1.locations.country,
        })
            .from(zones_1.zoneMappings)
            .innerJoin(locations_1.locations, (0, drizzle_orm_1.eq)(zones_1.zoneMappings.location_id, locations_1.locations.id))
            .where((0, drizzle_orm_1.and)(...conditions))
            .orderBy(orderClause)
            .limit(limit)
            .offset(offset);
        // Total count query (same join + filters)
        const totalRes = await client_1.db
            .select({ count: (0, drizzle_orm_1.count)() })
            .from(zones_1.zoneMappings)
            .innerJoin(locations_1.locations, (0, drizzle_orm_1.eq)(zones_1.zoneMappings.location_id, locations_1.locations.id))
            .where((0, drizzle_orm_1.and)(...conditions));
        const total = Number(totalRes[0]?.count ?? 0);
        return { data, total, page, limit };
    }
    catch (err) {
        console.error('Error fetching paginated zone mappings:', err);
        return {
            data: [],
            total: 0,
            page: options?.page ?? 1,
            limit: options?.limit ?? 20,
        };
    }
};
exports.getZoneMappingsPaginated = getZoneMappingsPaginated;
const deleteZoneMapping = async (mappingId) => {
    await client_1.db.delete(zones_1.zoneMappings).where((0, drizzle_orm_1.eq)(zones_1.zoneMappings.id, mappingId));
};
exports.deleteZoneMapping = deleteZoneMapping;
// ---------------- Bulk Zone Mappings ----------------
const bulkDeleteMappings = async (mappingIds) => {
    const deleted = await client_1.db
        .delete(zones_1.zoneMappings)
        .where((0, drizzle_orm_1.inArray)(zones_1.zoneMappings.id, mappingIds))
        .returning();
    return { success: true, deleted };
};
exports.bulkDeleteMappings = bulkDeleteMappings;
const bulkMoveMappings = async (mappingIds, targetZoneId) => {
    const moved = await client_1.db
        .update(zones_1.zoneMappings)
        .set({ zone_id: targetZoneId })
        .where((0, drizzle_orm_1.inArray)(zones_1.zoneMappings.id, mappingIds))
        .returning();
    return { success: true, moved, targetZone: targetZoneId };
};
exports.bulkMoveMappings = bulkMoveMappings;
const isValidPincode = (pincode) => {
    const indianRegex = /^[1-9][0-9]{5}$/; // 6 digits, no leading 0
    const intlRegex = /^[A-Za-z0-9]{3,10}$/; // simple alphanumeric 3-10 chars
    return indianRegex.test(pincode) || intlRegex.test(pincode);
};
const bulkInsertZoneMappingsFromCSV = async (filePath, zoneId, userChoices) => {
    return new Promise((resolve, reject) => {
        const file = fs_1.default.readFileSync(filePath, 'utf8');
        papaparse_1.default.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: async (results) => {
                try {
                    const insertedRecords = [];
                    const duplicates = [];
                    const overridden = [];
                    const skipped = [];
                    const validRecords = results.data
                        .filter((row) => row.pincode && row.city && row.state)
                        .map((row) => ({
                        pincode: row.pincode.trim(),
                        city: row.city.trim(),
                        state: row.state.trim(),
                        zone_id: zoneId,
                    }))
                        .filter((row) => isValidPincode(row.pincode));
                    for (const record of validRecords) {
                        // Step 1: check if location already exists
                        let [location] = await client_1.db
                            .select()
                            .from(locations_1.locations)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(locations_1.locations.pincode, record.pincode), (0, drizzle_orm_1.eq)(locations_1.locations.city, record.city), (0, drizzle_orm_1.eq)(locations_1.locations.state, record.state)))
                            .limit(1);
                        if (!location) {
                            // Insert into locations table if new
                            const [newLocation] = await client_1.db
                                .insert(locations_1.locations)
                                .values({
                                pincode: record.pincode,
                                city: record.city,
                                state: record.state,
                                country: 'India', // or derive dynamically if CSV has it
                            })
                                .returning();
                            location = newLocation;
                        }
                        // Step 2: check if mapping already exists
                        const [existingMapping] = await client_1.db
                            .select()
                            .from(zones_1.zoneMappings)
                            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(zones_1.zoneMappings.zone_id, zoneId), (0, drizzle_orm_1.eq)(zones_1.zoneMappings.location_id, location.id)))
                            .limit(1);
                        if (existingMapping) {
                            if (userChoices) {
                                const choice = userChoices[existingMapping.id] || 'skip';
                                if (choice === 'override') {
                                    overridden.push({ ...record, id: existingMapping.id });
                                    insertedRecords.push(record);
                                }
                                else {
                                    skipped.push({ ...record, id: existingMapping.id });
                                }
                            }
                            else {
                                duplicates.push({
                                    existingMapping: {
                                        id: existingMapping.id,
                                        pincode: record.pincode,
                                        city: record.city,
                                        state: record.state,
                                        zone_id: zoneId,
                                    },
                                    newMapping: record,
                                });
                            }
                        }
                        else {
                            // Step 3: create mapping
                            await client_1.db.insert(zones_1.zoneMappings).values({
                                zone_id: zoneId,
                                location_id: location.id,
                            });
                            insertedRecords.push(record);
                        }
                    }
                    if (userChoices) {
                        resolve({ inserted: insertedRecords.length, overridden, skipped });
                    }
                    else {
                        resolve({ inserted: insertedRecords.length, duplicates });
                    }
                }
                catch (err) {
                    reject(err);
                }
            },
            error: (err) => reject(err),
        });
    });
};
exports.bulkInsertZoneMappingsFromCSV = bulkInsertZoneMappingsFromCSV;
const remapB2BPincodesForZone = async (zoneId, externalClient) => {
    // Validate b2bPincodes is available
    if (!zones_1.b2bPincodes || typeof zones_1.b2bPincodes !== 'object' || !zones_1.b2bPincodes.zone_id) {
        console.error('[remapB2BPincodesForZone] b2bPincodes validation failed:', {
            isDefined: typeof zones_1.b2bPincodes !== 'undefined',
            isNull: zones_1.b2bPincodes === null,
            type: typeof zones_1.b2bPincodes,
            hasZoneId: zones_1.b2bPincodes?.zone_id ? 'yes' : 'no',
        });
        throw new Error('b2bPincodes table schema is not properly initialized. Please restart the server.');
    }
    const client = externalClient ?? client_1.db;
    const execute = async (tx) => {
        const [zone] = await tx.select().from(zones_1.zones).where((0, drizzle_orm_1.eq)(zones_1.zones.id, zoneId));
        if (!zone) {
            throw new Error('Zone not found');
        }
        if (zone.business_type !== 'B2B') {
            return;
        }
        const selectedStates = sanitizeStates(zone.states);
        // Conflict detection: ensure no other zone has overlapping states
        // Since zones are global, check all B2B zones for state conflicts
        const conflictingZones = await tx
            .select()
            .from(zones_1.zones)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(zones_1.zones.business_type, 'B2B'), (0, drizzle_orm_1.ne)(zones_1.zones.id, zoneId)));
        for (const otherZone of conflictingZones) {
            const otherStates = sanitizeStates(otherZone.states);
            const overlap = otherStates.filter((state) => selectedStates.includes(state));
            if (overlap.length > 0) {
                throw new Error(`State(s) ${overlap.join(', ')} already mapped to zone "${otherZone.name}". Remove conflicts before saving.`);
            }
        }
        // Remove pincodes that no longer belong to this zone
        if (!zones_1.b2bPincodes) {
            throw new Error('b2bPincodes table schema is not defined. Please ensure the schema is properly imported.');
        }
        const existingRows = await tx.select().from(zones_1.b2bPincodes).where((0, drizzle_orm_1.eq)(zones_1.b2bPincodes.zone_id, zoneId));
        for (const row of existingRows) {
            if (!selectedStates.includes(row.state)) {
                await tx.delete(zones_1.b2bPincodes).where((0, drizzle_orm_1.eq)(zones_1.b2bPincodes.id, row.id));
            }
        }
        if (selectedStates.length === 0) {
            return;
        }
        const locationRows = await tx
            .select()
            .from(locations_1.locations)
            .where((0, drizzle_orm_1.inArray)(locations_1.locations.state, selectedStates));
        for (const location of locationRows) {
            // Since zones are global, pincodes are mapped to zones only (no courier filtering)
            const [existing] = await tx
                .select()
                .from(zones_1.b2bPincodes)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(zones_1.b2bPincodes.pincode, location.pincode), (0, drizzle_orm_1.eq)(zones_1.b2bPincodes.state, location.state)))
                .limit(1);
            if (existing) {
                if (existing.zone_id !== zoneId) {
                    await tx
                        .update(zones_1.b2bPincodes)
                        .set({ zone_id: zoneId })
                        .where((0, drizzle_orm_1.eq)(zones_1.b2bPincodes.id, existing.id));
                }
            }
            else {
                await tx.insert(zones_1.b2bPincodes).values({
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
                });
            }
        }
    };
    // If externalClient is provided (transaction), use it directly
    // Otherwise, create a new transaction
    if (externalClient) {
        await execute(externalClient);
    }
    else {
        await client.transaction(async (tx) => {
            await execute(tx);
        });
    }
};
const remapZonePincodes = async (zoneId) => remapB2BPincodesForZone(zoneId);
exports.remapZonePincodes = remapZonePincodes;
const listAllZoneStates = async () => {
    const rows = await client_1.db
        .select({ state: locations_1.locations.state })
        .from(locations_1.locations)
        .groupBy(locations_1.locations.state)
        .orderBy((0, drizzle_orm_1.asc)(locations_1.locations.state));
    return rows.map((row) => row.state).filter((state) => Boolean(state));
};
exports.listAllZoneStates = listAllZoneStates;

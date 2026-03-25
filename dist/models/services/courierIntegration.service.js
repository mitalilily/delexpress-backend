"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteCourierService = exports.deleteShippingRate = exports.createCourier = exports.upsertShippingRate = exports.updateShippingRate = exports.getUserShippingRates = exports.getShippingRates = exports.getCourierSummary = exports.getCourierById = exports.getCourierCount = exports.getAllCouriersPaginated = exports.getSortClause = exports.buildCourierWhereClause = void 0;
const crypto_1 = require("crypto");
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../client");
const couriers_1 = require("../schema/couriers");
const courierSummary_1 = require("../schema/courierSummary");
const shippingRates_1 = require("../schema/shippingRates");
const userPlans_1 = require("../schema/userPlans");
const zones_1 = require("../schema/zones");
const b2cRateCard_service_1 = require("./b2cRateCard.service");
const buildCourierWhereClause = (filters = {}) => {
    const conditions = [];
    if (filters.name) {
        conditions.push((0, drizzle_orm_1.ilike)(couriers_1.couriers.name, `%${filters.name}%`));
    }
    return conditions.length ? (0, drizzle_orm_1.and)(...conditions) : undefined;
};
exports.buildCourierWhereClause = buildCourierWhereClause;
// =========================
// 🛠 Helper: Sort
// =========================
const getSortClause = (sortBy) => {
    switch (sortBy) {
        case 'az':
            return (0, drizzle_orm_1.asc)(couriers_1.couriers.name); // A → Z
        case 'za':
            return (0, drizzle_orm_1.desc)(couriers_1.couriers.name); // Z → A
        default:
            return (0, drizzle_orm_1.asc)(couriers_1.couriers.id); // fallback to ID
    }
};
exports.getSortClause = getSortClause;
// =========================
// 📦 Get Paginated Couriers
// =========================
const getAllCouriersPaginated = async ({ limit, offset, filters, sortBy, }) => {
    const whereClause = (0, exports.buildCourierWhereClause)(filters);
    return await client_1.db
        .select()
        .from(couriers_1.couriers)
        .where(whereClause)
        .orderBy((0, exports.getSortClause)(sortBy))
        .limit(limit)
        .offset(offset);
};
exports.getAllCouriersPaginated = getAllCouriersPaginated;
// =========================
// 📊 Get Courier Count (with Filters)
// =========================
const getCourierCount = async (filters = {}) => {
    const whereClause = (0, exports.buildCourierWhereClause)(filters);
    const [result] = await client_1.db
        .select({ count: (0, drizzle_orm_1.sql) `count(*)` })
        .from(couriers_1.couriers)
        .where(whereClause);
    return Number(result?.count ?? 0);
};
exports.getCourierCount = getCourierCount;
// =========================
// 🔍 Get Courier by ID
// =========================
const getCourierById = async (id) => {
    const [courier] = await client_1.db.select().from(couriers_1.couriers).where((0, drizzle_orm_1.eq)(couriers_1.couriers.id, id));
    return courier;
};
exports.getCourierById = getCourierById;
// =========================
// 📋 Get Summary Stats
// =========================
const getCourierSummary = async () => {
    const [summary] = await client_1.db.select().from(courierSummary_1.courierSummary).where((0, drizzle_orm_1.eq)(courierSummary_1.courierSummary.id, 1));
    return summary;
};
exports.getCourierSummary = getCourierSummary;
const getShippingRates = async (filters = {}) => {
    const conditions = [];
    const normalizedModeFilter = (0, b2cRateCard_service_1.normalizeB2CShippingMode)(filters.mode);
    if (filters.courier_name?.length) {
        conditions.push((0, drizzle_orm_1.inArray)(shippingRates_1.shippingRates.courier_name, filters.courier_name));
    }
    if (filters.min_weight !== undefined && filters.business_type !== 'b2c') {
        conditions.push((0, drizzle_orm_1.gte)(shippingRates_1.shippingRates.min_weight, filters.min_weight.toString()));
    }
    if (filters.plan_id) {
        conditions.push((0, drizzle_orm_1.eq)(shippingRates_1.shippingRates.plan_id, filters.plan_id));
    }
    if (filters.business_type) {
        conditions.push((0, drizzle_orm_1.eq)(shippingRates_1.shippingRates.business_type, filters.business_type));
    }
    // Fetch all rates matching filters - explicitly select service_provider
    const rawResults = await client_1.db
        .select({
        rate: shippingRates_1.shippingRates,
        zone: zones_1.zones,
    })
        .from(shippingRates_1.shippingRates)
        .leftJoin(zones_1.zones, (0, drizzle_orm_1.eq)(zones_1.zones.id, shippingRates_1.shippingRates.zone_id))
        .where(conditions.length ? (0, drizzle_orm_1.and)(...conditions) : undefined)
        .orderBy((0, drizzle_orm_1.asc)(shippingRates_1.shippingRates.last_updated));
    const filteredResults = normalizedModeFilter
        ? rawResults.filter((row) => (0, b2cRateCard_service_1.normalizeB2CShippingMode)(row.rate.mode) === normalizedModeFilter)
        : rawResults;
    const slabs = await (0, b2cRateCard_service_1.fetchShippingRateSlabs)(filteredResults.map((row) => row.rate.id));
    const slabMap = new Map();
    for (const slab of slabs) {
        const list = slabMap.get(slab.shipping_rate_id) || [];
        list.push({
            id: slab.id,
            weight_from: Number(slab.weight_from),
            weight_to: slab.weight_to === null ? null : Number(slab.weight_to),
            rate: Number(slab.rate),
            extra_rate: slab.extra_rate === null ? null : Number(slab.extra_rate),
            extra_weight_unit: slab.extra_weight_unit === null ? null : Number(slab.extra_weight_unit),
        });
        slabMap.set(slab.shipping_rate_id, list);
    }
    const grouped = {};
    // Fetch all zones (for B2C)
    const allZones = await client_1.db.select().from(zones_1.zones);
    for (const row of filteredResults) {
        const businessType = row.rate.business_type;
        const key = businessType === 'b2b' ? getB2BGroupKey(row.rate) : getB2CGroupKey(row.rate);
        if (!grouped[key]) {
            // Initialize rates object
            let rates = {};
            if (businessType === 'b2c') {
                // B2C → initialize all zones
                for (const z of allZones) {
                    rates[z.name] = {};
                }
            }
            else {
                // B2B → only zones associated with the courier
                rates = {}; // will populate as we iterate rawResults
            }
            // Explicitly extract service_provider - handle both snake_case and camelCase
            const serviceProvider = (0, b2cRateCard_service_1.normalizeB2CServiceProvider)(row.rate.service_provider || row.rate.serviceProvider || null);
            grouped[key] = {
                ...row.rate,
                mode: (0, b2cRateCard_service_1.normalizeB2CShippingMode)(row.rate.mode),
                service_provider: serviceProvider, // Always include service_provider
                rates,
                zone_slabs: {},
            };
            // Debug log for first item
            if (!grouped[key].service_provider) {
                console.log(`[getShippingRates] service_provider is null for courier: ${row.rate.courier_name}, available fields:`, Object.keys(row.rate));
            }
        }
        if (row.zone) {
            grouped[key].rates[row.zone.name] = grouped[key].rates[row.zone.name] || {};
            grouped[key].rates[row.zone.name][row.rate.type] = row.rate.rate.toString();
            if (businessType === 'b2c') {
                grouped[key].zone_slabs[row.zone.name] = grouped[key].zone_slabs[row.zone.name] || {};
                grouped[key].zone_slabs[row.zone.name][row.rate.type] = slabMap.get(row.rate.id) || [];
            }
        }
    }
    let result = Object.values(grouped);
    // Debug: Log first result to verify service_provider is included
    if (result.length > 0) {
        console.log(`[getShippingRates] Returning ${result.length} grouped rates`);
        console.log(`[getShippingRates] First rate service_provider:`, result[0]?.service_provider);
        console.log(`[getShippingRates] First rate keys:`, Object.keys(result[0] || {}));
    }
    return result;
};
exports.getShippingRates = getShippingRates;
const getUserShippingRates = async (userId, filters = {}) => {
    // 1. Find the user's active plan
    const userPlan = await client_1.db
        .select()
        .from(userPlans_1.userPlans)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(userPlans_1.userPlans.userId, userId), (0, drizzle_orm_1.eq)(userPlans_1.userPlans.is_active, true)))
        .limit(1);
    if (!userPlan.length) {
        throw new Error('No active plan found for this user');
    }
    const planId = userPlan[0].plan_id;
    // 2. Call existing getShippingRates with plan_id injected
    return (0, exports.getShippingRates)({ ...filters, plan_id: planId });
};
exports.getUserShippingRates = getUserShippingRates;
const toMoney = (v) => {
    if (v === undefined || v === null || v === '')
        return '0';
    const n = typeof v === 'string' ? Number(v) : v;
    return Number.isFinite(n) ? n.toFixed(2) : '0';
};
const toWeight = (v) => {
    if (v === undefined || v === null || v === '')
        return '0.000';
    const n = typeof v === 'string' ? Number(v) : v;
    return Number.isFinite(n) ? n.toFixed(3) : '0.000';
};
const getB2CGroupKey = (rate) => `${rate.courier_id}_${rate.plan_id}_${(0, b2cRateCard_service_1.normalizeB2CServiceProvider)(rate.service_provider)}_${(0, b2cRateCard_service_1.normalizeB2CShippingMode)(rate.mode)}`;
const getB2BGroupKey = (rate) => `${rate.courier_name}_${rate.plan_id}_${(0, b2cRateCard_service_1.normalizeB2CShippingMode)(rate.mode)}`;
const updateShippingRate = async (courierId, updates, planId) => {
    const { courier_name, mode, cod_charges, cod_percent, other_charges, min_weight, service_provider, previous_service_provider, businessType = 'b2b', rates, zone_slabs, previous_mode, } = updates;
    console.log('MODE!', mode);
    if (!courierId || !courier_name) {
        throw new Error('Both courierId and courier_name are required');
    }
    // Save exactly what the frontend sends - no override logic
    const finalServiceProvider = service_provider?.trim() || null;
    const normalizedServiceProvider = (0, b2cRateCard_service_1.normalizeB2CServiceProvider)(finalServiceProvider) || null;
    const previousServiceProvider = (0, b2cRateCard_service_1.normalizeB2CServiceProvider)(previous_service_provider) || normalizedServiceProvider;
    const normalizedMode = (0, b2cRateCard_service_1.normalizeB2CShippingMode)(mode);
    const previousMode = (0, b2cRateCard_service_1.normalizeB2CShippingMode)(previous_mode ?? mode);
    console.log(`[updateShippingRate] Saving service_provider from frontend: "${normalizedServiceProvider}" for courier_id: ${courierId}, courier_name: "${courier_name}"`);
    const zoneNames = Array.from(new Set([
        ...Object.keys(rates || {}).filter((z) => z !== 'cod' && z !== 'other'),
        ...Object.keys(zone_slabs || {}),
    ]));
    if (zoneNames.length > 0) {
        const zoneRows = await client_1.db
            .select({ id: zones_1.zones.id, name: zones_1.zones.name })
            .from(zones_1.zones)
            .where((0, drizzle_orm_1.inArray)(zones_1.zones.name, zoneNames));
        for (const zn of zoneRows) {
            const zoneRate = rates[zn.name] || {};
            const zoneSlabs = zone_slabs?.[zn.name] || {};
            for (const type of ['forward', 'rto']) {
                const value = zoneRate[type];
                const explicitSlabs = (0, b2cRateCard_service_1.normaliseRateCardSlabs)(zoneSlabs[type] || []);
                (0, b2cRateCard_service_1.validateRateCardSlabs)(explicitSlabs);
                const hasLegacyValue = value !== undefined && value !== null && value !== '';
                if (!hasLegacyValue && !explicitSlabs.length)
                    continue;
                const fallbackRate = explicitSlabs[0]?.rate ?? value;
                const fallbackMinWeight = explicitSlabs[0]?.weight_from ?? min_weight ?? '0';
                const rateStr = toMoney(fallbackRate);
                const [existing] = await client_1.db
                    .select({ id: shippingRates_1.shippingRates.id })
                    .from(shippingRates_1.shippingRates)
                    .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(shippingRates_1.shippingRates.courier_id, courierId), (0, drizzle_orm_1.eq)(shippingRates_1.shippingRates.plan_id, planId), (0, drizzle_orm_1.eq)(shippingRates_1.shippingRates.business_type, businessType), (0, drizzle_orm_1.eq)(shippingRates_1.shippingRates.zone_id, zn.id), (0, drizzle_orm_1.eq)(shippingRates_1.shippingRates.type, type), (0, drizzle_orm_1.eq)((0, drizzle_orm_1.sql) `LOWER(${shippingRates_1.shippingRates.mode})`, previousMode), previousServiceProvider
                    ? (0, drizzle_orm_1.eq)((0, drizzle_orm_1.sql) `LOWER(${shippingRates_1.shippingRates.service_provider})`, previousServiceProvider)
                    : (0, drizzle_orm_1.sql) `1=1`));
                if (existing) {
                    console.log(`[updateShippingRate] Updating existing rate ${existing.id} with service_provider: ${normalizedServiceProvider}`);
                    // Build update object - always include service_provider
                    const updateData = {
                        rate: rateStr,
                        courier_id: courierId,
                        courier_name: String(courier_name),
                        last_updated: new Date(),
                        min_weight: toWeight(fallbackMinWeight),
                        cod_charges: cod_charges !== undefined ? toMoney(cod_charges) : undefined,
                        cod_percent: cod_percent !== undefined ? toMoney(cod_percent) : undefined,
                        other_charges: other_charges !== undefined ? toMoney(other_charges) : undefined,
                        mode: normalizedMode, // keep mode in sync
                    };
                    // Always set service_provider (even if null)
                    updateData.service_provider = normalizedServiceProvider;
                    console.log(`[updateShippingRate] Setting service_provider in update: "${updateData.service_provider}"`);
                    await client_1.db.update(shippingRates_1.shippingRates).set(updateData).where((0, drizzle_orm_1.eq)(shippingRates_1.shippingRates.id, existing.id));
                    if (businessType === 'b2c') {
                        await (0, b2cRateCard_service_1.replaceShippingRateSlabs)(existing.id, explicitSlabs);
                    }
                    console.log(`[updateShippingRate] ✅ Updated rate ${existing.id} successfully`);
                }
                else {
                    console.log(`[updateShippingRate] Inserting new rate with service_provider: ${normalizedServiceProvider}`);
                    const insertData = {
                        id: (0, crypto_1.randomUUID)(),
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
                    };
                    console.log(`[updateShippingRate] Inserting with service_provider: "${insertData.service_provider}"`);
                    await client_1.db.insert(shippingRates_1.shippingRates).values(insertData);
                    if (businessType === 'b2c') {
                        await (0, b2cRateCard_service_1.replaceShippingRateSlabs)(insertData.id, explicitSlabs);
                    }
                    console.log(`[updateShippingRate] ✅ Inserted new rate successfully`);
                }
            }
        }
    }
    return { success: true };
};
exports.updateShippingRate = updateShippingRate;
const upsertShippingRate = async (input) => {
    // Fetch service_provider from couriers table, but use any provided value as fallback
    let finalServiceProvider = null;
    const normalizedMode = (0, b2cRateCard_service_1.normalizeB2CShippingMode)(input.mode);
    // Check if service_provider is provided in input (for CSV imports that might have it)
    const providedServiceProvider = (0, b2cRateCard_service_1.normalizeB2CServiceProvider)(input.service_provider) || null;
    if (input.courier_id && input.courier_name) {
        console.log(`[upsertShippingRate] Fetching service_provider for courier_id: ${input.courier_id}, courier_name: ${input.courier_name}, provided: "${providedServiceProvider}"`);
        try {
            const matchingCouriers = await client_1.db
                .select({
                serviceProvider: couriers_1.couriers.serviceProvider,
                name: couriers_1.couriers.name,
            })
                .from(couriers_1.couriers)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(couriers_1.couriers.id, Number(input.courier_id)), providedServiceProvider
                ? (0, drizzle_orm_1.eq)((0, drizzle_orm_1.sql) `LOWER(${couriers_1.couriers.serviceProvider})`, providedServiceProvider)
                : (0, drizzle_orm_1.sql) `1=1`));
            console.log(`[upsertShippingRate] Found ${matchingCouriers.length} matching couriers`);
            // Try to match by courier_name as well if multiple couriers with same id exist
            const matchedCourier = matchingCouriers.find((c) => c.name === input.courier_name &&
                (!providedServiceProvider ||
                    (0, b2cRateCard_service_1.normalizeB2CServiceProvider)(c.serviceProvider) === providedServiceProvider)) || matchingCouriers[0];
            if (matchedCourier) {
                finalServiceProvider =
                    (0, b2cRateCard_service_1.normalizeB2CServiceProvider)(matchedCourier.serviceProvider) || providedServiceProvider || null;
                console.log(`[upsertShippingRate] ✅ Matched courier: ${matchedCourier.name}, service_provider: ${finalServiceProvider}`);
            }
            else {
                console.warn(`[upsertShippingRate] ⚠️ No matching courier found for courier_id: ${input.courier_id}, courier_name: ${input.courier_name}. Using provided: "${providedServiceProvider}"`);
                finalServiceProvider = providedServiceProvider;
            }
        }
        catch (error) {
            console.error(`[upsertShippingRate] Error fetching courier:`, error);
            finalServiceProvider = providedServiceProvider;
            if (!finalServiceProvider) {
                console.error(`[upsertShippingRate] ❌ No service_provider available`);
            }
        }
    }
    else {
        // If no courier_id, use provided value
        finalServiceProvider = providedServiceProvider;
    }
    for (const r of input.rates) {
        const explicitSlabs = (0, b2cRateCard_service_1.normaliseRateCardSlabs)(input.zone_slabs?.[r.zone_id]?.[r.type] || []);
        (0, b2cRateCard_service_1.validateRateCardSlabs)(explicitSlabs);
        const fallbackRate = explicitSlabs[0]?.rate ?? r.rate;
        const fallbackMinWeight = explicitSlabs[0]?.weight_from ?? input?.min_weight ?? '0';
        const existing = await client_1.db
            .select()
            .from(shippingRates_1.shippingRates)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(shippingRates_1.shippingRates.courier_id, Number(input.courier_id)), (0, drizzle_orm_1.eq)(shippingRates_1.shippingRates.plan_id, input.plan_id), (0, drizzle_orm_1.eq)(shippingRates_1.shippingRates.business_type, input.business_type), (0, drizzle_orm_1.eq)(shippingRates_1.shippingRates.zone_id, r.zone_id), (0, drizzle_orm_1.eq)(shippingRates_1.shippingRates.type, r.type), (0, drizzle_orm_1.eq)((0, drizzle_orm_1.sql) `LOWER(${shippingRates_1.shippingRates.mode})`, normalizedMode), finalServiceProvider
            ? (0, drizzle_orm_1.eq)((0, drizzle_orm_1.sql) `LOWER(${shippingRates_1.shippingRates.service_provider})`, finalServiceProvider)
            : (0, drizzle_orm_1.sql) `1=1`))
            .limit(1);
        if (existing.length) {
            console.log(`[upsertShippingRate] Updating existing rate ${existing[0].id} with service_provider: ${finalServiceProvider}`);
            // Build update object - only include service_provider if we have a value
            const updateData = {
                rate: fallbackRate.toString(),
                cod_charges: input.cod_charges?.toString() ?? null,
                cod_percent: input.cod_percent?.toString() ?? null,
                min_weight: toWeight(fallbackMinWeight),
                mode: normalizedMode,
                other_charges: input.other_charges?.toString() ?? null,
                last_updated: new Date(),
            };
            // Only update service_provider if we found a value
            if (finalServiceProvider) {
                updateData.service_provider = finalServiceProvider;
            }
            await client_1.db.update(shippingRates_1.shippingRates).set(updateData).where((0, drizzle_orm_1.eq)(shippingRates_1.shippingRates.id, existing[0].id));
            if (input.business_type === 'b2c') {
                await (0, b2cRateCard_service_1.replaceShippingRateSlabs)(existing[0].id, explicitSlabs);
            }
        }
        else {
            console.log(`[upsertShippingRate] Inserting new rate with service_provider: ${finalServiceProvider}`);
            await client_1.db.insert(shippingRates_1.shippingRates).values({
                id: (0, crypto_1.randomUUID)(),
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
            });
            if (input.business_type === 'b2c') {
                const [inserted] = await client_1.db
                    .select({ id: shippingRates_1.shippingRates.id })
                    .from(shippingRates_1.shippingRates)
                    .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(shippingRates_1.shippingRates.courier_id, Number(input.courier_id)), (0, drizzle_orm_1.eq)(shippingRates_1.shippingRates.plan_id, input.plan_id), (0, drizzle_orm_1.eq)(shippingRates_1.shippingRates.business_type, input.business_type), (0, drizzle_orm_1.eq)(shippingRates_1.shippingRates.zone_id, r.zone_id), (0, drizzle_orm_1.eq)(shippingRates_1.shippingRates.type, r.type), (0, drizzle_orm_1.eq)((0, drizzle_orm_1.sql) `LOWER(${shippingRates_1.shippingRates.mode})`, normalizedMode), finalServiceProvider
                    ? (0, drizzle_orm_1.eq)((0, drizzle_orm_1.sql) `LOWER(${shippingRates_1.shippingRates.service_provider})`, finalServiceProvider)
                    : (0, drizzle_orm_1.sql) `1=1`))
                    .orderBy((0, drizzle_orm_1.desc)(shippingRates_1.shippingRates.created_at))
                    .limit(1);
                if (inserted) {
                    await (0, b2cRateCard_service_1.replaceShippingRateSlabs)(inserted.id, explicitSlabs);
                }
            }
        }
    }
};
exports.upsertShippingRate = upsertShippingRate;
const createCourier = async (data) => {
    if (!data?.courierName || !data?.courierName?.trim())
        throw new Error('Courier name is required');
    if (!data?.serviceProvider)
        throw new Error('Service provider is required');
    // Validate service provider is one of the allowed providers
    const allowedProviders = ['delhivery', 'ekart', 'xpressbees'];
    const normalizedProvider = (data.serviceProvider || '').toLowerCase().trim();
    if (!allowedProviders.includes(normalizedProvider)) {
        throw new Error(`Service provider must be one of: ${allowedProviders.join(', ')}. Received: ${data.serviceProvider}`);
    }
    console.log('data', data);
    // Check if courier already exists for this service provider
    // Same courier ID can exist for different service providers
    const existing = await client_1.db
        .select()
        .from(couriers_1.couriers)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(couriers_1.couriers.id, Number(data?.courierId)), (0, drizzle_orm_1.eq)(couriers_1.couriers.serviceProvider, normalizedProvider)));
    if (existing.length > 0)
        throw new Error('Courier already exists for this service provider');
    // Validate and set businessType (default to both if not provided)
    const businessType = data?.businessType && data.businessType.length > 0 ? data.businessType : ['b2c', 'b2b'];
    // Insert new courier
    const [newCourier] = await client_1.db
        .insert(couriers_1.couriers)
        .values({
        name: data?.courierName?.trim(),
        id: Number(data?.courierId),
        serviceProvider: normalizedProvider,
        businessType: businessType,
    })
        .returning();
    return newCourier;
};
exports.createCourier = createCourier;
const deleteShippingRate = async (courierId, planId, businessType, zoneId, serviceProvider, mode) => {
    console.log('zone id', zoneId);
    const normalizedMode = (0, b2cRateCard_service_1.normalizeB2CShippingMode)(mode);
    const normalizedServiceProvider = (0, b2cRateCard_service_1.normalizeB2CServiceProvider)(serviceProvider);
    if (businessType === 'b2c') {
        const deleted = await client_1.db
            .delete(shippingRates_1.shippingRates)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(shippingRates_1.shippingRates.courier_id, courierId), (0, drizzle_orm_1.eq)(shippingRates_1.shippingRates.plan_id, planId), (0, drizzle_orm_1.eq)(shippingRates_1.shippingRates.business_type, 'b2c'), normalizedMode ? (0, drizzle_orm_1.eq)((0, drizzle_orm_1.sql) `LOWER(${shippingRates_1.shippingRates.mode})`, normalizedMode) : (0, drizzle_orm_1.sql) `1=1`, normalizedServiceProvider
            ? (0, drizzle_orm_1.eq)((0, drizzle_orm_1.sql) `LOWER(${shippingRates_1.shippingRates.service_provider})`, normalizedServiceProvider)
            : (0, drizzle_orm_1.sql) `1=1`, zoneId ? (0, drizzle_orm_1.eq)(shippingRates_1.shippingRates.zone_id, zoneId) : (0, drizzle_orm_1.sql) `1=1`))
            .returning();
        return deleted.length > 0 ? deleted : null;
    }
    if (businessType === 'b2b') {
        if (zoneId) {
            // ✅ B2B Zone-level delete
            const deleted = await client_1.db
                .delete(shippingRates_1.shippingRates)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(shippingRates_1.shippingRates.courier_id, courierId), (0, drizzle_orm_1.eq)(shippingRates_1.shippingRates.plan_id, planId), (0, drizzle_orm_1.eq)(shippingRates_1.shippingRates.business_type, 'b2b'), normalizedMode ? (0, drizzle_orm_1.eq)((0, drizzle_orm_1.sql) `LOWER(${shippingRates_1.shippingRates.mode})`, normalizedMode) : (0, drizzle_orm_1.sql) `1=1`, normalizedServiceProvider
                ? (0, drizzle_orm_1.eq)((0, drizzle_orm_1.sql) `LOWER(${shippingRates_1.shippingRates.service_provider})`, normalizedServiceProvider)
                : (0, drizzle_orm_1.sql) `1=1`, (0, drizzle_orm_1.eq)(shippingRates_1.shippingRates.zone_id, zoneId)))
                .returning();
            return deleted.length > 0 ? deleted : null;
        }
        else {
            // ✅ B2B Courier-level delete (all zones for that courier+plan)
            const deleted = await client_1.db
                .delete(shippingRates_1.shippingRates)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(shippingRates_1.shippingRates.courier_id, courierId), (0, drizzle_orm_1.eq)(shippingRates_1.shippingRates.plan_id, planId), (0, drizzle_orm_1.eq)(shippingRates_1.shippingRates.business_type, 'b2b'), normalizedMode ? (0, drizzle_orm_1.eq)((0, drizzle_orm_1.sql) `LOWER(${shippingRates_1.shippingRates.mode})`, normalizedMode) : (0, drizzle_orm_1.sql) `1=1`, normalizedServiceProvider
                ? (0, drizzle_orm_1.eq)((0, drizzle_orm_1.sql) `LOWER(${shippingRates_1.shippingRates.service_provider})`, normalizedServiceProvider)
                : (0, drizzle_orm_1.sql) `1=1`))
                .returning();
            return deleted.length > 0 ? deleted : null;
        }
    }
    return null;
};
exports.deleteShippingRate = deleteShippingRate;
const deleteCourierService = async (id, serviceProvider) => {
    const exists = await client_1.db
        .select()
        .from(couriers_1.couriers)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(couriers_1.couriers.id, Number(id)), (0, drizzle_orm_1.eq)(couriers_1.couriers.serviceProvider, serviceProvider)));
    if (exists.length === 0)
        throw new Error('Courier not found');
    await client_1.db
        .delete(couriers_1.couriers)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(couriers_1.couriers.id, Number(id)), (0, drizzle_orm_1.eq)(couriers_1.couriers.serviceProvider, serviceProvider)));
};
exports.deleteCourierService = deleteCourierService;

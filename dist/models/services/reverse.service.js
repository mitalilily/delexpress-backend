"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.quoteReverseForOrder = quoteReverseForOrder;
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../client");
const b2cOrders_1 = require("../schema/b2cOrders");
const couriers_1 = require("../schema/couriers");
const locations_1 = require("../schema/locations");
const userPlans_1 = require("../schema/userPlans");
const zones_1 = require("../schema/zones");
const b2cRateCard_service_1 = require("./b2cRateCard.service");
function normalizeTags(tags) {
    if (Array.isArray(tags))
        return tags.map((t) => String(t).toLowerCase());
    return [];
}
async function fetchLocationByPincode(pincode) {
    const rows = await client_1.db
        .select({
        id: locations_1.locations.id,
        pincode: locations_1.locations.pincode,
        city: locations_1.locations.city,
        state: locations_1.locations.state,
        country: locations_1.locations.country,
        tags: locations_1.locations.tags,
    })
        .from(locations_1.locations)
        .where((0, drizzle_orm_1.eq)(locations_1.locations.pincode, pincode))
        .limit(1);
    const row = rows[0];
    if (!row)
        return null;
    return { ...row, tags: normalizeTags(row.tags) };
}
const hasTag = (loc, tag) => !!loc && Array.isArray(loc.tags) && loc.tags.includes(tag.toLowerCase());
const ZONE_KEY_TO_DB_CODE = {
    METRO_TO_METRO: 'Metro to Metro',
    ROI: 'ROI',
    SPECIAL_ZONE: 'Special Zone',
    WITHIN_CITY: 'Within City',
    WITHIN_REGION: 'Within Region',
    WITHIN_STATE: 'Within State',
};
function determineB2CZoneKey(origin, destination) {
    if (!origin || !destination) {
        return { key: 'ROI', reason: 'origin or destination missing' };
    }
    if (hasTag(origin, 'special_zones') ||
        hasTag(origin, 'special_zone') ||
        hasTag(destination, 'special_zones') ||
        hasTag(destination, 'special_zone') ||
        hasTag(origin, 'special') ||
        hasTag(destination, 'special')) {
        return { key: 'SPECIAL_ZONE', reason: 'special zone tag present' };
    }
    if (origin.city &&
        destination.city &&
        origin.state &&
        destination.state &&
        (origin.city ?? '').toLowerCase() === (destination.city ?? '').toLowerCase() &&
        (origin.state ?? '').toLowerCase() === (destination.state ?? '').toLowerCase()) {
        return { key: 'WITHIN_CITY', reason: 'same city + same state' };
    }
    if (origin.state &&
        destination.state &&
        (origin.state ?? '').toLowerCase() === (destination.state ?? '').toLowerCase() &&
        (origin.city ?? '').toLowerCase() !== (destination.city ?? '').toLowerCase()) {
        return { key: 'WITHIN_STATE', reason: 'same state (different city)' };
    }
    if (hasTag(origin, 'metros') &&
        hasTag(destination, 'metros') &&
        (origin.city ?? '').toLowerCase() !== (destination.city ?? '').toLowerCase()) {
        return { key: 'METRO_TO_METRO', reason: 'both metros (different cities, cross-state allowed)' };
    }
    const regions = ['north', 'south', 'east', 'west'];
    for (const r of regions) {
        if (hasTag(origin, r) && hasTag(destination, r)) {
            return { key: 'WITHIN_REGION', reason: `both in region ${r}` };
        }
    }
    return { key: 'ROI', reason: 'fallback Rest of India' };
}
async function fetchZoneIdByKey(key) {
    const dbCodeRaw = ZONE_KEY_TO_DB_CODE[key] ?? ZONE_KEY_TO_DB_CODE['ROI'];
    const dbCode = dbCodeRaw?.trim();
    if (!dbCode)
        throw new Error('fetchZoneIdByKey called with empty dbCode');
    const exactTrim = await client_1.db
        .select({ id: zones_1.zones.id, code: zones_1.zones.code, name: zones_1.zones.name })
        .from(zones_1.zones)
        .where((0, drizzle_orm_1.sql) `trim(${zones_1.zones.code}) = ${dbCode}`)
        .limit(1);
    if (exactTrim?.[0]?.id)
        return { id: exactTrim[0].id, code: exactTrim[0].code, name: exactTrim[0].name };
    const ci = await client_1.db
        .select({ id: zones_1.zones.id, code: zones_1.zones.code, name: zones_1.zones.name })
        .from(zones_1.zones)
        .where((0, drizzle_orm_1.sql) `lower(trim(${zones_1.zones.code})) = ${dbCode.toLowerCase()}`)
        .limit(1);
    if (ci?.[0]?.id)
        return { id: ci[0].id, code: ci[0].code, name: ci[0].name };
    const nameMatch = await client_1.db
        .select({ id: zones_1.zones.id, code: zones_1.zones.code, name: zones_1.zones.name })
        .from(zones_1.zones)
        .where((0, drizzle_orm_1.sql) `lower(trim(${zones_1.zones.name})) = ${dbCode.toLowerCase()}`)
        .limit(1);
    if (nameMatch?.[0]?.id)
        return { id: nameMatch[0].id, code: nameMatch[0].code, name: nameMatch[0].name };
    const roiKeyLower = (ZONE_KEY_TO_DB_CODE['ROI'] ?? 'ROI').toLowerCase().trim();
    const fallback = await client_1.db
        .select({ id: zones_1.zones.id, code: zones_1.zones.code, name: zones_1.zones.name })
        .from(zones_1.zones)
        .where((0, drizzle_orm_1.sql) `lower(trim(${zones_1.zones.code})) = ${roiKeyLower} OR lower(trim(${zones_1.zones.name})) = ${roiKeyLower}`)
        .limit(1);
    if (fallback?.[0]?.id)
        return { id: fallback[0].id, code: fallback[0].code, name: fallback[0].name };
    throw new Error('Zone lookup failed: ROI zone missing');
}
const convertKgToGrams = (value, fallback = 500) => {
    const numericValue = Number(value ?? 0);
    if (!Number.isFinite(numericValue) || numericValue <= 0)
        return fallback;
    return Math.max(1, Math.round(numericValue * 1000));
};
async function quoteReverseForOrder(orderId, _overrideWeightGrams) {
    // 1) Fetch order and resolve courier
    const [order] = await client_1.db.select().from(b2cOrders_1.b2c_orders).where((0, drizzle_orm_1.eq)(b2cOrders_1.b2c_orders.id, orderId)).limit(1);
    if (!order)
        throw new Error('Order not found');
    // Always trust server-stored order weight; ignore any client override
    const weightGrams = convertKgToGrams(order.weight);
    const reverseDestPincode = order?.pickup_details?.pincode || order.pincode;
    let resolvedCourierId = order.courier_id ? Number(order.courier_id) : undefined;
    if (!resolvedCourierId) {
        const partnerName = (order.courier_partner || '').trim();
        const provider = (order.integration_type || '').trim();
        if (partnerName && provider) {
            const [c] = await client_1.db
                .select({ id: couriers_1.couriers.id })
                .from(couriers_1.couriers)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(couriers_1.couriers.serviceProvider, provider), (0, drizzle_orm_1.eq)(couriers_1.couriers.isEnabled, true), (0, drizzle_orm_1.sql) `${couriers_1.couriers.name} ILIKE ${'%' + partnerName + '%'}`))
                .limit(1);
            if (c?.id)
                resolvedCourierId = Number(c.id);
        }
    }
    if (!resolvedCourierId)
        throw new Error('Courier not associated with the order');
    // 2) Determine zone (origin = consignee, destination = original pickup)
    const [originLoc, destLoc] = await Promise.all([
        order.pincode ? fetchLocationByPincode(order.pincode) : Promise.resolve(null),
        reverseDestPincode ? fetchLocationByPincode(reverseDestPincode) : Promise.resolve(null),
    ]);
    const { key: zoneKey } = determineB2CZoneKey(originLoc, destLoc);
    const zoneRow = await fetchZoneIdByKey(zoneKey);
    // 3) Fetch user plan (no slab)
    const [uPlan] = await client_1.db
        .select({ planId: userPlans_1.userPlans.plan_id })
        .from(userPlans_1.userPlans)
        .where((0, drizzle_orm_1.eq)(userPlans_1.userPlans.userId, order.user_id))
        .limit(1);
    const planId = uPlan?.planId;
    const provider = (order.integration_type || '').toLowerCase().trim();
    let rates = planId
        ? await (0, b2cRateCard_service_1.fetchResolvedB2CRateCards)({
            planId,
            zoneId: zoneRow.id,
            courierId: resolvedCourierId,
            serviceProvider: provider || null,
            mode: order.shipping_mode ?? null,
            type: 'rto',
        })
        : [];
    if (!rates?.length) {
        console.warn('[ReverseQuote] No RTO rows for zone=%s provider=%s plan=%s', zoneRow.code, provider, planId || 'none');
        throw new Error('No reverse rate available for this zone/weight');
    }
    const selected = rates[0];
    const quote = (0, b2cRateCard_service_1.computeB2CRateCardCharge)({
        actual_weight_g: weightGrams,
        length_cm: Number(order.length ?? 0),
        width_cm: Number(order.breadth ?? 0),
        height_cm: Number(order.height ?? 0),
        rateCard: selected,
        selected_max_slab_weight: order.selected_max_slab_weight ?? null,
    });
    if (selected.slabs.length && quote.freight <= 0) {
        throw new Error('No reverse rate available for this zone/weight');
    }
    const rate = Number(quote.freight);
    const zoneCode = (zoneRow.code || '').toUpperCase();
    const eddDays = zoneCode === 'A' ? 2 : zoneCode === 'B' ? 3 : zoneCode === 'C' ? 4 : zoneCode === 'D' ? 5 : 6;
    const tagsArray = Array.isArray(destLoc?.tags) ? destLoc.tags : [];
    const oda = tagsArray.map((t) => String(t).toLowerCase()).includes('oda');
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
    };
}

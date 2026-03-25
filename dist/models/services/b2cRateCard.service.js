"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeB2CShippingMode = normalizeB2CShippingMode;
exports.normalizeB2CServiceProvider = normalizeB2CServiceProvider;
exports.normaliseRateCardSlabs = normaliseRateCardSlabs;
exports.validateRateCardSlabs = validateRateCardSlabs;
exports.fetchShippingRateSlabs = fetchShippingRateSlabs;
exports.fetchResolvedB2CRateCards = fetchResolvedB2CRateCards;
exports.slabContainsWeight = slabContainsWeight;
exports.findMatchingSlabIndex = findMatchingSlabIndex;
exports.formatCourierSlabDisplayName = formatCourierSlabDisplayName;
exports.computeB2CRateCardCharge = computeB2CRateCardCharge;
exports.replaceShippingRateSlabs = replaceShippingRateSlabs;
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../client");
const shippingRates_1 = require("../schema/shippingRates");
const chargeableFreight_1 = require("./pricing/chargeableFreight");
function normalizeB2CShippingMode(value) {
    const raw = String(value ?? '')
        .trim()
        .toLowerCase();
    if (!raw)
        return '';
    if (['air', 'a', 'express'].includes(raw))
        return 'air';
    if (['surface', 's', 'ground'].includes(raw))
        return 'surface';
    return raw;
}
function normalizeB2CServiceProvider(value) {
    return String(value ?? '')
        .trim()
        .toLowerCase();
}
function toNumber(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}
function normaliseSlabInput(slab) {
    const weightFrom = Math.max(0, toNumber(slab.weight_from));
    const rawWeightTo = slab.weight_to === undefined || slab.weight_to === null ? null : toNumber(slab.weight_to);
    const weightTo = rawWeightTo !== null && rawWeightTo < weightFrom ? weightFrom : rawWeightTo;
    const extraWeightUnitRaw = slab.extra_weight_unit === undefined || slab.extra_weight_unit === null
        ? null
        : toNumber(slab.extra_weight_unit);
    const extraWeightUnit = extraWeightUnitRaw !== null && extraWeightUnitRaw > 0 ? extraWeightUnitRaw : null;
    const extraRateRaw = slab.extra_rate === undefined || slab.extra_rate === null ? null : toNumber(slab.extra_rate);
    const extraRate = extraRateRaw !== null && extraRateRaw >= 0 ? extraRateRaw : null;
    return {
        weight_from: weightFrom,
        weight_to: weightTo,
        rate: toNumber(slab.rate),
        extra_rate: extraRate,
        extra_weight_unit: extraWeightUnit,
    };
}
function normaliseRateCardSlabs(slabs = []) {
    return slabs
        .map(normaliseSlabInput)
        .filter((slab) => slab.rate > 0)
        .sort((a, b) => a.weight_from - b.weight_from || (a.weight_to ?? Infinity) - (b.weight_to ?? Infinity));
}
function validateRateCardSlabs(slabs) {
    for (let index = 0; index < slabs.length; index += 1) {
        const slab = slabs[index];
        if (slab.weight_to !== null && slab.weight_to < slab.weight_from) {
            throw new Error(`Invalid slab range at row ${index + 1}: weight_to cannot be less than weight_from`);
        }
        if (slab.extra_rate !== null && slab.extra_weight_unit === null) {
            throw new Error(`Invalid slab at row ${index + 1}: extra_weight_unit is required when extra_rate is set`);
        }
        if (slab.extra_weight_unit !== null && slab.extra_rate === null) {
            throw new Error(`Invalid slab at row ${index + 1}: extra_rate is required when extra_weight_unit is set`);
        }
    }
    for (let index = 1; index < slabs.length; index += 1) {
        const previous = slabs[index - 1];
        const current = slabs[index];
        if (previous.weight_to === null) {
            throw new Error(`Invalid slab configuration: open-ended slab at row ${index} must be the last slab`);
        }
        if (current.weight_from < previous.weight_to) {
            throw new Error(`Overlapping slab ranges are not allowed: ${previous.weight_from}-${previous.weight_to} overlaps ${current.weight_from}-${current.weight_to ?? 'open'}`);
        }
    }
}
async function fetchShippingRateSlabs(rateIds) {
    if (!rateIds.length)
        return [];
    return client_1.db
        .select()
        .from(shippingRates_1.shippingRateSlabs)
        .where((0, drizzle_orm_1.inArray)(shippingRates_1.shippingRateSlabs.shipping_rate_id, rateIds))
        .orderBy((0, drizzle_orm_1.asc)(shippingRates_1.shippingRateSlabs.shipping_rate_id), (0, drizzle_orm_1.asc)(shippingRates_1.shippingRateSlabs.weight_from), (0, drizzle_orm_1.asc)(shippingRates_1.shippingRateSlabs.weight_to));
}
async function fetchResolvedB2CRateCards(filters) {
    const conditions = [
        (0, drizzle_orm_1.eq)(shippingRates_1.shippingRates.plan_id, filters.planId),
        (0, drizzle_orm_1.eq)(shippingRates_1.shippingRates.business_type, 'b2c'),
        (0, drizzle_orm_1.eq)(shippingRates_1.shippingRates.zone_id, filters.zoneId),
    ];
    if (filters.courierId !== undefined) {
        conditions.push((0, drizzle_orm_1.eq)(shippingRates_1.shippingRates.courier_id, filters.courierId));
    }
    if (filters.type) {
        conditions.push((0, drizzle_orm_1.eq)(shippingRates_1.shippingRates.type, filters.type));
    }
    const requestedServiceProvider = normalizeB2CServiceProvider(filters.serviceProvider);
    const requestedMode = normalizeB2CShippingMode(filters.mode);
    const allRateRows = await client_1.db.select().from(shippingRates_1.shippingRates).where((0, drizzle_orm_1.and)(...conditions));
    const providerFilteredRows = requestedServiceProvider
        ? (() => {
            const exactProviderRows = allRateRows.filter((row) => normalizeB2CServiceProvider(row.service_provider) === requestedServiceProvider);
            if (exactProviderRows.length)
                return exactProviderRows;
            return allRateRows.filter((row) => !normalizeB2CServiceProvider(row.service_provider));
        })()
        : allRateRows;
    const rateRows = requestedMode
        ? (() => {
            const exactModeRows = providerFilteredRows.filter((row) => normalizeB2CShippingMode(row.mode) === requestedMode);
            if (exactModeRows.length)
                return exactModeRows;
            return providerFilteredRows.filter((row) => !normalizeB2CShippingMode(row.mode));
        })()
        : providerFilteredRows;
    const slabs = await fetchShippingRateSlabs(rateRows.map((row) => row.id));
    const slabMap = new Map();
    for (const slab of slabs) {
        const list = slabMap.get(slab.shipping_rate_id) || [];
        list.push({
            id: slab.id,
            weight_from: toNumber(slab.weight_from),
            weight_to: slab.weight_to === null ? null : toNumber(slab.weight_to),
            rate: toNumber(slab.rate),
            extra_rate: slab.extra_rate === null ? null : toNumber(slab.extra_rate),
            extra_weight_unit: slab.extra_weight_unit === null ? null : toNumber(slab.extra_weight_unit),
        });
        slabMap.set(slab.shipping_rate_id, list);
    }
    return rateRows.map((row) => ({
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
    }));
}
function slabContainsWeight(chargeableWeightKg, slab, slabIndex) {
    const start = slab.weight_from;
    const end = slab.weight_to ?? Infinity;
    const lowerBoundMatches = slabIndex === 0 ? chargeableWeightKg >= start : chargeableWeightKg > start;
    return lowerBoundMatches && chargeableWeightKg <= end;
}
function findMatchingSlabIndex(chargeableWeightG, slabs) {
    const chargeableWeightKg = chargeableWeightG / 1000;
    return slabs.findIndex((slab, index) => slabContainsWeight(chargeableWeightKg, slab, index));
}
function findMatchingSlab(chargeableWeightG, slabs) {
    const matchingIndex = findMatchingSlabIndex(chargeableWeightG, slabs);
    return matchingIndex >= 0 ? slabs[matchingIndex] : null;
}
function calculateChargeableWeight(params) {
    return (0, chargeableFreight_1.calculateFreight)({
        actual_weight_g: params.actual_weight_g,
        length_cm: params.length_cm,
        width_cm: params.width_cm,
        height_cm: params.height_cm,
        slab_weight_g: 1,
        base_price: 0,
    });
}
function getLastFiniteSlab(slabs) {
    for (let index = slabs.length - 1; index >= 0; index -= 1) {
        if (slabs[index].weight_to !== null)
            return slabs[index];
    }
    return null;
}
function formatCourierSlabDisplayName(courierName, slabWeightTo) {
    if (slabWeightTo === null || slabWeightTo === undefined || !Number.isFinite(Number(slabWeightTo))) {
        return courierName;
    }
    return `${courierName} - (${Number(slabWeightTo)}) kg`;
}
function computeB2CRateCardCharge(params) {
    const preview = calculateChargeableWeight({
        actual_weight_g: params.actual_weight_g,
        length_cm: params.length_cm,
        width_cm: params.width_cm,
        height_cm: params.height_cm,
    });
    if (!params.rateCard.slabs.length) {
        const legacy = (0, chargeableFreight_1.calculateFreight)({
            actual_weight_g: params.actual_weight_g,
            length_cm: params.length_cm,
            width_cm: params.width_cm,
            height_cm: params.height_cm,
            slab_weight_g: Math.max(1, params.rateCard.min_weight * 1000 || 1),
            base_price: params.rateCard.base_rate,
        });
        return {
            ...legacy,
            slab_weight: params.rateCard.min_weight ? params.rateCard.min_weight * 1000 : null,
            base_price: params.rateCard.base_rate,
            selected_slab: null,
            max_slab_weight: params.rateCard.min_weight || null,
            matched_by: 'legacy',
        };
    }
    const chargeableWeightKg = preview.chargeable_weight / 1000;
    const selectedMaxSlabWeight = params.selected_max_slab_weight === undefined || params.selected_max_slab_weight === null
        ? null
        : toNumber(params.selected_max_slab_weight);
    const lastFiniteSlab = getLastFiniteSlab(params.rateCard.slabs);
    if (selectedMaxSlabWeight !== null) {
        const explicitlySelectedSlab = params.rateCard.slabs.find((slab) => slab.weight_to !== null &&
            Math.abs(Number(slab.weight_to) - Number(selectedMaxSlabWeight)) < 0.0001) || null;
        if (explicitlySelectedSlab) {
            if (explicitlySelectedSlab.weight_to !== null &&
                chargeableWeightKg <= explicitlySelectedSlab.weight_to) {
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
                };
            }
            if (lastFiniteSlab &&
                explicitlySelectedSlab.weight_to !== null &&
                lastFiniteSlab.weight_to !== null &&
                Math.abs(Number(lastFiniteSlab.weight_to) - Number(explicitlySelectedSlab.weight_to)) <
                    0.0001 &&
                chargeableWeightKg > explicitlySelectedSlab.weight_to &&
                explicitlySelectedSlab.extra_rate !== null &&
                explicitlySelectedSlab.extra_weight_unit !== null) {
                const extraUnits = Math.ceil((chargeableWeightKg - explicitlySelectedSlab.weight_to) /
                    explicitlySelectedSlab.extra_weight_unit);
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
                };
            }
        }
    }
    const selectedSlab = findMatchingSlab(preview.chargeable_weight, params.rateCard.slabs);
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
        };
    }
    if (lastFiniteSlab &&
        lastFiniteSlab.weight_to !== null &&
        chargeableWeightKg > lastFiniteSlab.weight_to &&
        lastFiniteSlab.extra_rate !== null &&
        lastFiniteSlab.extra_weight_unit !== null) {
        const extraUnits = Math.ceil((chargeableWeightKg - lastFiniteSlab.weight_to) / lastFiniteSlab.extra_weight_unit);
        const extraFreight = lastFiniteSlab.rate + extraUnits * lastFiniteSlab.extra_rate;
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
        };
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
    };
}
async function replaceShippingRateSlabs(shippingRateId, slabs) {
    const normalised = normaliseRateCardSlabs(slabs);
    validateRateCardSlabs(normalised);
    await client_1.db.delete(shippingRates_1.shippingRateSlabs).where((0, drizzle_orm_1.eq)(shippingRates_1.shippingRateSlabs.shipping_rate_id, shippingRateId));
    if (!normalised.length)
        return;
    await client_1.db.insert(shippingRates_1.shippingRateSlabs).values(normalised.map((slab) => ({
        shipping_rate_id: shippingRateId,
        weight_from: slab.weight_from.toFixed(3),
        weight_to: slab.weight_to === null ? null : slab.weight_to.toFixed(3),
        rate: slab.rate.toFixed(2),
        extra_rate: slab.extra_rate === null ? null : slab.extra_rate.toFixed(2),
        extra_weight_unit: slab.extra_weight_unit === null ? null : slab.extra_weight_unit.toFixed(3),
        updated_at: new Date(),
    })));
}

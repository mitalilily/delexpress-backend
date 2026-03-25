"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkServiceabilityController = void 0;
const shiprocket_service_1 = require("../../models/services/shiprocket.service");
const externalApiHelpers_1 = require("../../utils/externalApiHelpers");
const orderAmount_1 = require("../../utils/orderAmount");
// Helper function to build serviceability options
const buildServiceabilityOptions = (body) => {
    const options = {};
    const pickupIdRaw = body?.pickupId ?? body?.pickup_id;
    if (pickupIdRaw !== undefined && pickupIdRaw !== null && pickupIdRaw !== '') {
        options.pickupId = String(pickupIdRaw);
    }
    if (body?.is_reverse === true || body?.is_reverse === 'true' || body?.isReverse === true) {
        options.isReverseShipment = true;
    }
    return options;
};
const formatDateOnly = (date) => date.toISOString().split('T')[0];
const normalizeDateString = (value) => {
    if (!value)
        return null;
    if (value instanceof Date && !isNaN(value.getTime())) {
        return formatDateOnly(value);
    }
    if (typeof value === 'number') {
        const date = new Date(value);
        return isNaN(date.getTime()) ? null : formatDateOnly(date);
    }
    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (!trimmed)
            return null;
        const date = new Date(trimmed);
        return isNaN(date.getTime()) ? null : formatDateOnly(date);
    }
    return null;
};
const normalizeDaysToDate = (value) => {
    if (value === undefined || value === null)
        return null;
    let days = null;
    if (typeof value === 'number' && !isNaN(value)) {
        days = value;
    }
    else if (typeof value === 'string') {
        // Handle ranges like "3-5" by taking the maximum (more conservative estimate)
        const rangeMatch = value.match(/(\d+)\s*-\s*(\d+)/);
        if (rangeMatch) {
            days = Math.max(Number(rangeMatch[1]), Number(rangeMatch[2]));
        }
        else {
            // Handle single number like "3" or "3 Days"
            const match = value.match(/(\d+)/);
            if (match) {
                days = Number(match[1]);
            }
        }
    }
    if (days === null || isNaN(days))
        return null;
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + Math.max(0, days));
    return formatDateOnly(targetDate);
};
const computeEstimatedDeliveryDate = (courier) => {
    const dateCandidates = [
        courier?.estimated_delivery_date,
        courier?.expected_delivery_date,
        courier?.edd,
        courier?.estimated_delivery,
    ];
    for (const candidate of dateCandidates) {
        const normalized = normalizeDateString(candidate);
        if (normalized)
            return normalized;
    }
    const daysCandidates = [courier?.estimated_delivery_days, courier?.tat];
    for (const candidate of daysCandidates) {
        const normalized = normalizeDaysToDate(candidate);
        if (normalized)
            return normalized;
    }
    // Fallback: if no date or days found, use default of 5 days from now
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + 5);
    return formatDateOnly(targetDate);
};
/**
 * Check pincode serviceability and get available couriers with rates
 * GET /api/v1/serviceability (query params)
 * POST /api/v1/serviceability (body params)
 */
const checkServiceabilityController = async (req, res) => {
    try {
        const userId = req.userId; // From requireApiKey middleware
        // Support both GET (query) and POST (body) requests
        const params = req.method === 'POST' ? req.body : req.query;
        const { origin, destination, payment_type = 'prepaid', weight = 500, length = 10, breadth = 10, height = 10, shipment_type, pickup_id, } = params;
        // Validate required fields - destination is always required
        // Origin can be omitted if pickup_id is provided
        if (!destination) {
            return res.status(400).json({
                success: false,
                error: 'Missing required parameters',
                message: 'destination pincode is required',
            });
        }
        if (!origin && !pickup_id) {
            return res.status(400).json({
                success: false,
                error: 'Missing required parameters',
                message: 'Either origin pincode or pickup_id is required',
            });
        }
        const orderAmountResult = (0, orderAmount_1.extractOrderAmountFromBody)(params);
        if (orderAmountResult.invalid) {
            return res.status(400).json({
                success: false,
                error: 'order_amount must be a non-negative number',
                message: 'order_amount must be numeric and non-negative',
            });
        }
        // Build serviceability options using the helper function
        const serviceabilityOptions = buildServiceabilityOptions(params);
        // Fetch available couriers (returns all available delivery carriers)
        const couriers = await (0, shiprocket_service_1.fetchAvailableCouriersWithRates)({
            origin: origin ? Number(origin) : 0, // Will be determined from pickup address if not provided
            destination: Number(destination),
            payment_type: payment_type,
            order_amount: orderAmountResult.value,
            shipment_type: shipment_type && ['b2b', 'b2c'].includes(shipment_type)
                ? shipment_type
                : undefined,
            weight: Number(weight),
            length: Number(length),
            breadth: Number(breadth),
            height: Number(height),
            ...serviceabilityOptions,
        }, userId);
        // Format response to return all available delivery carriers with rates
        const formattedCouriers = (couriers ?? []).map((courier) => ({
            courier_option_key: courier.courier_option_key || null,
            courier_id: courier.id,
            courier_name: courier.displayName || courier.name,
            rate: courier.rate || courier.freight_charges || courier.charge || 0,
            chargeable_weight_g: courier.chargeable_weight ?? null,
            volumetric_weight_g: courier.volumetric_weight ?? null,
            slabs: courier.slabs ?? null,
            max_slab_weight: courier.max_slab_weight ?? null,
            estimated_delivery_days: courier.estimated_delivery_days || courier.tat || '3-5',
            estimated_delivery_date: computeEstimatedDeliveryDate(courier),
            serviceable: courier.serviceable !== false,
            cod_available: courier.cod_available !== false,
            zone: courier.zone,
            rate_details: courier?.localRates ?? {}, // expose full local rates object without reusing camelCase key
            provider_code: (0, externalApiHelpers_1.getOpaqueProviderCode)(courier.integration_type), // Opaque code instead of integration_type
        }));
        res.status(200).json({
            success: true,
            data: {
                couriers: formattedCouriers,
                origin_pincode: origin,
                destination_pincode: destination,
                payment_type,
                weight_grams: weight,
            },
        });
    }
    catch (error) {
        console.error('Error checking serviceability via API:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to check serviceability',
            message: error.message || 'Internal server error',
        });
    }
};
exports.checkServiceabilityController = checkServiceabilityController;

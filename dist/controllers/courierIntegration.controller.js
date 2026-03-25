"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createCourierController = exports.fetchAvailableCouriersToUser = exports.fetchAvailableCouriersForGuestController = exports.fetchAvailableCouriers = exports.getToken = exports.getCourier = exports.getCouriers = void 0;
const axios_1 = __importDefault(require("axios"));
const courierIntegration_service_1 = require("../models/services/courierIntegration.service");
const shiprocket_service_1 = require("../models/services/shiprocket.service");
const orderAmount_1 = require("../utils/orderAmount");
const parseOptionalBoolean = (value) => {
    if (typeof value === 'boolean')
        return value;
    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (['true', '1', 'yes', 'y'].includes(normalized))
            return true;
        if (['false', '0', 'no', 'n'].includes(normalized))
            return false;
    }
    return undefined;
};
const parseOptionalNumber = (value) => {
    if (value === null || value === undefined || value === '')
        return undefined;
    const num = Number(value);
    return Number.isNaN(num) ? undefined : num;
};
const extractPreferredCarrierIds = (raw) => {
    if (!Array.isArray(raw))
        return undefined;
    const ids = raw
        .map((val) => parseOptionalNumber(val))
        .filter((val) => typeof val === 'number');
    return ids.length ? ids : undefined;
};
const buildServiceabilityOptions = (body) => {
    const options = {};
    const pickupIdRaw = body?.pickupId ?? body?.pickup_id;
    if (pickupIdRaw !== undefined && pickupIdRaw !== null && pickupIdRaw !== '') {
        options.pickupId = String(pickupIdRaw);
    }
    const preferredCarrierIds = extractPreferredCarrierIds(body?.preferred_carriers ?? body?.preferredCarriers);
    if (preferredCarrierIds) {
        options.preferred_carriers = preferredCarrierIds;
    }
    const deliveryType = parseOptionalNumber(body?.delivery_type ?? body?.deliveryType);
    if (deliveryType !== undefined) {
        options.delivery_type = deliveryType;
    }
    const extraInfo = parseOptionalBoolean(body?.extra_info ?? body?.extraInfo) ?? undefined;
    if (extraInfo !== undefined) {
        options.extra_info = extraInfo;
    }
    const costInfo = parseOptionalBoolean(body?.cost_info ?? body?.costInfo) ?? undefined;
    if (costInfo !== undefined) {
        options.cost_info = costInfo;
    }
    const explicitSource = parseOptionalNumber(body?.source_pincode ?? body?.sourcePincode);
    if (explicitSource !== undefined) {
        options.source_pincode = explicitSource;
    }
    const explicitDestination = parseOptionalNumber(body?.destination_pincode ?? body?.destinationPincode);
    if (explicitDestination !== undefined) {
        options.destination_pincode = explicitDestination;
    }
    const isReverse = parseOptionalBoolean(body?.isReverse ?? body?.is_reverse) ??
        (typeof body?.payment_type === 'string' && body.payment_type.toLowerCase() === 'reverse'
            ? true
            : undefined);
    if (isReverse !== undefined) {
        options.isReverse = isReverse;
    }
    // Lightweight flag so downstream can optimise for calculator vs shipment flows
    const isCalculator = body?.context === 'rate_calculator' ||
        body?.isCalculator === true ||
        body?.is_calculator === true;
    if (isCalculator) {
        options.isCalculator = true;
    }
    return options;
};
// src/controllers/courier.controller.ts
const getCouriers = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;
        // ✅ Extract filters from query
        const name = req.query.name?.toString();
        const masterCompany = req.query.masterCompany?.toString();
        const podAvailable = req.query.podAvailable?.toString(); // "yes" | "no"
        const realtimeTracking = req.query.realtimeTracking?.toString();
        const isHyperlocal = req.query.isHyperlocal;
        // ✅ Validate and map sortBy
        const rawSortBy = req.query.sortBy?.toString();
        const sortBy = ['latest', 'oldest', 'az', 'za'].includes(rawSortBy ?? '')
            ? rawSortBy
            : undefined;
        const filters = {
            name,
            masterCompany,
            podAvailable,
            realtimeTracking,
            isHyperlocal: isHyperlocal === 'true' ? true : isHyperlocal === 'false' ? false : undefined,
        };
        const [couriers, summary, totalCount] = await Promise.all([
            (0, courierIntegration_service_1.getAllCouriersPaginated)({ limit, offset, filters, sortBy }),
            (0, courierIntegration_service_1.getCourierSummary)(),
            (0, courierIntegration_service_1.getCourierCount)(filters),
        ]);
        res.json({
            status: 'success',
            data: {
                summary,
                couriers,
                totalCount,
                page,
                limit,
            },
        });
    }
    catch (error) {
        console.error('[getCouriers] error:', error);
        res.status(500).json({ status: 'error', message: 'Failed to fetch couriers and summary.' });
    }
};
exports.getCouriers = getCouriers;
const getCourier = async (req, res) => {
    try {
        const id = Number(req.params.id);
        if (isNaN(id))
            return res.status(400).json({ status: 'error', message: 'Invalid ID.' });
        const courier = await (0, courierIntegration_service_1.getCourierById)(id);
        if (!courier)
            return res.status(404).json({ status: 'error', message: 'Courier not found.' });
        res.json({ status: 'success', data: courier });
    }
    catch (error) {
        res.status(500).json({ status: 'error', message: 'Failed to fetch courier.' });
    }
};
exports.getCourier = getCourier;
let token = null;
let tokenExpiry = null;
const getToken = async () => {
    try {
        if (token && tokenExpiry && Date.now() < tokenExpiry)
            return token;
        const res = await axios_1.default.post(`${process.env.SHIPROCKET_API_BASE}/auth/login`, {
            email: process.env.SHIPROCKET_EMAIL,
            password: process.env.SHIPROCKET_PASSWORD,
        });
        token = res.data.token;
        tokenExpiry = Date.now() + 23 * 60 * 60 * 1000; // ~23 hours
        return token ?? '';
    }
    catch (error) {
        console.error('Shiprocket auth error:', error.response?.data || error.message);
        throw new Error('Failed to authenticate with Shiprocket');
    }
};
exports.getToken = getToken;
const fetchAvailableCouriers = async (req, res) => {
    try {
        const { origin, destination, payment_type, weight, length, breadth, height, shipment_type, } = req.body;
        if (!origin || !destination) {
            return res.status(400).json({
                success: false,
                error: 'pickupPincode and deliveryPincode are required',
            });
        }
        const userId = req.user?.sub;
        const orderAmountResult = (0, orderAmount_1.extractOrderAmountFromBody)(req.body);
        if (orderAmountResult.invalid) {
            return res.status(400).json({
                success: false,
                error: 'order_amount must be a non-negative number',
            });
        }
        const serviceabilityOptions = buildServiceabilityOptions(req.body);
        const couriers = await (0, shiprocket_service_1.fetchAvailableCouriersWithRates)({
            origin: Number(origin),
            destination: Number(destination),
            payment_type: payment_type,
            order_amount: orderAmountResult.value,
            shipment_type: shipment_type,
            weight: Number(weight),
            length: Number(length),
            breadth: Number(breadth),
            height: Number(height),
            ...serviceabilityOptions,
        }, userId);
        return res.json({ success: true, data: couriers ?? [] });
    }
    catch (err) {
        console.error('Error fetching couriers:', err.message);
        return res.status(500).json({ success: false, error: err.message });
    }
};
exports.fetchAvailableCouriers = fetchAvailableCouriers;
const fetchAvailableCouriersForGuestController = async (req, res) => {
    try {
        const { origin, destination, payment_type, weight, length, breadth, height } = req.body;
        // Validate required fields
        if (!origin || !destination) {
            return res.status(400).json({
                success: false,
                error: 'origin (pickup pincode) and destination (delivery pincode) are required',
            });
        }
        // Validate origin and destination are valid numbers
        const originNum = Number(origin);
        const destinationNum = Number(destination);
        if (isNaN(originNum) || isNaN(destinationNum)) {
            return res.status(400).json({
                success: false,
                error: 'origin and destination must be valid numbers',
            });
        }
        // Validate pincodes are 6 digits
        if (origin.toString().length !== 6 || destination.toString().length !== 6) {
            return res.status(400).json({
                success: false,
                error: 'origin and destination must be 6-digit pincodes',
            });
        }
        // Validate weight if provided
        const weightNum = weight ? Number(weight) : undefined;
        if (weight && (isNaN(weightNum) || weightNum <= 0)) {
            return res.status(400).json({
                success: false,
                error: 'weight must be a positive number',
            });
        }
        // Validate dimensions if provided
        const lengthNum = length ? Number(length) : undefined;
        const breadthNum = breadth ? Number(breadth) : undefined;
        const heightNum = height ? Number(height) : undefined;
        if (length && (isNaN(lengthNum) || lengthNum <= 0)) {
            return res.status(400).json({
                success: false,
                error: 'length must be a positive number',
            });
        }
        if (breadth && (isNaN(breadthNum) || breadthNum <= 0)) {
            return res.status(400).json({
                success: false,
                error: 'breadth must be a positive number',
            });
        }
        if (height && (isNaN(heightNum) || heightNum <= 0)) {
            return res.status(400).json({
                success: false,
                error: 'height must be a positive number',
            });
        }
        // Validate payment_type if provided
        if (payment_type && !['cod', 'prepaid'].includes(payment_type)) {
            return res.status(400).json({
                success: false,
                error: 'payment_type must be either "cod" or "prepaid"',
            });
        }
        const orderAmountResult = (0, orderAmount_1.extractOrderAmountFromBody)(req.body);
        if (orderAmountResult.invalid) {
            return res.status(400).json({
                success: false,
                error: 'order_amount must be a non-negative number',
            });
        }
        const couriers = await (0, shiprocket_service_1.fetchAvailableCouriersForGuest)({
            origin: originNum,
            destination: destinationNum,
            payment_type: payment_type,
            order_amount: orderAmountResult.value,
            weight: weightNum,
            length: lengthNum,
            breadth: breadthNum,
            height: heightNum,
        });
        return res.json({ success: true, data: couriers ?? [] });
    }
    catch (err) {
        console.error('Error fetching couriers for guest:', err.message);
        return res.status(500).json({ success: false, error: 'Failed to fetch available couriers' });
    }
};
exports.fetchAvailableCouriersForGuestController = fetchAvailableCouriersForGuestController;
const fetchAvailableCouriersToUser = async (req, res) => {
    try {
        const { origin, destination, payment_type, weight, length, breadth, height, shipment_type, } = req.body;
        if (!origin || !destination) {
            return res.status(400).json({
                success: false,
                error: 'pickupPincode and deliveryPincode are required',
            });
        }
        const userId = req.user?.sub;
        const serviceabilityOptions = buildServiceabilityOptions(req.body); // handles pickupId, reverse flags, etc.
        const orderAmountResult = (0, orderAmount_1.extractOrderAmountFromBody)(req.body);
        if (orderAmountResult.invalid) {
            return res.status(400).json({
                success: false,
                error: 'order_amount must be a non-negative number',
            });
        }
        // Route to appropriate function based on shipment_type
        const serviceParams = {
            origin: Number(origin),
            destination: Number(destination),
            payment_type: payment_type,
            order_amount: orderAmountResult.value,
            shipment_type: shipment_type,
            weight: Number(weight),
            length: Number(length),
            breadth: Number(breadth),
            height: Number(height),
            ...serviceabilityOptions,
        };
        let couriers;
        if (shipment_type === 'b2b') {
            couriers = await (0, shiprocket_service_1.fetchAvailableCouriersWithRatesB2B)(serviceParams, userId);
        }
        else {
            couriers = await (0, shiprocket_service_1.fetchAvailableCouriersWithRates)(serviceParams, userId);
        }
        return res.json({ success: true, data: couriers ?? [] });
    }
    catch (err) {
        console.error('Error fetching couriers:', err.message);
        return res.status(500).json({ success: false, error: err.message });
    }
};
exports.fetchAvailableCouriersToUser = fetchAvailableCouriersToUser;
const createCourierController = async (req, res) => {
    try {
        const newCourier = await (0, courierIntegration_service_1.createCourier)(req?.body);
        res.status(201).json({ status: 'success', data: newCourier });
    }
    catch (error) {
        console.error('[createCourierController] error:', error.message);
        console.error('[createCourierController] full error:', error);
        const status = error.message.includes('Courier already exists') ? 409 : 500;
        res.status(status).json({ status: 'error', message: error.message });
    }
};
exports.createCourierController = createCourierController;

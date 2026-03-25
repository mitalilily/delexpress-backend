"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.bulkUpsertZoneRatesController = exports.calculateRateController = exports.deleteOverheadController = exports.upsertOverheadController = exports.listOverheadsController = exports.importZoneRatesController = exports.deleteZoneRateController = exports.upsertZoneRateController = exports.listZoneRatesController = exports.importPincodesController = exports.bulkUpdatePincodeFlagsController = exports.bulkMovePincodesController = exports.bulkDeletePincodesController = exports.deletePincodeController = exports.updatePincodeController = exports.createPincodeController = exports.listPincodesController = exports.listStatesController = exports.legacyGetZonesController = exports.deleteZoneController = exports.updateZoneController = exports.remapZonePincodesController = exports.createZoneController = exports.listZonesController = void 0;
const b2bAdmin_service_1 = require("../../../models/services/b2bAdmin.service");
const zone_service_1 = require("../../../models/services/zone.service");
const parseCourierScope = (req) => {
    if (!req) {
        return { courierId: undefined, serviceProvider: undefined };
    }
    const courierIdParam = req.query?.courier_id ?? req.body?.courierId ?? req.body?.courier_id;
    const serviceProviderParam = req.query?.service_provider ?? req.body?.serviceProvider ?? req.body?.service_provider;
    return {
        courierId: courierIdParam != null && courierIdParam !== '' ? Number(courierIdParam) : undefined,
        serviceProvider: typeof serviceProviderParam === 'string' && serviceProviderParam.length
            ? serviceProviderParam
            : undefined,
    };
};
const parseBoolean = (value) => {
    if (value === undefined || value === null || value === '')
        return undefined;
    if (typeof value === 'boolean')
        return value;
    const normalized = String(value).toLowerCase();
    if (normalized === 'true')
        return true;
    if (normalized === 'false')
        return false;
    return undefined;
};
// -------------------------
// Zones (wrapper around shared service for convenience)
// -------------------------
const listZonesController = async (req, res) => {
    try {
        const courierIds = req.query.courier_id
            ? String(req.query.courier_id)
                .split(',')
                .map((id) => id.trim())
                .filter(Boolean)
            : undefined;
        const zones = await (0, b2bAdmin_service_1.listB2BZones)({
            courierIds,
            serviceProvider: req.query.service_provider ?? undefined,
            includeGlobal: req.query.include_global !== 'false',
        });
        res.json({ success: true, data: zones });
    }
    catch (error) {
        res.status(500).json({ success: false, error: error?.message || 'Failed to fetch zones' });
    }
};
exports.listZonesController = listZonesController;
const createZoneController = async (req, res) => {
    try {
        const zone = await (0, zone_service_1.createZone)(req.body, 'b2b');
        res.status(201).json({ success: true, data: zone });
    }
    catch (error) {
        res.status(400).json({ success: false, error: error?.message || 'Failed to create zone' });
    }
};
exports.createZoneController = createZoneController;
const remapZonePincodesController = async (req, res) => {
    try {
        await (0, zone_service_1.remapZonePincodes)(req.params.id);
        res.json({ success: true });
    }
    catch (error) {
        res
            .status(400)
            .json({ success: false, error: error?.message || 'Failed to remap zone pincodes' });
    }
};
exports.remapZonePincodesController = remapZonePincodesController;
const updateZoneController = async (req, res) => {
    try {
        const zone = await (0, zone_service_1.updateZone)(req.params.id, req.body);
        res.json({ success: true, data: zone });
    }
    catch (error) {
        res.status(400).json({ success: false, error: error?.message || 'Failed to update zone' });
    }
};
exports.updateZoneController = updateZoneController;
const deleteZoneController = async (req, res) => {
    try {
        await (0, zone_service_1.deleteZone)(req.params.id);
        res.json({ success: true });
    }
    catch (error) {
        res.status(400).json({ success: false, error: error?.message || 'Failed to delete zone' });
    }
};
exports.deleteZoneController = deleteZoneController;
const legacyGetZonesController = async (req, res) => {
    // small helper to keep backward compatibility for existing UI pieces that rely on /admin/zones
    return getAllZonesController(req, res);
};
exports.legacyGetZonesController = legacyGetZonesController;
const getAllZonesController = async (req, res) => {
    try {
        const { business_type, courier_id } = req.query;
        const courierIds = courier_id ? String(courier_id).split(',').filter(Boolean) : null;
        const zones = await (0, zone_service_1.getAllZones)(business_type ? String(business_type) : null, courierIds);
        res.status(200).json(zones);
    }
    catch (err) {
        res.status(500).json({ error: err?.message || 'Unable to fetch zones' });
    }
};
const listStatesController = async (_req, res) => {
    try {
        const states = await (0, zone_service_1.listAllZoneStates)();
        res.json({ success: true, data: states });
    }
    catch (error) {
        res.status(500).json({ success: false, error: error?.message || 'Failed to fetch states' });
    }
};
exports.listStatesController = listStatesController;
// -------------------------
// Pincodes
// -------------------------
const listPincodesController = async (req, res) => {
    try {
        const result = await (0, b2bAdmin_service_1.listPincodes)({
            page: req.query.page ? Number(req.query.page) : undefined,
            limit: req.query.limit ? Number(req.query.limit) : undefined,
            zoneId: req.query.zone_id ?? undefined,
            pincode: req.query.pincode ?? undefined,
            city: req.query.city ?? undefined,
            state: req.query.state ?? undefined,
            includeGlobal: req.query.include_global !== 'false',
            courierScope: parseCourierScope(req),
            isOda: parseBoolean(req.query.is_oda),
            isRemote: parseBoolean(req.query.is_remote),
            isMall: parseBoolean(req.query.is_mall),
            isSez: parseBoolean(req.query.is_sez),
            isAirport: parseBoolean(req.query.is_airport),
            isHighSecurity: parseBoolean(req.query.is_high_security),
            sortBy: req.query.sortBy || 'pincode',
            sortOrder: req.query.sortOrder || 'asc',
        });
        res.json({ success: true, data: result.data, pagination: result.pagination });
    }
    catch (error) {
        res.status(500).json({ success: false, error: error?.message || 'Failed to fetch pincodes' });
    }
};
exports.listPincodesController = listPincodesController;
const createPincodeController = async (req, res) => {
    try {
        const body = req.body;
        const record = await (0, b2bAdmin_service_1.createPincode)({
            pincode: body.pincode,
            city: body.city,
            state: body.state,
            zoneId: body.zoneId ?? body.zone_id,
            courierScope: parseCourierScope(req),
            flags: {
                isOda: body.isOda ?? body.is_oda,
                isRemote: body.isRemote ?? body.is_remote,
                isMall: body.isMall ?? body.is_mall,
                isSez: body.isSez ?? body.is_sez,
                isAirport: body.isAirport ?? body.is_airport,
                isHighSecurity: body.isHighSecurity ?? body.is_high_security,
            },
        });
        res.status(201).json({ success: true, data: record });
    }
    catch (error) {
        res.status(400).json({ success: false, error: error?.message || 'Failed to create pincode' });
    }
};
exports.createPincodeController = createPincodeController;
const updatePincodeController = async (req, res) => {
    try {
        // Support both nested flags object and top-level flags
        const flagsFromBody = req.body.flags || {};
        const record = await (0, b2bAdmin_service_1.updatePincode)(req.params.id, {
            pincode: req.body.pincode,
            city: req.body.city,
            state: req.body.state,
            zoneId: req.body.zoneId ?? req.body.zone_id,
            courierScope: parseCourierScope(req),
            flags: {
                isOda: flagsFromBody.isOda ?? req.body.isOda ?? req.body.is_oda ?? undefined,
                isRemote: flagsFromBody.isRemote ?? req.body.isRemote ?? req.body.is_remote ?? undefined,
                isMall: flagsFromBody.isMall ?? req.body.isMall ?? req.body.is_mall ?? undefined,
                isSez: flagsFromBody.isSez ?? req.body.isSez ?? req.body.is_sez ?? undefined,
                isAirport: flagsFromBody.isAirport ?? req.body.isAirport ?? req.body.is_airport ?? undefined,
                isHighSecurity: flagsFromBody.isHighSecurity ??
                    req.body.isHighSecurity ??
                    req.body.is_high_security ??
                    undefined,
            },
        });
        res.json({ success: true, data: record });
    }
    catch (error) {
        res.status(400).json({ success: false, error: error?.message || 'Failed to update pincode' });
    }
};
exports.updatePincodeController = updatePincodeController;
const deletePincodeController = async (req, res) => {
    try {
        await (0, b2bAdmin_service_1.deletePincode)(req.params.id);
        res.json({ success: true });
    }
    catch (error) {
        res.status(400).json({ success: false, error: error?.message || 'Failed to delete pincode' });
    }
};
exports.deletePincodeController = deletePincodeController;
const bulkDeletePincodesController = async (req, res) => {
    try {
        const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
        const result = await (0, b2bAdmin_service_1.bulkDeletePincodes)(ids);
        res.json({ success: true, ...result });
    }
    catch (error) {
        res
            .status(400)
            .json({ success: false, error: error?.message || 'Failed to delete selected pincodes' });
    }
};
exports.bulkDeletePincodesController = bulkDeletePincodesController;
const bulkMovePincodesController = async (req, res) => {
    try {
        const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
        const targetZoneId = req.body.targetZoneId ?? req.body.zoneId;
        if (!targetZoneId) {
            return res.status(400).json({ success: false, error: 'targetZoneId is required' });
        }
        const result = await (0, b2bAdmin_service_1.bulkMovePincodes)(ids, targetZoneId);
        res.json({ success: true, ...result });
    }
    catch (error) {
        res
            .status(400)
            .json({ success: false, error: error?.message || 'Failed to move selected pincodes' });
    }
};
exports.bulkMovePincodesController = bulkMovePincodesController;
const bulkUpdatePincodeFlagsController = async (req, res) => {
    try {
        const { ids, flags } = req.body;
        if (!Array.isArray(ids) || !ids.length) {
            return res.status(400).json({ success: false, error: 'ids array is required' });
        }
        if (!flags || typeof flags !== 'object') {
            return res.status(400).json({ success: false, error: 'flags object is required' });
        }
        const result = await (0, b2bAdmin_service_1.bulkUpdatePincodeFlags)(ids, {
            isOda: flags.isOda ?? flags.is_oda,
            isRemote: flags.isRemote ?? flags.is_remote,
            isMall: flags.isMall ?? flags.is_mall,
            isSez: flags.isSez ?? flags.is_sez,
            isAirport: flags.isAirport ?? flags.is_airport,
            isHighSecurity: flags.isHighSecurity ?? flags.is_high_security,
        });
        res.json({ success: true, data: result });
    }
    catch (error) {
        res
            .status(400)
            .json({ success: false, error: error?.message || 'Failed to update pincode flags' });
    }
};
exports.bulkUpdatePincodeFlagsController = bulkUpdatePincodeFlagsController;
const importPincodesController = async (req, res) => {
    try {
        if (!req.file?.buffer) {
            return res.status(400).json({ success: false, error: 'CSV file is required' });
        }
        const result = await (0, b2bAdmin_service_1.importPincodesFromCsv)(req.file.buffer, {
            courierScope: parseCourierScope(req),
            defaultZoneId: req.body.defaultZoneId ?? undefined,
            zoneId: req.body.zoneId ?? req.query.zoneId ?? undefined,
        });
        res.json({ success: true, ...result });
    }
    catch (error) {
        res.status(400).json({ success: false, error: error?.message || 'Failed to import pincodes' });
    }
};
exports.importPincodesController = importPincodesController;
// -------------------------
// Zone-to-Zone Rates
// -------------------------
const listZoneRatesController = async (req, res) => {
    try {
        const rates = await (0, b2bAdmin_service_1.listZoneToZoneRates)({
            courierScope: parseCourierScope(req),
            originZoneId: req.query.origin_zone_id ?? undefined,
            destinationZoneId: req.query.destination_zone_id ?? undefined,
            planId: req.query.plan_id ?? req.query.planId ?? undefined,
        });
        res.json({ success: true, data: rates });
    }
    catch (error) {
        res.status(500).json({ success: false, error: error?.message || 'Failed to fetch rates' });
    }
};
exports.listZoneRatesController = listZoneRatesController;
const upsertZoneRateController = async (req, res) => {
    try {
        const body = req.body;
        const rate = await (0, b2bAdmin_service_1.upsertZoneToZoneRate)({
            id: body.id ?? req.params.id,
            originZoneId: body.originZoneId ?? body.origin_zone_id,
            destinationZoneId: body.destinationZoneId ?? body.destination_zone_id,
            ratePerKg: Number(body.ratePerKg ?? body.rate_per_kg ?? 0),
            courierScope: parseCourierScope(req),
        });
        if (!rate) {
            return res
                .status(500)
                .json({ success: false, error: 'Failed to upsert rate: no record returned' });
        }
        // Update additional fields if provided (volumetric factor only)
        const updateData = {};
        if (body.volumetricFactor !== undefined || body.volumetric_factor !== undefined) {
            updateData.volumetric_factor = (body.volumetricFactor ?? body.volumetric_factor).toString();
        }
        if (body.effectiveFrom || body.effective_from) {
            updateData.effective_from = new Date(body.effectiveFrom ?? body.effective_from);
        }
        if (body.effectiveTo || body.effective_to) {
            updateData.effective_to = new Date(body.effectiveTo ?? body.effective_to);
        }
        if (body.isActive !== undefined || body.is_active !== undefined) {
            updateData.is_active = body.isActive ?? body.is_active;
        }
        if (Object.keys(updateData).length > 0) {
            updateData.updated_at = new Date();
            const { db } = await Promise.resolve().then(() => __importStar(require('../../../models/client')));
            const { b2bZoneToZoneRates } = await Promise.resolve().then(() => __importStar(require('../../../models/schema/zones')));
            const { eq } = await Promise.resolve().then(() => __importStar(require('drizzle-orm')));
            await db.update(b2bZoneToZoneRates).set(updateData).where(eq(b2bZoneToZoneRates.id, rate.id));
        }
        res.json({ success: true, data: rate });
    }
    catch (error) {
        res.status(400).json({ success: false, error: error?.message || 'Failed to upsert rate' });
    }
};
exports.upsertZoneRateController = upsertZoneRateController;
const deleteZoneRateController = async (req, res) => {
    try {
        await (0, b2bAdmin_service_1.deleteZoneToZoneRate)(req.params.id);
        res.json({ success: true });
    }
    catch (error) {
        res.status(400).json({ success: false, error: error?.message || 'Failed to delete rate' });
    }
};
exports.deleteZoneRateController = deleteZoneRateController;
const importZoneRatesController = async (req, res) => {
    try {
        if (!req.file?.buffer) {
            return res.status(400).json({ success: false, error: 'CSV file is required' });
        }
        const result = await (0, b2bAdmin_service_1.importZoneRatesFromCsv)(req.file.buffer, {
            courierScope: parseCourierScope(req),
        });
        res.json({ success: true, ...result });
    }
    catch (error) {
        res.status(400).json({ success: false, error: error?.message || 'Failed to import rates' });
    }
};
exports.importZoneRatesController = importZoneRatesController;
// -------------------------
// Overheads
// -------------------------
const listOverheadsController = async (req, res) => {
    try {
        const rules = await (0, b2bAdmin_service_1.listOverheadRules)({
            courierScope: parseCourierScope(req),
            includeGlobal: req.query.include_global !== 'false',
            onlyActive: req.query.only_active === 'true',
            planId: req.query.plan_id ?? req.query.planId ?? undefined,
        });
        res.json({ success: true, data: rules });
    }
    catch (error) {
        res.status(500).json({ success: false, error: error?.message || 'Failed to fetch overheads' });
    }
};
exports.listOverheadsController = listOverheadsController;
const upsertOverheadController = async (req, res) => {
    try {
        const rule = await (0, b2bAdmin_service_1.upsertOverheadRule)({
            id: req.body.id,
            code: req.body.code,
            name: req.body.name,
            description: req.body.description,
            type: req.body.type,
            amount: req.body.amount ? Number(req.body.amount) : undefined,
            percent: req.body.percent ? Number(req.body.percent) : undefined,
            appliesTo: req.body.appliesTo ?? req.body.applies_to,
            condition: req.body.condition,
            priority: req.body.priority ? Number(req.body.priority) : undefined,
            effectiveFrom: req.body.effectiveFrom ? new Date(req.body.effectiveFrom) : undefined,
            effectiveTo: req.body.effectiveTo ? new Date(req.body.effectiveTo) : undefined,
            isActive: req.body.isActive ?? req.body.is_active,
            courierScope: parseCourierScope(req),
            planId: req.body.plan_id ?? req.body.planId ?? undefined,
        });
        res.json({ success: true, data: rule });
    }
    catch (error) {
        res
            .status(400)
            .json({ success: false, error: error?.message || 'Failed to save overhead rule' });
    }
};
exports.upsertOverheadController = upsertOverheadController;
const deleteOverheadController = async (req, res) => {
    try {
        await (0, b2bAdmin_service_1.deleteOverheadRule)(req.params.id);
        res.json({ success: true });
    }
    catch (error) {
        res
            .status(400)
            .json({ success: false, error: error?.message || 'Failed to delete overhead rule' });
    }
};
exports.deleteOverheadController = deleteOverheadController;
// -------------------------
// Rate calculator
// -------------------------
const calculateRateController = async (req, res) => {
    try {
        const result = await (0, b2bAdmin_service_1.calculateB2BRate)({
            originPincode: req.body.originPincode ?? req.body.origin_pincode ?? req.body.origin,
            destinationPincode: req.body.destinationPincode ?? req.body.destination_pincode ?? req.body.destination,
            weightKg: Number(req.body.weightKg ?? req.body.weight ?? 0),
            length: req.body.length ? Number(req.body.length) : undefined,
            width: req.body.width ? Number(req.body.width) : undefined,
            height: req.body.height ? Number(req.body.height) : undefined,
            invoiceValue: req.body.invoiceValue ?? req.body.invoice_value,
            paymentMode: (req.body.paymentMode ?? req.body.payment_mode ?? 'PREPAID').toUpperCase(),
            courierScope: parseCourierScope(req),
            effectiveDate: req.body.effectiveDate ? new Date(req.body.effectiveDate) : undefined,
            isSinglePiece: req.body.isSinglePiece ?? req.body.is_single_piece ?? undefined,
            pieceCount: req.body.pieceCount ?? req.body.piece_count ?? undefined,
            // Optional: Provide orderId or awbNumber to fetch tracking events for demurrage calculation
            orderId: req.body.orderId ?? req.body.order_id ?? undefined,
            awbNumber: req.body.awbNumber ?? req.body.awb_number ?? req.body.awb ?? undefined,
            // Optional: Or provide tracking events directly
            trackingEvents: req.body.trackingEvents ?? req.body.tracking_events ?? undefined,
            // Optional: Pickup date for holiday charge calculation
            pickupDate: req.body.pickupDate ?? req.body.pickup_date ?? undefined,
            // Optional: Delivery time window for time-specific delivery charge (e.g., "11AM", "9AM-11AM", "before 11AM")
            deliveryTime: req.body.deliveryTime ?? req.body.delivery_time ?? undefined,
            // Optional: Delivery address - used to detect CSD locations via keywords
            deliveryAddress: req.body.deliveryAddress ?? req.body.delivery_address ?? req.body.address ?? undefined,
            // Optional: Plan ID to fetch plan-specific additional charges
            planId: req.body.planId ?? req.body.plan_id ?? undefined,
        });
        res.json({ success: true, data: result });
    }
    catch (error) {
        res.status(400).json({ success: false, error: error?.message || 'Failed to calculate rate' });
    }
};
exports.calculateRateController = calculateRateController;
// -------------------------
// Bulk Zone Rate Operations
// -------------------------
const bulkUpsertZoneRatesController = async (req, res) => {
    try {
        const rates = Array.isArray(req.body.rates) ? req.body.rates : [];
        if (!rates.length) {
            return res.status(400).json({ success: false, error: 'Rates array is required' });
        }
        const results = await (0, b2bAdmin_service_1.bulkUpsertZoneRates)(rates, parseCourierScope(req));
        res.json({ success: true, data: results });
    }
    catch (error) {
        res.status(400).json({ success: false, error: error?.message || 'Failed to bulk upsert rates' });
    }
};
exports.bulkUpsertZoneRatesController = bulkUpsertZoneRatesController;

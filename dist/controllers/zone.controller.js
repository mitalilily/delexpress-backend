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
exports.importZoneMappingsFronCSV = exports.bulkMoveMappings = exports.bulkDeleteMappings = exports.deleteZoneMapping = exports.getZoneMappings = exports.updateZoneMappingController = exports.addZoneMapping = exports.deleteZone = exports.updateZone = exports.getZoneById = exports.getAllZones = exports.createZone = void 0;
const zoneService = __importStar(require("../models/services/zone.service"));
const createZone = async (req, res) => {
    try {
        const zone = await zoneService.createZone(req.body, req?.body?.business_type?.toLowerCase());
        res.status(201).json(zone);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
        console.log('[creatzezone controller:', err);
    }
};
exports.createZone = createZone;
const getAllZones = async (req, res) => {
    try {
        const { business_type, courier_id } = req.query;
        // Support multiple courier IDs as comma-separated string
        const courierIds = courier_id ? String(courier_id).split(',').filter(Boolean) : null;
        const zones = await zoneService.getAllZones(business_type ? String(business_type) : null, courierIds);
        res.status(200).json(zones);
    }
    catch (err) {
        if (err instanceof Error) {
            res.status(500).json({ error: err.message });
        }
        else {
            res.status(500).json({ error: String(err) });
        }
    }
};
exports.getAllZones = getAllZones;
const getZoneById = async (req, res) => {
    try {
        const zone = await zoneService.getZoneById(req.params.id);
        if (!zone)
            return res.status(404).json({ error: 'Zone not found' });
        res.status(200).json(zone);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
};
exports.getZoneById = getZoneById;
const updateZone = async (req, res) => {
    try {
        const updated = await zoneService.updateZone(req.params.id, req.body);
        if (!updated) {
            return res.status(404).json({
                success: false,
                message: 'Zone not found',
            });
        }
        return res.status(200).json({
            success: true,
            message: 'Zone updated successfully',
            data: updated,
        });
    }
    catch (err) {
        return res.status(500).json({
            success: false,
            message: 'Failed to update zone',
            error: err instanceof Error ? err.message : 'Unknown error',
        });
    }
};
exports.updateZone = updateZone;
const deleteZone = async (req, res) => {
    try {
        await zoneService.deleteZone(req.params.id);
        res.status(200).json({ success: true });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
};
exports.deleteZone = deleteZone;
// Zone Mappings
const addZoneMapping = async (req, res) => {
    try {
        const mapping = await zoneService.addZoneMapping(req.params.zoneId, req.body);
        res.status(201).json(mapping);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
};
exports.addZoneMapping = addZoneMapping;
const updateZoneMappingController = async (req, res) => {
    try {
        const updated = await zoneService.updateZoneMapping({ id: req.params.mappingId, ...req.body });
        res.json(updated);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
};
exports.updateZoneMappingController = updateZoneMappingController;
const getZoneMappings = async (req, res) => {
    try {
        const { zoneId } = req.params;
        const { page = 1, limit = 20, pincode, city, state, sortBy, sortOrder } = req.query;
        const filters = {};
        if (pincode)
            filters.pincode = pincode;
        if (city)
            filters.city = city;
        if (state)
            filters.state = state;
        const { data, total } = await zoneService.getZoneMappingsPaginated(zoneId, {
            page: Number(page),
            limit: Number(limit),
            filters,
            sortBy: sortBy,
            sortOrder: sortOrder === 'asc' ? 'asc' : 'desc',
        });
        res.json({ data, total, page: Number(page), limit: Number(limit) });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
};
exports.getZoneMappings = getZoneMappings;
const deleteZoneMapping = async (req, res) => {
    try {
        await zoneService.deleteZoneMapping(req.params.mappingId);
        res.json({ success: true });
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
};
exports.deleteZoneMapping = deleteZoneMapping;
// ---------------- Bulk Zone Mappings ----------------
const bulkDeleteMappings = async (req, res) => {
    try {
        const { mappingIds } = req.body;
        if (!Array.isArray(mappingIds) || mappingIds.length === 0) {
            return res.status(400).json({ error: 'mappingIds must be a non-empty array' });
        }
        const result = await zoneService.bulkDeleteMappings(mappingIds);
        res.json(result);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
};
exports.bulkDeleteMappings = bulkDeleteMappings;
const bulkMoveMappings = async (req, res) => {
    try {
        const { mappingIds, zoneId } = req.body;
        if (!Array.isArray(mappingIds) || mappingIds.length === 0 || !zoneId) {
            return res.status(400).json({ error: 'mappingIds must be non-empty and zoneId is required' });
        }
        const result = await zoneService.bulkMoveMappings(mappingIds, zoneId);
        res.json(result);
    }
    catch (err) {
        res.status(500).json({ error: err.message });
    }
};
exports.bulkMoveMappings = bulkMoveMappings;
const importZoneMappingsFronCSV = async (req, res) => {
    try {
        const zoneId = req.params.zoneId;
        if (!zoneId)
            return res.status(400).json({ error: 'Zone ID is required' });
        if (!req.file)
            return res.status(400).json({ error: 'CSV file is required' });
        const { userChoices } = req.body;
        let userChoicesPayload = undefined;
        if (userChoices !== undefined) {
            userChoicesPayload = JSON.parse(userChoices);
        }
        const result = await zoneService.bulkInsertZoneMappingsFromCSV(req.file.path, zoneId, userChoicesPayload);
        res.status(200).json({
            message: `Imported ${result.inserted} mappings`,
            ...result, // either duplicates OR overridden + skipped
        });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to import zone mappings' });
    }
};
exports.importZoneMappingsFronCSV = importZoneMappingsFronCSV;

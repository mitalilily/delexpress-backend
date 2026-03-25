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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zoneController = __importStar(require("../../controllers/zone.controller"));
const isAdmin_1 = require("../../middlewares/isAdmin");
const requireAuth_1 = require("../../middlewares/requireAuth");
const multer_1 = __importDefault(require("multer"));
const upload = (0, multer_1.default)({ dest: 'uploads/' }); // temp folder
const router = (0, express_1.Router)();
// Zone CRUD
router.post('/', requireAuth_1.requireAuth, isAdmin_1.isAdminMiddleware, zoneController.createZone);
router.get('/', zoneController.getAllZones);
router.get('/:id', zoneController.getZoneById);
router.put('/:id', requireAuth_1.requireAuth, isAdmin_1.isAdminMiddleware, zoneController.updateZone);
router.delete('/:id', requireAuth_1.requireAuth, isAdmin_1.isAdminMiddleware, zoneController.deleteZone);
// Zone Mappings
router.post('/:zoneId/mappings', requireAuth_1.requireAuth, isAdmin_1.isAdminMiddleware, zoneController.addZoneMapping);
router.post('/:zoneId/mappings/import', requireAuth_1.requireAuth, isAdmin_1.isAdminMiddleware, upload.single('file'), // must match FormData field
zoneController.importZoneMappingsFronCSV);
router.get('/:zoneId/mappings', zoneController.getZoneMappings);
router.put('/mappings/:mappingId', requireAuth_1.requireAuth, isAdmin_1.isAdminMiddleware, zoneController.updateZoneMappingController);
router.delete('/mappings/:mappingId', requireAuth_1.requireAuth, isAdmin_1.isAdminMiddleware, zoneController.deleteZoneMapping);
router.post('/mappings/bulk-delete', requireAuth_1.requireAuth, isAdmin_1.isAdminMiddleware, zoneController.bulkDeleteMappings);
router.post('/mappings/bulk-move', requireAuth_1.requireAuth, isAdmin_1.isAdminMiddleware, zoneController.bulkMoveMappings);
exports.default = router;

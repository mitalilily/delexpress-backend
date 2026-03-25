"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const multer_1 = __importDefault(require("multer"));
const b2bAdmin_controller_1 = require("../../controllers/admin/b2b/b2bAdmin.controller");
const b2bPricingConfig_controller_1 = require("../../controllers/admin/b2b/b2bPricingConfig.controller");
const holiday_controller_1 = require("../../controllers/admin/b2b/holiday.controller");
const invoiceValidation_controller_1 = require("../../controllers/admin/b2b/invoiceValidation.controller");
const isAdmin_1 = require("../../middlewares/isAdmin");
const requireAuth_1 = require("../../middlewares/requireAuth");
const router = (0, express_1.Router)();
const upload = (0, multer_1.default)();
// Zones
router.get('/zones', requireAuth_1.requireAuth, isAdmin_1.isAdminMiddleware, b2bAdmin_controller_1.listZonesController);
router.post('/zones', requireAuth_1.requireAuth, isAdmin_1.isAdminMiddleware, b2bAdmin_controller_1.createZoneController);
router.put('/zones/:id', requireAuth_1.requireAuth, isAdmin_1.isAdminMiddleware, b2bAdmin_controller_1.updateZoneController);
router.delete('/zones/:id', requireAuth_1.requireAuth, isAdmin_1.isAdminMiddleware, b2bAdmin_controller_1.deleteZoneController);
router.post('/zones/:id/remap', requireAuth_1.requireAuth, isAdmin_1.isAdminMiddleware, b2bAdmin_controller_1.remapZonePincodesController);
router.get('/states', requireAuth_1.requireAuth, isAdmin_1.isAdminMiddleware, b2bAdmin_controller_1.listStatesController);
// Pincodes
router.get('/pincodes', requireAuth_1.requireAuth, isAdmin_1.isAdminMiddleware, b2bAdmin_controller_1.listPincodesController);
router.post('/pincodes', requireAuth_1.requireAuth, isAdmin_1.isAdminMiddleware, b2bAdmin_controller_1.createPincodeController);
router.put('/pincodes/:id', requireAuth_1.requireAuth, isAdmin_1.isAdminMiddleware, b2bAdmin_controller_1.updatePincodeController);
router.delete('/pincodes/:id', requireAuth_1.requireAuth, isAdmin_1.isAdminMiddleware, b2bAdmin_controller_1.deletePincodeController);
router.post('/pincodes/import', requireAuth_1.requireAuth, isAdmin_1.isAdminMiddleware, upload.single('file'), b2bAdmin_controller_1.importPincodesController);
router.post('/pincodes/bulk-delete', requireAuth_1.requireAuth, isAdmin_1.isAdminMiddleware, b2bAdmin_controller_1.bulkDeletePincodesController);
router.post('/pincodes/bulk-move', requireAuth_1.requireAuth, isAdmin_1.isAdminMiddleware, b2bAdmin_controller_1.bulkMovePincodesController);
router.post('/pincodes/bulk-update-flags', requireAuth_1.requireAuth, isAdmin_1.isAdminMiddleware, b2bAdmin_controller_1.bulkUpdatePincodeFlagsController);
// Zone-to-zone rates
router.get('/zone-rates', requireAuth_1.requireAuth, isAdmin_1.isAdminMiddleware, b2bAdmin_controller_1.listZoneRatesController);
router.post('/zone-rates', requireAuth_1.requireAuth, isAdmin_1.isAdminMiddleware, b2bAdmin_controller_1.upsertZoneRateController);
router.put('/zone-rates/:id', requireAuth_1.requireAuth, isAdmin_1.isAdminMiddleware, b2bAdmin_controller_1.upsertZoneRateController);
router.delete('/zone-rates/:id', requireAuth_1.requireAuth, isAdmin_1.isAdminMiddleware, b2bAdmin_controller_1.deleteZoneRateController);
router.post('/zone-rates/import', requireAuth_1.requireAuth, isAdmin_1.isAdminMiddleware, upload.single('file'), b2bAdmin_controller_1.importZoneRatesController);
router.post('/zone-rates/bulk', requireAuth_1.requireAuth, isAdmin_1.isAdminMiddleware, b2bAdmin_controller_1.bulkUpsertZoneRatesController);
// Overheads
router.get('/overheads', requireAuth_1.requireAuth, isAdmin_1.isAdminMiddleware, b2bAdmin_controller_1.listOverheadsController);
router.post('/overheads', requireAuth_1.requireAuth, isAdmin_1.isAdminMiddleware, b2bAdmin_controller_1.upsertOverheadController);
router.put('/overheads/:id', requireAuth_1.requireAuth, isAdmin_1.isAdminMiddleware, b2bAdmin_controller_1.upsertOverheadController);
router.delete('/overheads/:id', requireAuth_1.requireAuth, isAdmin_1.isAdminMiddleware, b2bAdmin_controller_1.deleteOverheadController);
// Rate calculator
router.post('/calculate-rate', requireAuth_1.requireAuth, isAdmin_1.isAdminMiddleware, b2bAdmin_controller_1.calculateRateController);
// Pricing Configuration
// Zone States
router.get('/zone-states', requireAuth_1.requireAuth, isAdmin_1.isAdminMiddleware, b2bPricingConfig_controller_1.listZoneStatesController);
router.post('/zone-states', requireAuth_1.requireAuth, isAdmin_1.isAdminMiddleware, b2bPricingConfig_controller_1.createZoneStateController);
router.post('/zone-states/bulk', requireAuth_1.requireAuth, isAdmin_1.isAdminMiddleware, b2bPricingConfig_controller_1.bulkCreateZoneStatesController);
router.delete('/zone-states/:id', requireAuth_1.requireAuth, isAdmin_1.isAdminMiddleware, b2bPricingConfig_controller_1.deleteZoneStateController);
// Additional Charges
router.get('/additional-charges', requireAuth_1.requireAuth, isAdmin_1.isAdminMiddleware, b2bPricingConfig_controller_1.getAdditionalChargesController);
router.post('/additional-charges', requireAuth_1.requireAuth, isAdmin_1.isAdminMiddleware, b2bPricingConfig_controller_1.upsertAdditionalChargesController);
router.put('/additional-charges', requireAuth_1.requireAuth, isAdmin_1.isAdminMiddleware, b2bPricingConfig_controller_1.upsertAdditionalChargesController);
router.post('/additional-charges/import', requireAuth_1.requireAuth, isAdmin_1.isAdminMiddleware, upload.single('file'), b2bPricingConfig_controller_1.importAdditionalChargesController);
// Holidays Management
router.get('/holidays', requireAuth_1.requireAuth, isAdmin_1.isAdminMiddleware, holiday_controller_1.listHolidaysController);
router.get('/holidays/:id', requireAuth_1.requireAuth, isAdmin_1.isAdminMiddleware, holiday_controller_1.getHolidayController);
router.post('/holidays', requireAuth_1.requireAuth, isAdmin_1.isAdminMiddleware, holiday_controller_1.createHolidayController);
router.put('/holidays/:id', requireAuth_1.requireAuth, isAdmin_1.isAdminMiddleware, holiday_controller_1.updateHolidayController);
router.delete('/holidays/:id', requireAuth_1.requireAuth, isAdmin_1.isAdminMiddleware, holiday_controller_1.deleteHolidayController);
router.post('/holidays/seed-national', requireAuth_1.requireAuth, isAdmin_1.isAdminMiddleware, holiday_controller_1.seedNationalHolidaysController);
// Invoice Validation
router.post('/invoices/validate-file', requireAuth_1.requireAuth, isAdmin_1.isAdminMiddleware, invoiceValidation_controller_1.validateInvoiceFileController);
router.post('/invoices/validate-content', requireAuth_1.requireAuth, isAdmin_1.isAdminMiddleware, invoiceValidation_controller_1.validateInvoiceContentController);
exports.default = router;

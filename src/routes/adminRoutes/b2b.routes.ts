import { Router } from 'express'
import multer from 'multer'

import {
  bulkDeletePincodesController,
  bulkMovePincodesController,
  bulkUpdatePincodeFlagsController,
  bulkUpsertZoneRatesController,
  calculateRateController,
  createPincodeController,
  createZoneController,
  deleteOverheadController,
  deletePincodeController,
  deleteZoneController,
  deleteZoneRateController,
  importPincodesController,
  importZoneRatesController,
  listOverheadsController,
  listPincodesController,
  listStatesController,
  listZoneRatesController,
  listZonesController,
  remapZonePincodesController,
  updatePincodeController,
  updateZoneController,
  upsertOverheadController,
  upsertZoneRateController,
} from '../../controllers/admin/b2b/b2bAdmin.controller'
import {
  bulkCreateZoneStatesController,
  createZoneStateController,
  deleteZoneStateController,
  getAdditionalChargesController,
  importAdditionalChargesController,
  listZoneStatesController,
  upsertAdditionalChargesController,
} from '../../controllers/admin/b2b/b2bPricingConfig.controller'
import {
  createHolidayController,
  deleteHolidayController,
  getHolidayController,
  listHolidaysController,
  seedNationalHolidaysController,
  updateHolidayController,
} from '../../controllers/admin/b2b/holiday.controller'
import {
  validateInvoiceContentController,
  validateInvoiceFileController,
} from '../../controllers/admin/b2b/invoiceValidation.controller'
import { isAdminMiddleware } from '../../middlewares/isAdmin'
import { requireAuth } from '../../middlewares/requireAuth'

const router = Router()
const upload = multer()

// Zones
router.get('/zones', requireAuth, isAdminMiddleware, listZonesController)
router.post('/zones', requireAuth, isAdminMiddleware, createZoneController)
router.put('/zones/:id', requireAuth, isAdminMiddleware, updateZoneController)
router.delete('/zones/:id', requireAuth, isAdminMiddleware, deleteZoneController)
router.post('/zones/:id/remap', requireAuth, isAdminMiddleware, remapZonePincodesController)
router.get('/states', requireAuth, isAdminMiddleware, listStatesController)

// Pincodes
router.get('/pincodes', requireAuth, isAdminMiddleware, listPincodesController)
router.post('/pincodes', requireAuth, isAdminMiddleware, createPincodeController)
router.put('/pincodes/:id', requireAuth, isAdminMiddleware, updatePincodeController)
router.delete('/pincodes/:id', requireAuth, isAdminMiddleware, deletePincodeController)
router.post(
  '/pincodes/import',
  requireAuth,
  isAdminMiddleware,
  upload.single('file'),
  importPincodesController,
)
router.post('/pincodes/bulk-delete', requireAuth, isAdminMiddleware, bulkDeletePincodesController)
router.post('/pincodes/bulk-move', requireAuth, isAdminMiddleware, bulkMovePincodesController)
router.post(
  '/pincodes/bulk-update-flags',
  requireAuth,
  isAdminMiddleware,
  bulkUpdatePincodeFlagsController,
)

// Zone-to-zone rates
router.get('/zone-rates', requireAuth, isAdminMiddleware, listZoneRatesController)
router.post('/zone-rates', requireAuth, isAdminMiddleware, upsertZoneRateController)
router.put('/zone-rates/:id', requireAuth, isAdminMiddleware, upsertZoneRateController)
router.delete('/zone-rates/:id', requireAuth, isAdminMiddleware, deleteZoneRateController)
router.post(
  '/zone-rates/import',
  requireAuth,
  isAdminMiddleware,
  upload.single('file'),
  importZoneRatesController,
)
router.post('/zone-rates/bulk', requireAuth, isAdminMiddleware, bulkUpsertZoneRatesController)

// Overheads
router.get('/overheads', requireAuth, isAdminMiddleware, listOverheadsController)
router.post('/overheads', requireAuth, isAdminMiddleware, upsertOverheadController)
router.put('/overheads/:id', requireAuth, isAdminMiddleware, upsertOverheadController)
router.delete('/overheads/:id', requireAuth, isAdminMiddleware, deleteOverheadController)

// Rate calculator
router.post('/calculate-rate', requireAuth, isAdminMiddleware, calculateRateController)

// Pricing Configuration
// Zone States
router.get('/zone-states', requireAuth, isAdminMiddleware, listZoneStatesController)
router.post('/zone-states', requireAuth, isAdminMiddleware, createZoneStateController)
router.post('/zone-states/bulk', requireAuth, isAdminMiddleware, bulkCreateZoneStatesController)
router.delete('/zone-states/:id', requireAuth, isAdminMiddleware, deleteZoneStateController)

// Additional Charges
router.get('/additional-charges', requireAuth, isAdminMiddleware, getAdditionalChargesController)
router.post(
  '/additional-charges',
  requireAuth,
  isAdminMiddleware,
  upsertAdditionalChargesController,
)
router.put('/additional-charges', requireAuth, isAdminMiddleware, upsertAdditionalChargesController)
router.post(
  '/additional-charges/import',
  requireAuth,
  isAdminMiddleware,
  upload.single('file'),
  importAdditionalChargesController,
)

// Holidays Management
router.get('/holidays', requireAuth, isAdminMiddleware, listHolidaysController)
router.get('/holidays/:id', requireAuth, isAdminMiddleware, getHolidayController)
router.post('/holidays', requireAuth, isAdminMiddleware, createHolidayController)
router.put('/holidays/:id', requireAuth, isAdminMiddleware, updateHolidayController)
router.delete('/holidays/:id', requireAuth, isAdminMiddleware, deleteHolidayController)
router.post(
  '/holidays/seed-national',
  requireAuth,
  isAdminMiddleware,
  seedNationalHolidaysController,
)

// Invoice Validation
router.post(
  '/invoices/validate-file',
  requireAuth,
  isAdminMiddleware,
  validateInvoiceFileController,
)
router.post(
  '/invoices/validate-content',
  requireAuth,
  isAdminMiddleware,
  validateInvoiceContentController,
)

export default router

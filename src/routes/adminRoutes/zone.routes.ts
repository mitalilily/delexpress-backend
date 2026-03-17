import { Router } from 'express'
import * as zoneController from '../../controllers/zone.controller'
import { isAdminMiddleware } from '../../middlewares/isAdmin'
import { requireAuth } from '../../middlewares/requireAuth'

import multer from 'multer'
const upload = multer({ dest: 'uploads/' }) // temp folder

const router = Router()

// Zone CRUD
router.post('/', requireAuth, isAdminMiddleware, zoneController.createZone)
router.get('/', zoneController.getAllZones)
router.get('/:id', zoneController.getZoneById)
router.put('/:id', requireAuth, isAdminMiddleware, zoneController.updateZone)
router.delete('/:id', requireAuth, isAdminMiddleware, zoneController.deleteZone)

// Zone Mappings
router.post('/:zoneId/mappings', requireAuth, isAdminMiddleware, zoneController.addZoneMapping)
router.post(
  '/:zoneId/mappings/import',
  requireAuth,
  isAdminMiddleware,
  upload.single('file'), // must match FormData field
  zoneController.importZoneMappingsFronCSV,
)
router.get('/:zoneId/mappings', zoneController.getZoneMappings)
router.put(
  '/mappings/:mappingId',
  requireAuth,
  isAdminMiddleware,
  zoneController.updateZoneMappingController,
)
router.delete(
  '/mappings/:mappingId',
  requireAuth,
  isAdminMiddleware,
  zoneController.deleteZoneMapping,
)
router.post(
  '/mappings/bulk-delete',
  requireAuth,
  isAdminMiddleware,
  zoneController.bulkDeleteMappings,
)

router.post('/mappings/bulk-move', requireAuth, isAdminMiddleware, zoneController.bulkMoveMappings)

export default router

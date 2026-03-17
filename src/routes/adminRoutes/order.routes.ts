import { Router } from 'express'
import {
  getAllOrdersControllerAdmin,
  exportOrdersControllerAdmin,
  regenerateOrderDocumentsControllerAdmin,
} from '../../controllers/admin/order.controller'
import { isAdminMiddleware } from '../../middlewares/isAdmin'
import { requireAuth } from '../../middlewares/requireAuth'
const router = Router()

router.get('/all-orders', requireAuth, isAdminMiddleware, getAllOrdersControllerAdmin)
router.get('/export', requireAuth, isAdminMiddleware, exportOrdersControllerAdmin)
router.post(
  '/:id/regenerate-documents',
  requireAuth,
  isAdminMiddleware,
  regenerateOrderDocumentsControllerAdmin,
)
export default router

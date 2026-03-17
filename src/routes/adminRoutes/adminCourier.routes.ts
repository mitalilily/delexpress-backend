// routes/shippingRateRoutes.ts
import { Router } from 'express'
import {
  getCourierCredentialsController,
  deleteShippingRateController,
  fetchAvailableCouriersForAdmin,
  getAllCouriersController,
  getShippingRatesController,
  importShippingRatesController,
  updateDelhiveryCredentialsController,
  updateEkartCredentialsController,
  updateXpressbeesCredentialsController,
  updateShippingRateController,
} from '../../controllers/admin/courier.controller'
import { isAdminMiddleware } from '../../middlewares/isAdmin'
import { requireAuth } from '../../middlewares/requireAuth'
import { upload } from '../../middlewares/upload'

const router = Router()

router.get('/shipping-rates', getShippingRatesController)
router.get('/list', getAllCouriersController)

router.put(
  '/shipping-rate/:id/:planId',
  requireAuth,
  isAdminMiddleware,
  updateShippingRateController,
)
router.post(
  '/shipping-rates/import',
  requireAuth,
  isAdminMiddleware,
  upload.single('file'),
  importShippingRatesController,
)
router.post('/available', requireAuth, fetchAvailableCouriersForAdmin)
router.get('/credentials', requireAuth, isAdminMiddleware, getCourierCredentialsController)
router.put(
  '/credentials/delhivery',
  requireAuth,
  isAdminMiddleware,
  updateDelhiveryCredentialsController,
)
router.put(
  '/credentials/ekart',
  requireAuth,
  isAdminMiddleware,
  updateEkartCredentialsController,
)
router.put(
  '/credentials/xpressbees',
  requireAuth,
  isAdminMiddleware,
  updateXpressbeesCredentialsController,
)
router.delete(
  '/shipping-rates/:planId/:id',
  requireAuth,
  isAdminMiddleware,
  deleteShippingRateController,
)

export default router

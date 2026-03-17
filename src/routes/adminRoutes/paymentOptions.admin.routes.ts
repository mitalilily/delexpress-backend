import { Router } from 'express'
import { getPaymentOptionsController, updatePaymentOptionsController } from '../../controllers/paymentOptions.controller'
import { isAdminMiddleware } from '../../middlewares/isAdmin'
import { requireAuth } from '../../middlewares/requireAuth'

const router = Router()

// All routes require admin authentication
router.use(requireAuth)
router.use(isAdminMiddleware)

// Get payment options
router.get('/', getPaymentOptionsController)

// Update payment options
router.put('/', updatePaymentOptionsController)

export default router


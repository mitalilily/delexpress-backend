import { Router } from 'express'
import { getPaymentOptionsController, updatePaymentOptionsController } from '../controllers/paymentOptions.controller'
import { isAdminMiddleware } from '../middlewares/isAdmin'
import { requireAuth } from '../middlewares/requireAuth'

const router = Router()

// Public endpoint - anyone can check payment options
router.get('/', getPaymentOptionsController)

// Admin endpoint - only admins can update
router.put('/', requireAuth, isAdminMiddleware, updatePaymentOptionsController)

export default router


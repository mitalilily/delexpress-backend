import { Router } from 'express'
import { AdminBillingPreferencesController } from '../../controllers/adminBillingPreferences.controller'
import { isAdminMiddleware } from '../../middlewares/isAdmin'
import { requireAuth } from '../../middlewares/requireAuth'

const router = Router()

// All routes require admin authentication
router.use(requireAuth)
router.use(isAdminMiddleware)

// Update billing preference for a specific user
router.post('/user', (req, res) => AdminBillingPreferencesController.upsertForUser(req, res))

// Apply billing preference to all users
router.post('/all', (req, res) => AdminBillingPreferencesController.applyToAllUsers(req, res))

export default router



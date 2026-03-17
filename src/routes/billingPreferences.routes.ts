import { Request, Response, Router } from 'express'
import { BillingPreferencesController } from '../controllers/billingPreferences.controller'
import { requireAuth } from '../middlewares/requireAuth'
import { isAdminMiddleware } from '../middlewares/isAdmin'

// Create router instance
const router = Router()

/**
 * @route   GET /api/billing-preferences/:userId
 * @desc    Get billing preference for a specific user
 * @access  Admin or Authenticated Seller
 */
router.get('/', requireAuth, async (req: Request, res: Response) => {
  return BillingPreferencesController.getBillingPreference(req, res)
})

/**
 * @route   POST /api/billing-preferences
 * @desc    Create or update billing preference for the **authenticated admin user**
 *          (kept for backwards compatibility; sellers are blocked by isAdminMiddleware)
 * @access  Admin only
 */
router.post('/', requireAuth, isAdminMiddleware, async (req: Request, res: Response) => {
  return BillingPreferencesController.upsertBillingPreference(req, res)
})

// Export router
export default router

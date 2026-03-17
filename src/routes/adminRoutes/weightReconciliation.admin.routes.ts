import { Router } from 'express'
import {
  approveDispute,
  getAdminWeightStats,
  getAllDiscrepancies,
  getAllDisputes,
  rejectDispute,
} from '../../controllers/admin/weightReconciliationAdmin.controller'
import { isAdminMiddleware } from '../../middlewares/isAdmin'
import { requireAuth } from '../../middlewares/requireAuth'

const router = Router()

// All routes require authentication and admin role
router.use(requireAuth, isAdminMiddleware)

// Discrepancies
router.get('/discrepancies', getAllDiscrepancies)

// Disputes
router.get('/disputes', getAllDisputes)
router.post('/disputes/:id/approve', approveDispute)
router.post('/disputes/:id/reject', rejectDispute)

// Dashboard stats
router.get('/stats', getAdminWeightStats)

export default router


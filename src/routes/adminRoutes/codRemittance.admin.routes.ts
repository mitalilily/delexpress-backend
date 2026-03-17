import express from 'express'
import {
  confirmCourierSettlement,
  debugCodRemittances,
  getSettlementCsvTemplate,
  previewCourierSettlementCsv,
} from '../../controllers/admin/codCsvUpload.admin.controller'
import {
  exportAllCodRemittances,
  getAllCodRemittances,
  getCodPlatformStats,
  getUserCodRemittances,
  manualCreditWallet,
  updateRemittanceNotes,
} from '../../controllers/admin/codRemittance.admin.controller'
import { isAdminMiddleware } from '../../middlewares/isAdmin'
import { requireAuth } from '../../middlewares/requireAuth'

const router = express.Router()

// All routes require authentication and admin role
router.use(requireAuth)
router.use(isAdminMiddleware)

// Platform stats
router.get('/stats', getCodPlatformStats)

// All remittances (admin view)
router.get('/remittances', getAllCodRemittances)
router.get('/remittances/export', exportAllCodRemittances)

// User-specific view
router.get('/users/:userId/remittances', getUserCodRemittances)

// Admin actions - Single remittance
router.post('/remittances/:remittanceId/credit', manualCreditWallet)
router.patch('/remittances/:remittanceId/notes', updateRemittanceNotes)

// CSV Upload for Settlement (Two-step: Preview then Confirm)
router.post('/preview-settlement-csv', previewCourierSettlementCsv)
router.post('/confirm-settlement', confirmCourierSettlement)
router.get('/csv-template', getSettlementCsvTemplate)

// DEBUG: Check database status
router.get('/debug-remittances', debugCodRemittances)

export default router

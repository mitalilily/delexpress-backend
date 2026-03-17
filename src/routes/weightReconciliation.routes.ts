import { Router } from 'express'
import {
  acceptDiscrepancy,
  bulkAccept,
  bulkReject,
  createDispute,
  exportDiscrepancies,
  getDiscrepancies,
  getDiscrepancyDetails,
  getDisputes,
  getSettings,
  getSummary,
  manuallyReportDiscrepancy,
  rejectDiscrepancy,
  updateSettings,
} from '../controllers/weightReconciliation.controller'
import { requireAuth } from '../middlewares/requireAuth'

const router = Router()

// All routes require authentication
router.use(requireAuth)

// Discrepancies
router.get('/discrepancies', getDiscrepancies)
router.get('/discrepancies/:id', getDiscrepancyDetails)
router.post('/discrepancies/:id/accept', acceptDiscrepancy)
router.post('/discrepancies/:id/reject', rejectDiscrepancy)
router.post('/discrepancies/bulk-accept', bulkAccept)
router.post('/discrepancies/bulk-reject', bulkReject)
router.post('/discrepancies/manual-report', manuallyReportDiscrepancy)

// Export
router.get('/export', exportDiscrepancies)

// Disputes
router.post('/disputes', createDispute)
router.get('/disputes', getDisputes)

// Summary & Analytics
router.get('/summary', getSummary)

// Settings
router.get('/settings', getSettings)
router.put('/settings', updateSettings)

export default router

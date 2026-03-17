import { Router } from 'express'
import {
  acceptInvoiceCredits,
  addInvoiceAdjustment,
  generateManualInvoice,
  getBillingInvoiceStatement,
  listBillingInvoices,
  raiseInvoiceDispute,
  recordInvoicePayment,
} from '../controllers/billingInvoice.controller'
import { requireAuth } from '../middlewares/requireAuth'

const router = Router()

// Merchant-scoped invoice APIs
router.get('/billing/invoices', requireAuth, listBillingInvoices)
router.post('/billing/invoices/generate', requireAuth, generateManualInvoice)
router.get('/billing/invoices/:id/statement', requireAuth, getBillingInvoiceStatement)
router.post('/billing/invoices/:id/adjustments', requireAuth, addInvoiceAdjustment)
router.post('/billing/invoices/:id/payments', requireAuth, recordInvoicePayment)
router.post('/billing/invoices/:id/accept-credits', requireAuth, acceptInvoiceCredits)
router.post('/billing/invoices/:id/disputes', requireAuth, raiseInvoiceDispute)

export default router

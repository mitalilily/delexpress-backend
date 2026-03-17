import { Router } from 'express'
import {
  adminAddCodOffset,
  adminAddInvoiceAdjustment,
  adminBulkInvoiceAdjustments,
  adminCloseInvoice,
  adminGenerateManualInvoice,
  adminGetInvoiceOrders,
  adminRegenerateInvoice,
  adminGetInvoiceStatement,
  adminListBillingInvoices,
  adminRecordInvoicePayment,
  adminResolveDispute,
  getInvoiceDisputes,
} from '../../controllers/billingInvoice.controller'
import { isAdminMiddleware } from '../../middlewares/isAdmin'
import { requireAuth } from '../../middlewares/requireAuth'

const router = Router()

router.get(
  '/admin/billing/invoices',
  requireAuth,
  isAdminMiddleware as any,
  adminListBillingInvoices,
)
router.post(
  '/admin/billing/invoices/:userId/generate',
  requireAuth,
  isAdminMiddleware as any,
  adminGenerateManualInvoice,
)
router.get(
  '/admin/billing/invoices/:id/statement',
  requireAuth,
  isAdminMiddleware as any,
  adminGetInvoiceStatement,
)
router.get(
  '/admin/billing/invoices/:id/disputes',
  requireAuth,
  isAdminMiddleware as any,
  getInvoiceDisputes,
)
router.post(
  '/admin/billing/invoices/:id/cod-offsets',
  requireAuth,
  isAdminMiddleware as any,
  adminAddCodOffset,
)
router.post(
  '/admin/billing/invoices/:id/adjustments',
  requireAuth,
  isAdminMiddleware as any,
  adminAddInvoiceAdjustment,
)
router.post(
  '/admin/billing/invoices/:id/payments',
  requireAuth,
  isAdminMiddleware as any,
  adminRecordInvoicePayment,
)
router.get(
  '/admin/billing/invoices/:id/orders',
  requireAuth,
  isAdminMiddleware as any,
  adminGetInvoiceOrders,
)
router.post(
  '/admin/billing/invoices/:id/adjustments/bulk',
  requireAuth,
  isAdminMiddleware as any,
  adminBulkInvoiceAdjustments,
)
router.post(
  '/admin/billing/invoices/:id/close',
  requireAuth,
  isAdminMiddleware as any,
  adminCloseInvoice,
)
router.post(
  '/admin/billing/invoices/:id/regenerate',
  requireAuth,
  isAdminMiddleware as any,
  adminRegenerateInvoice,
)
router.post(
  '/admin/billing/disputes/:disputeId/resolve',
  requireAuth,
  isAdminMiddleware as any,
  adminResolveDispute,
)

export default router

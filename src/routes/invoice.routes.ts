import { Router } from 'express'
import { getInvoices } from '../controllers/invoice.controller'
import { requireAuth } from '../middlewares/requireAuth'

const router = Router()

router.get('/invoices', requireAuth, getInvoices)

export default router

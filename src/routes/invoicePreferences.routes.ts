import express from 'express'
import {
  fetchInvoicePreferences,
  saveOrUpdateInvoicePreferences,
} from '../controllers/invoicePreferences.controller'
import { requireAuth } from '../middlewares/requireAuth'

const router = express.Router()

// Only two routes: one to save/update, one to fetch
router.post('/invoice-preferences', requireAuth, saveOrUpdateInvoicePreferences)
router.get('/invoice-preferences', requireAuth, fetchInvoicePreferences)

export default router

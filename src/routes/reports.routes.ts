import express from 'express'
import { exportCustomReportCsvController } from '../controllers/reports.controller'
import { requireAuth } from '../middlewares/requireAuth'

const router = express.Router()

router.post('/custom-export', requireAuth, exportCustomReportCsvController)

export default router


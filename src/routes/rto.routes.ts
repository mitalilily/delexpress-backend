import { Router } from 'express'
import { exportAdminRto, getAdminRtoEvents, getAdminRtoKpis, getMyRtoEvents } from '../controllers/rto.controller'
import { requireAuth } from '../middlewares/requireAuth'
import { isAdminMiddleware } from '../middlewares/isAdmin'

const r = Router()

r.get('/rto', requireAuth, getMyRtoEvents)

// Admin-only RTO listing
r.get('/admin/rto', requireAuth, isAdminMiddleware, getAdminRtoEvents)

// Admin RTO KPIs
r.get('/admin/rto/kpis', requireAuth, isAdminMiddleware, getAdminRtoKpis)

// Admin RTO export
r.get('/admin/rto/export', requireAuth, isAdminMiddleware, exportAdminRto)

export default r

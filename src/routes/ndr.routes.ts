import { Router } from 'express'
import {
  getAdminNdrEvents,
  getAdminNdrTimeline,
  getMyNdrEvents,
  getMyNdrTimeline,
} from '../controllers/ndr.controller'
import {
  ndrReattemptController,
  ndrChangeAddressController,
  ndrChangePhoneController,
  delhiveryPickupRescheduleController,
  ndrBulkActionController,
  delhiveryUplStatusController,
} from '../controllers/ndrActions.controller'
import { exportAdminNdrCsv, getAdminNdrKpis } from '../controllers/ndr.controller'
import { requireAuth } from '../middlewares/requireAuth'
import { isAdminMiddleware } from '../middlewares/isAdmin'

const r = Router()

r.get('/ndr', requireAuth, getMyNdrEvents)
// my timeline
r.get('/ndr/timeline', requireAuth, getMyNdrTimeline)

r.get('/admin/ndr', requireAuth, isAdminMiddleware, getAdminNdrEvents)
// timeline
r.get('/admin/ndr/timeline', requireAuth, isAdminMiddleware, getAdminNdrTimeline)
// export + kpis
r.get('/admin/ndr/export', requireAuth, isAdminMiddleware, exportAdminNdrCsv)
r.get('/admin/ndr/kpis', requireAuth, isAdminMiddleware, getAdminNdrKpis)

// NDR actions
r.post('/ndr/reattempt', requireAuth, ndrReattemptController)
r.post('/ndr/change-address', requireAuth, ndrChangeAddressController)
r.post('/ndr/change-phone', requireAuth, ndrChangePhoneController)
r.post('/ndr/delhivery/pickup-reschedule', requireAuth, delhiveryPickupRescheduleController)
r.post('/ndr/bulk', requireAuth, ndrBulkActionController)
// Delhivery UPL status proxy
r.get('/ndr/delhivery/upl-status', requireAuth, delhiveryUplStatusController)

export default r

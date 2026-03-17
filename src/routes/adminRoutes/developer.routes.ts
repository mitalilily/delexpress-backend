import { Router } from 'express'
import {
  getDeveloperErrorLogsController,
  retryDeveloperManifestController,
  updateDeveloperIssueStateController,
} from '../../controllers/admin/developer.controller'
import { isAdminMiddleware } from '../../middlewares/isAdmin'
import { requireAuth } from '../../middlewares/requireAuth'

const router = Router()

router.get('/error-logs', requireAuth, isAdminMiddleware, getDeveloperErrorLogsController)
router.patch('/issues/:issueKey', requireAuth, isAdminMiddleware, updateDeveloperIssueStateController)
router.post('/retry-manifest', requireAuth, isAdminMiddleware, retryDeveloperManifestController)

export default router

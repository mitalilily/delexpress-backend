import express from 'express'

import { getUserStoreIntegrations } from '../controllers/platformIntegration.controller'
import { completeRegistration, getCurrentUser, getUserById } from '../controllers/userController'
import { requireAuth } from '../middlewares/requireAuth'

const router = express.Router()
router.post('/complete-user-onboarding', requireAuth, completeRegistration)
router.get('/user-info', requireAuth, getCurrentUser)
router.get('/user-info/:userId', requireAuth, getUserById)

router.get('/integrations', requireAuth, getUserStoreIntegrations)

export default router

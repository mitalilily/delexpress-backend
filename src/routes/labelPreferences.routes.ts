// routes/labelPreferencesRoutes.ts
import { Router } from 'express'
import { labelPreferencesController } from '../controllers/labelPreferences.controller'
import { requireAuth } from '../middlewares/requireAuth'

const router = Router()

router.get('/', requireAuth, labelPreferencesController.get)
router.post('/', requireAuth, labelPreferencesController.save)

export default router

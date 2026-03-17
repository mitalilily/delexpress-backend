import { Router } from 'express'
import { StaticPagesController } from '../controllers/staticPages.controller'
import { isAdminMiddleware } from '../middlewares/isAdmin'
import { requireAuth } from '../middlewares/requireAuth'

const router = Router()

// Public: fetch a static page by slug
router.get('/:slug', StaticPagesController.getBySlug)

// Admin only: create or update a static page by slug
router.put('/:slug', requireAuth, isAdminMiddleware, StaticPagesController.upsertBySlug)

export default router





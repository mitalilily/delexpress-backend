import { Router } from 'express'
import { BlogController } from '../controllers/blogs.controller'
import { isAdminMiddleware } from '../middlewares/isAdmin'
import { requireAuth } from '../middlewares/requireAuth'

const router = Router()

router.get('/', BlogController.list) // list + filters + search
router.get('/stats', requireAuth, isAdminMiddleware, BlogController.stats) // quick stats
router.get('/:id', BlogController.get) // get single blog
router.post('/', requireAuth, isAdminMiddleware, BlogController.create) // create blog
router.put('/:id', requireAuth, isAdminMiddleware, BlogController.update) // update blog

export default router

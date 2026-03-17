import express from 'express'
import { globalSearchController } from '../controllers/globalSearch.controller'
import { requireAuth } from '../middlewares/requireAuth'

const router = express.Router()

router.get('/search', requireAuth, globalSearchController)

export default router


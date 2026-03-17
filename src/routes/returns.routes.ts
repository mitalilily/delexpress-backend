import { Router } from 'express'
import { createReversePickup, quoteReverse } from '../controllers/returns.controller'
import { requireAuth } from '../middlewares/requireAuth'

const r = Router()

r.post('/returns/create', requireAuth, createReversePickup)
r.post('/returns/quote', requireAuth, quoteReverse)

export default r

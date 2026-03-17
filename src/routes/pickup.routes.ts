import { Router } from 'express'
import { cancelShipment } from '../controllers/pickup.controller'
import { requireAuth } from '../middlewares/requireAuth'

const r = Router()

r.post('/shipments/cancel', requireAuth, cancelShipment)

export default r

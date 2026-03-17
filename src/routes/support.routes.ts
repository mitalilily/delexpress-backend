import { Router } from 'express'
import * as SupportController from '../controllers/support.controller'
import { requireAuth } from '../middlewares/requireAuth'

const router = Router()

router.post('/tickets', requireAuth, SupportController.createTicket)
router.get('/tickets', requireAuth, SupportController.getMyTickets)
router.get('/tickets/:id', requireAuth, SupportController.getTicketById)
router.patch('/tickets/:id', requireAuth, SupportController.updateTicket)

export default router

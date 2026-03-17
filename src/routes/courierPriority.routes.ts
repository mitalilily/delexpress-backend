import { Router } from 'express'
import { CourierPriorityController } from '../controllers/courierPriority.controller'
import { requireAuth } from '../middlewares/requireAuth'

const router = Router()

router.use(requireAuth)

router.post('/courier-priorities', CourierPriorityController.create)
router.get('/courier-priorities/user/', CourierPriorityController.getByUser)
router.get('/:id', CourierPriorityController.getOne)
router.put('/:id', CourierPriorityController.update)
router.delete('/:id', CourierPriorityController.delete)

export default router

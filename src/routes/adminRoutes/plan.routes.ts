// src/routes/plans.routes.ts
import { Router } from 'express'
import { PlansController } from '../../controllers/admin/plans.controller'

const router = Router()

router.get('/', PlansController.getPlans) // GET /api/plans
router.post('/', PlansController.createPlan) // POST /api/plans
router.post('/assign-to-user', PlansController.assignPlanToUser) // aSSIGN /api/plans/:id
router.put('/:id', PlansController.updatePlan) // PUT /api/plans/:id
router.delete('/:id', PlansController.deletePlan) // DELETE /api/plans/:id

export default router

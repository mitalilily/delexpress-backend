import express from 'express'
import { LocationController } from '../../controllers/admin/locations.controller'

const router = express.Router()

router.post('/locations', LocationController.create)
router.get('/locations', LocationController.list)
router.get('/locations/:id', LocationController.getById)
router.put('/locations/:id', LocationController.update)
router.delete('/locations/:id', LocationController.delete)

export default router

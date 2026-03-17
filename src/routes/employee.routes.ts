import { Router } from 'express'
import {
  createEmployee,
  deleteEmployee,
  getEmployee,
  getEmployeesByAdmin,
  toggleEmployeeStatusController,
  updateEmployee,
} from '../controllers/employee.controller'
import { requireAuth } from '../middlewares/requireAuth'

const router = Router()

// Get employees list by admin
router.get('/users', requireAuth, getEmployeesByAdmin)

// Get single employee
router.get('/:id', requireAuth, getEmployee)

// Create employee
router.post('/create', requireAuth, createEmployee)

router.patch('/update/:id', requireAuth, updateEmployee)

// Delete employee
router.delete('/delete/:id', requireAuth, deleteEmployee)

// ✅ Toggle employee status (isActive / isOnline)
router.patch('/:id/toggle', requireAuth, toggleEmployeeStatusController)

export default router

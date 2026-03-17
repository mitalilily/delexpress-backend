import { Request, Response } from 'express'
import {
  createEmployeeService,
  deleteEmployeeService,
  getEmployeesByAdminService,
  getEmployeeService,
  toggleEmployeeStatusService,
  updateEmployeeService,
} from '../models/services/employee.service'

export const createEmployee = async (req: any, res: Response) => {
  try {
    const userId = req.user?.sub

    if (!userId) {
      return res.status(400).json({ error: 'Admin user ID is required' })
    }

    const { employee, user } = await createEmployeeService(req.body, userId)

    return res.status(201).json({
      message: 'Employee created successfully',
      employee,
      user,
    })
  } catch (error: any) {
    console.error('Error creating employee:', error)

    if (error.code === '23505') {
      // PostgreSQL unique violation
      return res.status(409).json({
        error: 'User with this email or phone already exists',
      })
    }

    return res.status(500).json({
      error: error.message,
    })
  }
}

export const getEmployee = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    if (!id) {
      return res.status(400).json({ error: 'Employee ID is required' })
    }

    const employee = await getEmployeeService(id)

    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' })
    }

    res.status(200).json(employee)
  } catch (error: any) {
    console.error('Error fetching employee:', error)
    res.status(500).json({ error: 'Failed to fetch employee' })
  }
}

export const getEmployeesByAdmin = async (req: any, res: Response) => {
  try {
    const adminId = req.user?.sub
    if (!adminId) return res.status(400).json({ error: 'Admin ID is required' })

    const page = parseInt(req.query.page as string, 10) || 1
    const limit = parseInt(req.query.limit as string, 10) || 20
    const search = (req.query.search as string) || ''
    const statusQuery = (req.query.status as string) || ''
    const status =
      statusQuery === 'active' || statusQuery === 'inactive' ? (statusQuery as 'active' | 'inactive') : undefined

    const employees = await getEmployeesByAdminService(adminId, page, limit, search, status)

    res.status(200).json(employees)
  } catch (error: any) {
    console.error('Error fetching employees:', error)
    res.status(500).json({ error: 'Failed to fetch employees' })
  }
}

export const deleteEmployee = async (req: any, res: Response) => {
  try {
    const adminId = req.user?.sub
    const { id } = req.params

    if (!adminId) return res.status(400).json({ error: 'Admin ID is required' })
    if (!id) return res.status(400).json({ error: 'Employee ID is required' })

    const deletedEmployee = await deleteEmployeeService(id, adminId)

    if (!deletedEmployee) {
      return res.status(404).json({ error: 'Employee not found or not authorized' })
    }

    res.status(200).json({
      message: 'Employee deleted successfully',
      employee: deletedEmployee,
    })
  } catch (error: any) {
    console.error('Error deleting employee:', error)
    res.status(500).json({ error: 'Failed to delete employee' })
  }
}

export const updateEmployee = async (req: any, res: Response) => {
  try {
    const adminId = req.user?.sub
    const { id } = req.params

    if (!adminId) return res.status(400).json({ error: 'Admin ID is required' })
    if (!id) return res.status(400).json({ error: 'Employee ID is required' })

    const updatedEmployee = await updateEmployeeService(id, adminId, req.body)

    if (!updatedEmployee) {
      return res.status(404).json({ error: 'Employee not found or not authorized' })
    }

    res.status(200).json({
      message: 'Employee updated successfully',
      employee: updatedEmployee,
    })
  } catch (error: any) {
    console.error('Error updating employee:', error)
    res.status(500).json({ error: 'Failed to update employee' })
  }
}

export const toggleEmployeeStatusController = async (req: any, res: Response) => {
  try {
    const { id } = req.params
    const { isActive } = req.body // must be 'isActive' or 'isOnline'
    const adminId = req.user.sub // assuming auth middleware injects user
    const updatedEmployee = await toggleEmployeeStatusService(id, adminId, isActive)

    res.json({ success: true, employee: updatedEmployee })
  } catch (err: any) {
    res.status(500).json({ success: false, message: err.message })
  }
}

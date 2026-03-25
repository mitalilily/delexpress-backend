"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.toggleEmployeeStatusController = exports.updateEmployee = exports.deleteEmployee = exports.getEmployeesByAdmin = exports.getEmployee = exports.createEmployee = void 0;
const employee_service_1 = require("../models/services/employee.service");
const createEmployee = async (req, res) => {
    try {
        const userId = req.user?.sub;
        if (!userId) {
            return res.status(400).json({ error: 'Admin user ID is required' });
        }
        const { employee, user } = await (0, employee_service_1.createEmployeeService)(req.body, userId);
        return res.status(201).json({
            message: 'Employee created successfully',
            employee,
            user,
        });
    }
    catch (error) {
        console.error('Error creating employee:', error);
        if (error.code === '23505') {
            // PostgreSQL unique violation
            return res.status(409).json({
                error: 'User with this email or phone already exists',
            });
        }
        return res.status(500).json({
            error: error.message,
        });
    }
};
exports.createEmployee = createEmployee;
const getEmployee = async (req, res) => {
    try {
        const { id } = req.params;
        if (!id) {
            return res.status(400).json({ error: 'Employee ID is required' });
        }
        const employee = await (0, employee_service_1.getEmployeeService)(id);
        if (!employee) {
            return res.status(404).json({ error: 'Employee not found' });
        }
        res.status(200).json(employee);
    }
    catch (error) {
        console.error('Error fetching employee:', error);
        res.status(500).json({ error: 'Failed to fetch employee' });
    }
};
exports.getEmployee = getEmployee;
const getEmployeesByAdmin = async (req, res) => {
    try {
        const adminId = req.user?.sub;
        if (!adminId)
            return res.status(400).json({ error: 'Admin ID is required' });
        const page = parseInt(req.query.page, 10) || 1;
        const limit = parseInt(req.query.limit, 10) || 20;
        const search = req.query.search || '';
        const statusQuery = req.query.status || '';
        const status = statusQuery === 'active' || statusQuery === 'inactive' ? statusQuery : undefined;
        const employees = await (0, employee_service_1.getEmployeesByAdminService)(adminId, page, limit, search, status);
        res.status(200).json(employees);
    }
    catch (error) {
        console.error('Error fetching employees:', error);
        res.status(500).json({ error: 'Failed to fetch employees' });
    }
};
exports.getEmployeesByAdmin = getEmployeesByAdmin;
const deleteEmployee = async (req, res) => {
    try {
        const adminId = req.user?.sub;
        const { id } = req.params;
        if (!adminId)
            return res.status(400).json({ error: 'Admin ID is required' });
        if (!id)
            return res.status(400).json({ error: 'Employee ID is required' });
        const deletedEmployee = await (0, employee_service_1.deleteEmployeeService)(id, adminId);
        if (!deletedEmployee) {
            return res.status(404).json({ error: 'Employee not found or not authorized' });
        }
        res.status(200).json({
            message: 'Employee deleted successfully',
            employee: deletedEmployee,
        });
    }
    catch (error) {
        console.error('Error deleting employee:', error);
        res.status(500).json({ error: 'Failed to delete employee' });
    }
};
exports.deleteEmployee = deleteEmployee;
const updateEmployee = async (req, res) => {
    try {
        const adminId = req.user?.sub;
        const { id } = req.params;
        if (!adminId)
            return res.status(400).json({ error: 'Admin ID is required' });
        if (!id)
            return res.status(400).json({ error: 'Employee ID is required' });
        const updatedEmployee = await (0, employee_service_1.updateEmployeeService)(id, adminId, req.body);
        if (!updatedEmployee) {
            return res.status(404).json({ error: 'Employee not found or not authorized' });
        }
        res.status(200).json({
            message: 'Employee updated successfully',
            employee: updatedEmployee,
        });
    }
    catch (error) {
        console.error('Error updating employee:', error);
        res.status(500).json({ error: 'Failed to update employee' });
    }
};
exports.updateEmployee = updateEmployee;
const toggleEmployeeStatusController = async (req, res) => {
    try {
        const { id } = req.params;
        const { isActive } = req.body; // must be 'isActive' or 'isOnline'
        const adminId = req.user.sub; // assuming auth middleware injects user
        const updatedEmployee = await (0, employee_service_1.toggleEmployeeStatusService)(id, adminId, isActive);
        res.json({ success: true, employee: updatedEmployee });
    }
    catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};
exports.toggleEmployeeStatusController = toggleEmployeeStatusController;

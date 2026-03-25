"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const employee_controller_1 = require("../controllers/employee.controller");
const requireAuth_1 = require("../middlewares/requireAuth");
const router = (0, express_1.Router)();
// Get employees list by admin
router.get('/users', requireAuth_1.requireAuth, employee_controller_1.getEmployeesByAdmin);
// Get single employee
router.get('/:id', requireAuth_1.requireAuth, employee_controller_1.getEmployee);
// Create employee
router.post('/create', requireAuth_1.requireAuth, employee_controller_1.createEmployee);
router.patch('/update/:id', requireAuth_1.requireAuth, employee_controller_1.updateEmployee);
// Delete employee
router.delete('/delete/:id', requireAuth_1.requireAuth, employee_controller_1.deleteEmployee);
// ✅ Toggle employee status (isActive / isOnline)
router.patch('/:id/toggle', requireAuth_1.requireAuth, employee_controller_1.toggleEmployeeStatusController);
exports.default = router;

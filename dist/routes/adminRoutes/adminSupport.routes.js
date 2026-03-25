"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// src/routes/admin.support.routes.ts
const express_1 = require("express");
const support_controller_1 = require("../../controllers/admin/support.controller");
const support_controller_2 = require("../../controllers/support.controller");
const isAdmin_1 = require("../../middlewares/isAdmin");
const requireAuth_1 = require("../../middlewares/requireAuth");
const router = (0, express_1.Router)();
// List all tickets with filters
router.get('/support-tickets', requireAuth_1.requireAuth, isAdmin_1.isAdminMiddleware, support_controller_1.getAllTickets);
// Get a specific ticket
router.get('/support-tickets/:id', support_controller_2.getTicketById);
// Update ticket (status, due date)
router.patch('/support-tickets/:id', requireAuth_1.requireAuth, isAdmin_1.isAdminMiddleware, support_controller_2.updateTicket);
router.get('/support-tickets/user/:userId', requireAuth_1.requireAuth, isAdmin_1.isAdminMiddleware, support_controller_1.getTicketsByUserId);
exports.default = router;

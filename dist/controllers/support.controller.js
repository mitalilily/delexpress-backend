"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateTicket = exports.getTicketById = exports.getMyTickets = exports.createTicket = void 0;
const support_service_1 = require("../models/services/support.service");
const createTicket = async (req, res) => {
    try {
        const { subject, category, subcategory, awbNumber, description, dueDate, attachments } = req.body;
        const userId = req.user.sub;
        const ticket = await (0, support_service_1.createTicketService)({
            userId,
            subject,
            category,
            subcategory,
            awbNumber,
            description,
            dueDate: dueDate ? new Date(dueDate) : undefined,
            attachments,
        });
        res.status(201).json(ticket);
    }
    catch (err) {
        console.error('[Support] Ticket creation failed:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
};
exports.createTicket = createTicket;
const getMyTickets = async (req, res) => {
    try {
        const userId = req.user.sub;
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        const offset = (page - 1) * limit;
        const filters = {
            status: req.query.status ?? '',
            category: req.query.category,
            awbNumber: req.query.awbNumber,
        };
        const { tickets, totalCount, statusCounts } = await (0, support_service_1.getUserTicketsService)(userId, limit, offset, filters);
        res.status(200).json({
            data: tickets,
            totalCount,
            statusCounts,
            message: 'Successfully fetched tickets',
        });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Internal server error' });
    }
};
exports.getMyTickets = getMyTickets;
const getTicketById = async (req, res) => {
    try {
        const { id } = req.params;
        const userId = req.user.sub;
        const isAdmin = req.user.role === 'admin';
        const ticket = await (0, support_service_1.getTicketByIdService)(id, userId, isAdmin);
        if (!ticket)
            return res.status(404).json({ message: 'Ticket not found' });
        res.status(200).json(ticket);
    }
    catch (err) {
        res.status(500).json({ message: 'Internal server error' });
    }
};
exports.getTicketById = getTicketById;
const updateTicket = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, dueDate } = req.body;
        const ticket = await (0, support_service_1.updateTicketStatusService)(id, {
            status,
            dueDate: dueDate ? new Date(dueDate) : undefined,
        });
        res.status(200).json(ticket);
    }
    catch (err) {
        res.status(500).json({ message: 'Internal server error' });
    }
};
exports.updateTicket = updateTicket;

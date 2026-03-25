"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTicketsByUserId = exports.updateTicketStatus = exports.getTicketDetails = exports.getAllTickets = void 0;
const support_service_1 = require("../../models/services/support.service");
const getAllTickets = async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 20;
        const page = parseInt(req.query.page) || 1;
        const offset = (page - 1) * limit;
        // Normalize all status values into a single array
        let status = [];
        const statusRaw = req.query['status[]'] ?? req.query.status;
        if (Array.isArray(statusRaw)) {
            status = statusRaw.flat().filter(Boolean);
        }
        else if (typeof statusRaw === 'string') {
            status = [statusRaw];
        }
        // If still empty, set as undefined
        if (!status.length)
            status = undefined;
        const filters = {
            status,
            category: req.query.category,
            subcategory: req.query.subcategory,
            awbNumber: req.query.awbNumber,
            userId: req.query.userId,
            userName: req.query.userName,
            subject: req.query.subject,
            sortBy: req.query.sortBy,
        };
        const { tickets, totalCount, statusCounts } = await (0, support_service_1.getAllTicketsService)(limit, offset, filters);
        res.json({
            success: true,
            data: tickets,
            totalCount,
            statusCounts,
            message: 'Fetched tickets successfully',
        });
    }
    catch (error) {
        console.error('[Admin] Get all tickets failed:', error);
        res.status(200).json({
            success: false,
            message: 'Failed to fetch support tickets.',
            data: [],
            statusCounts: {},
            totalCount: 0,
        });
    }
};
exports.getAllTickets = getAllTickets;
const getTicketDetails = async (req, res) => {
    try {
        const { id } = req.params;
        const ticket = await (0, support_service_1.getTicketByIdService)(id, '', true);
        if (!ticket)
            return res.status(404).json({ message: 'Ticket not found' });
        res.status(200).json(ticket);
    }
    catch (err) {
        console.error('[Admin] Get ticket by ID failed:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
};
exports.getTicketDetails = getTicketDetails;
const updateTicketStatus = async (req, res) => {
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
        console.error('[Admin] Update ticket status failed:', err);
        res.status(500).json({ message: 'Internal server error' });
    }
};
exports.updateTicketStatus = updateTicketStatus;
const getTicketsByUserId = async (req, res) => {
    try {
        const userId = req.params.userId; // assert to string
        const page = parseInt(req.query.page) || 1;
        const perPage = parseInt(req.query.perPage) || 10;
        const data = await (0, support_service_1.getTicketsForUserService)(userId, page, perPage);
        res.status(200).json(data);
    }
    catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error fetching tickets' });
    }
};
exports.getTicketsByUserId = getTicketsByUserId;

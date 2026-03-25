"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.seedNationalHolidaysController = exports.deleteHolidayController = exports.updateHolidayController = exports.createHolidayController = exports.getHolidayController = exports.listHolidaysController = void 0;
const holiday_service_1 = require("../../../models/services/holiday.service");
const parseCourierScope = (req) => {
    if (!req) {
        return { courierId: undefined, serviceProvider: undefined };
    }
    const courierIdParam = req.query?.courier_id ?? req.body?.courierId ?? req.body?.courier_id;
    const serviceProviderParam = req.query?.service_provider ?? req.body?.serviceProvider ?? req.body?.service_provider;
    return {
        courierId: courierIdParam != null && courierIdParam !== '' ? Number(courierIdParam) : undefined,
        serviceProvider: typeof serviceProviderParam === 'string' && serviceProviderParam.length
            ? serviceProviderParam
            : undefined,
    };
};
const listHolidaysController = async (req, res) => {
    try {
        const holidays = await (0, holiday_service_1.listHolidays)({
            startDate: req.query.start_date ?? req.query.startDate ?? undefined,
            endDate: req.query.end_date ?? req.query.endDate ?? undefined,
            type: req.query.type ?? undefined,
            state: req.query.state ?? undefined,
            courierScope: parseCourierScope(req),
            isActive: req.query.is_active !== undefined
                ? req.query.is_active === 'true'
                : req.query.isActive !== undefined
                    ? req.query.isActive === 'true'
                    : undefined,
            year: req.query.year ? Number(req.query.year) : undefined,
        });
        res.json({ success: true, data: holidays });
    }
    catch (error) {
        res.status(500).json({ success: false, error: error?.message || 'Failed to fetch holidays' });
    }
};
exports.listHolidaysController = listHolidaysController;
const getHolidayController = async (req, res) => {
    try {
        const holiday = await (0, holiday_service_1.getHoliday)(req.params.id);
        if (!holiday) {
            return res.status(404).json({ success: false, error: 'Holiday not found' });
        }
        res.json({ success: true, data: holiday });
    }
    catch (error) {
        res.status(500).json({ success: false, error: error?.message || 'Failed to fetch holiday' });
    }
};
exports.getHolidayController = getHolidayController;
const createHolidayController = async (req, res) => {
    try {
        const holiday = await (0, holiday_service_1.createHoliday)({
            name: req.body.name,
            date: req.body.date,
            type: req.body.type,
            state: req.body.state ?? req.body.state_name ?? null,
            courierId: req.body.courier_id ?? req.body.courierId ?? null,
            serviceProvider: req.body.service_provider ?? req.body.serviceProvider ?? null,
            description: req.body.description ?? null,
            isRecurring: req.body.is_recurring ?? req.body.isRecurring ?? false,
            year: req.body.year ?? null,
            isActive: req.body.is_active ?? req.body.isActive ?? true,
            metadata: req.body.metadata ?? null,
            createdBy: req.user?.id ?? null,
        });
        res.status(201).json({ success: true, data: holiday });
    }
    catch (error) {
        res.status(400).json({ success: false, error: error?.message || 'Failed to create holiday' });
    }
};
exports.createHolidayController = createHolidayController;
const updateHolidayController = async (req, res) => {
    try {
        const holiday = await (0, holiday_service_1.updateHoliday)({
            id: req.params.id,
            name: req.body.name,
            date: req.body.date,
            type: req.body.type,
            state: req.body.state ?? req.body.state_name ?? undefined,
            courierId: req.body.courier_id ?? req.body.courierId ?? undefined,
            serviceProvider: req.body.service_provider ?? req.body.serviceProvider ?? undefined,
            description: req.body.description,
            isRecurring: req.body.is_recurring ?? req.body.isRecurring,
            year: req.body.year,
            isActive: req.body.is_active ?? req.body.isActive,
            metadata: req.body.metadata,
        });
        res.json({ success: true, data: holiday });
    }
    catch (error) {
        res.status(400).json({ success: false, error: error?.message || 'Failed to update holiday' });
    }
};
exports.updateHolidayController = updateHolidayController;
const deleteHolidayController = async (req, res) => {
    try {
        await (0, holiday_service_1.deleteHoliday)(req.params.id);
        res.json({ success: true });
    }
    catch (error) {
        res.status(400).json({ success: false, error: error?.message || 'Failed to delete holiday' });
    }
};
exports.deleteHolidayController = deleteHolidayController;
const seedNationalHolidaysController = async (req, res) => {
    try {
        const year = req.body.year ? Number(req.body.year) : undefined;
        const result = await (0, holiday_service_1.seedDefaultNationalHolidays)(year);
        res.json({
            success: true,
            data: result,
            message: `Created ${result.created.length} new holidays, ${result.skipped.length} already existed`,
        });
    }
    catch (error) {
        res.status(400).json({ success: false, error: error?.message || 'Failed to seed holidays' });
    }
};
exports.seedNationalHolidaysController = seedNationalHolidaysController;

"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.seedDefaultNationalHolidays = exports.deleteHoliday = exports.updateHoliday = exports.createHoliday = exports.getHoliday = exports.listHolidays = exports.isHoliday = void 0;
const dayjs_1 = __importDefault(require("dayjs"));
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../client");
const holidays_1 = require("../schema/holidays");
/**
 * Check if a date is a holiday
 * Returns true if the date is:
 * - A Sunday (always considered a holiday)
 * - A national holiday
 * - A state-specific holiday for the given state
 * - A courier-specific holiday for the given courier
 */
const isHoliday = async (date, options) => {
    const dateStr = typeof date === 'string' ? date : (0, dayjs_1.default)(date).format('YYYY-MM-DD');
    const dateObj = (0, dayjs_1.default)(dateStr);
    const year = dateObj.year();
    const month = dateObj.month() + 1;
    const day = dateObj.date();
    const dayOfWeek = dateObj.day(); // 0 = Sunday, 6 = Saturday
    // Check if it's a Sunday
    if (dayOfWeek === 0) {
        return true;
    }
    // Fetch all active holidays that could match
    const allHolidays = await client_1.db.select().from(holidays_1.holidays).where((0, drizzle_orm_1.eq)(holidays_1.holidays.is_active, true));
    // Filter holidays that match the date
    for (const holiday of allHolidays) {
        const holidayDate = (0, dayjs_1.default)(holiday.date);
        const holidayMonth = holidayDate.month() + 1;
        const holidayDay = holidayDate.date();
        const holidayYear = holidayDate.year();
        // Check if date matches
        let dateMatches = false;
        if (holiday.is_recurring) {
            // Recurring: match month and day
            dateMatches = month === holidayMonth && day === holidayDay;
        }
        else {
            // Non-recurring: match exact date or year if year is null
            if (holiday.year) {
                dateMatches = dateStr === holiday.date && year === holiday.year;
            }
            else {
                dateMatches =
                    dateStr === holiday.date ||
                        (month === holidayMonth && day === holidayDay && year === holidayYear);
            }
        }
        if (!dateMatches)
            continue;
        // Check type and scope
        if (holiday.type === 'national') {
            return true; // National holidays always apply
        }
        if (holiday.type === 'state' && options?.state && holiday.state === options.state) {
            return true;
        }
        if (holiday.type === 'courier' && options?.courierScope) {
            const { courierId, serviceProvider } = options.courierScope;
            const courierMatches = (courierId && holiday.courier_id === courierId) || (!courierId && !holiday.courier_id);
            const providerMatches = (serviceProvider && holiday.service_provider === serviceProvider) ||
                (!serviceProvider && !holiday.service_provider);
            if (courierMatches && providerMatches) {
                return true;
            }
        }
    }
    return false;
};
exports.isHoliday = isHoliday;
/**
 * Get all holidays in a date range
 */
const listHolidays = async (params = {}) => {
    const conditions = [];
    // Date range filter
    if (params.startDate || params.endDate) {
        if (params.startDate && params.endDate) {
            conditions.push((0, drizzle_orm_1.and)((0, drizzle_orm_1.gte)(holidays_1.holidays.date, params.startDate), (0, drizzle_orm_1.lte)(holidays_1.holidays.date, params.endDate)));
        }
        else if (params.startDate) {
            conditions.push((0, drizzle_orm_1.gte)(holidays_1.holidays.date, params.startDate));
        }
        else if (params.endDate) {
            conditions.push((0, drizzle_orm_1.lte)(holidays_1.holidays.date, params.endDate));
        }
    }
    // Type filter
    if (params.type) {
        conditions.push((0, drizzle_orm_1.eq)(holidays_1.holidays.type, params.type));
    }
    // State filter
    if (params.state) {
        conditions.push((0, drizzle_orm_1.eq)(holidays_1.holidays.state, params.state));
    }
    // Courier scope filter
    if (params.courierScope) {
        const { courierId, serviceProvider } = params.courierScope;
        if (courierId) {
            conditions.push((0, drizzle_orm_1.eq)(holidays_1.holidays.courier_id, courierId));
        }
        else {
            conditions.push((0, drizzle_orm_1.isNull)(holidays_1.holidays.courier_id));
        }
        if (serviceProvider) {
            conditions.push((0, drizzle_orm_1.eq)(holidays_1.holidays.service_provider, serviceProvider));
        }
        else {
            conditions.push((0, drizzle_orm_1.isNull)(holidays_1.holidays.service_provider));
        }
    }
    // Active filter
    if (params.isActive !== undefined) {
        conditions.push((0, drizzle_orm_1.eq)(holidays_1.holidays.is_active, params.isActive));
    }
    // Year filter (for non-recurring holidays)
    if (params.year) {
        conditions.push((0, drizzle_orm_1.or)((0, drizzle_orm_1.eq)(holidays_1.holidays.year, params.year), (0, drizzle_orm_1.isNull)(holidays_1.holidays.year), (0, drizzle_orm_1.eq)(holidays_1.holidays.is_recurring, true)));
    }
    const result = await client_1.db
        .select()
        .from(holidays_1.holidays)
        .where((0, drizzle_orm_1.and)(...conditions));
    return result;
};
exports.listHolidays = listHolidays;
/**
 * Get a single holiday by ID
 */
const getHoliday = async (id) => {
    const [holiday] = await client_1.db.select().from(holidays_1.holidays).where((0, drizzle_orm_1.eq)(holidays_1.holidays.id, id)).limit(1);
    return holiday || null;
};
exports.getHoliday = getHoliday;
/**
 * Create a new holiday
 */
const createHoliday = async (params) => {
    // Validate: state holidays must have state
    if (params.type === 'state' && !params.state) {
        throw new Error('State holidays must have a state specified');
    }
    // Validate: courier holidays must have courier_id or service_provider
    if (params.type === 'courier' && !params.courierId && !params.serviceProvider) {
        throw new Error('Courier holidays must have courier_id or service_provider specified');
    }
    // Validate: national holidays should not have state or courier scope
    if (params.type === 'national' && (params.state || params.courierId || params.serviceProvider)) {
        throw new Error('National holidays cannot have state or courier scope');
    }
    const [created] = await client_1.db
        .insert(holidays_1.holidays)
        .values({
        name: params.name.trim(),
        date: params.date,
        type: params.type,
        state: params.state || null,
        courier_id: params.courierId || null,
        service_provider: params.serviceProvider || null,
        description: params.description || null,
        is_recurring: params.isRecurring ?? false,
        year: params.year || null,
        is_active: params.isActive ?? true,
        metadata: params.metadata ? JSON.stringify(params.metadata) : null,
        created_by: params.createdBy || null,
    })
        .returning();
    return created;
};
exports.createHoliday = createHoliday;
/**
 * Update a holiday
 */
const updateHoliday = async (params) => {
    const { id, ...updateData } = params;
    const updateValues = {
        updated_at: new Date(),
    };
    if (updateData.name !== undefined)
        updateValues.name = updateData.name.trim();
    if (updateData.date !== undefined)
        updateValues.date = updateData.date;
    if (updateData.type !== undefined)
        updateValues.type = updateData.type;
    if (updateData.state !== undefined)
        updateValues.state = updateData.state || null;
    if (updateData.courierId !== undefined)
        updateValues.courier_id = updateData.courierId || null;
    if (updateData.serviceProvider !== undefined)
        updateValues.service_provider = updateData.serviceProvider || null;
    if (updateData.description !== undefined)
        updateValues.description = updateData.description || null;
    if (updateData.isRecurring !== undefined)
        updateValues.is_recurring = updateData.isRecurring;
    if (updateData.year !== undefined)
        updateValues.year = updateData.year || null;
    if (updateData.isActive !== undefined)
        updateValues.is_active = updateData.isActive;
    if (updateData.metadata !== undefined)
        updateValues.metadata = updateData.metadata ? JSON.stringify(updateData.metadata) : null;
    // Validate constraints
    if (updateValues.type === 'state' && !updateValues.state) {
        throw new Error('State holidays must have a state specified');
    }
    if (updateValues.type === 'courier' &&
        !updateValues.courier_id &&
        !updateValues.service_provider) {
        throw new Error('Courier holidays must have courier_id or service_provider specified');
    }
    if (updateValues.type === 'national' &&
        (updateValues.state || updateValues.courier_id || updateValues.service_provider)) {
        throw new Error('National holidays cannot have state or courier scope');
    }
    const [updated] = await client_1.db
        .update(holidays_1.holidays)
        .set(updateValues)
        .where((0, drizzle_orm_1.eq)(holidays_1.holidays.id, id))
        .returning();
    return updated;
};
exports.updateHoliday = updateHoliday;
/**
 * Delete a holiday
 */
const deleteHoliday = async (id) => {
    await client_1.db.delete(holidays_1.holidays).where((0, drizzle_orm_1.eq)(holidays_1.holidays.id, id));
};
exports.deleteHoliday = deleteHoliday;
/**
 * Seed default national holidays for India
 * Uses API to fetch accurate dates, falls back to calculated dates
 */
const seedDefaultNationalHolidays = async (year) => {
    const targetYear = year || (0, dayjs_1.default)().year();
    // Try to fetch from API first, fallback to calculated dates
    const { getIndianNationalHolidays, fetchIndianHolidaysFromAPI } = await Promise.resolve().then(() => __importStar(require('../../utils/indianHolidays')));
    let holidaysToSeed;
    try {
        holidaysToSeed = await fetchIndianHolidaysFromAPI(targetYear);
    }
    catch (error) {
        console.warn('API fetch failed, using calculated dates:', error);
        holidaysToSeed = getIndianNationalHolidays(targetYear);
    }
    const created = [];
    const skipped = [];
    for (const holiday of holidaysToSeed) {
        // Check if already exists (by name, type, and date for non-recurring, or name and type for recurring)
        const existingConditions = [
            (0, drizzle_orm_1.eq)(holidays_1.holidays.name, holiday.name),
            (0, drizzle_orm_1.eq)(holidays_1.holidays.type, 'national'),
        ];
        if (holiday.isRecurring) {
            existingConditions.push((0, drizzle_orm_1.eq)(holidays_1.holidays.is_recurring, true));
        }
        else {
            existingConditions.push((0, drizzle_orm_1.eq)(holidays_1.holidays.date, holiday.date));
        }
        const existing = await client_1.db
            .select()
            .from(holidays_1.holidays)
            .where((0, drizzle_orm_1.and)(...existingConditions))
            .limit(1);
        if (existing.length === 0) {
            const [newHoliday] = await client_1.db
                .insert(holidays_1.holidays)
                .values({
                name: holiday.name,
                date: holiday.date,
                type: 'national',
                is_recurring: holiday.isRecurring,
                year: holiday.isRecurring ? null : targetYear,
                is_active: true,
            })
                .returning();
            created.push(newHoliday);
        }
        else {
            skipped.push(holiday.name);
        }
    }
    return { created, skipped, total: holidaysToSeed.length };
};
exports.seedDefaultNationalHolidays = seedDefaultNationalHolidays;

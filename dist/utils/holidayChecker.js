"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.shouldApplyHolidayCharge = exports.checkHolidayCharge = void 0;
const holiday_service_1 = require("../models/services/holiday.service");
/**
 * Check if a date is a holiday for B2B holiday charge calculation
 *
 * Holiday charge applies if pickup_date OR first_delivery_attempt_date
 * falls on a Sunday or holiday.
 *
 * @param date - The date to check (Date object or YYYY-MM-DD string)
 * @param options - Options for checking state/courier-specific holidays
 * @returns true if the date is a holiday (Sunday or configured holiday)
 */
const checkHolidayCharge = async (date, options) => {
    // Check for pickup state holidays
    if (options?.pickupState) {
        const isPickupHoliday = await (0, holiday_service_1.isHoliday)(date, {
            state: options.pickupState,
            courierScope: options.courierScope,
        });
        if (isPickupHoliday)
            return true;
    }
    // Check for delivery state holidays
    if (options?.deliveryState) {
        const isDeliveryHoliday = await (0, holiday_service_1.isHoliday)(date, {
            state: options.deliveryState,
            courierScope: options.courierScope,
        });
        if (isDeliveryHoliday)
            return true;
    }
    // Check for national/courier holidays (no state needed)
    const isNationalOrCourierHoliday = await (0, holiday_service_1.isHoliday)(date, {
        courierScope: options?.courierScope,
    });
    return isNationalOrCourierHoliday;
};
exports.checkHolidayCharge = checkHolidayCharge;
/**
 * Check if holiday charge should be applied for a B2B order
 *
 * @param pickupDate - Pickup date (Date or string)
 * @param firstDeliveryAttemptDate - First delivery attempt date (Date or string, optional)
 * @param options - Options for state/courier scope
 * @returns true if holiday charge should be applied
 */
const shouldApplyHolidayCharge = async (pickupDate, firstDeliveryAttemptDate, options) => {
    // Check pickup date
    const pickupIsHoliday = await (0, exports.checkHolidayCharge)(pickupDate, {
        pickupState: options?.pickupState,
        courierScope: options?.courierScope,
    });
    if (pickupIsHoliday)
        return true;
    // Check first delivery attempt date if provided
    if (firstDeliveryAttemptDate) {
        const deliveryIsHoliday = await (0, exports.checkHolidayCharge)(firstDeliveryAttemptDate, {
            deliveryState: options?.deliveryState,
            courierScope: options?.courierScope,
        });
        if (deliveryIsHoliday)
            return true;
    }
    return false;
};
exports.shouldApplyHolidayCharge = shouldApplyHolidayCharge;

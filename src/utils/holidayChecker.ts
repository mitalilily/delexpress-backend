import { isHoliday } from '../models/services/holiday.service'

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
export const checkHolidayCharge = async (
  date: Date | string,
  options?: {
    pickupState?: string
    deliveryState?: string
    courierScope?: {
      courierId?: number | null
      serviceProvider?: string | null
    }
  },
): Promise<boolean> => {
  // Check for pickup state holidays
  if (options?.pickupState) {
    const isPickupHoliday = await isHoliday(date, {
      state: options.pickupState,
      courierScope: options.courierScope,
    })
    if (isPickupHoliday) return true
  }

  // Check for delivery state holidays
  if (options?.deliveryState) {
    const isDeliveryHoliday = await isHoliday(date, {
      state: options.deliveryState,
      courierScope: options.courierScope,
    })
    if (isDeliveryHoliday) return true
  }

  // Check for national/courier holidays (no state needed)
  const isNationalOrCourierHoliday = await isHoliday(date, {
    courierScope: options?.courierScope,
  })

  return isNationalOrCourierHoliday
}

/**
 * Check if holiday charge should be applied for a B2B order
 *
 * @param pickupDate - Pickup date (Date or string)
 * @param firstDeliveryAttemptDate - First delivery attempt date (Date or string, optional)
 * @param options - Options for state/courier scope
 * @returns true if holiday charge should be applied
 */
export const shouldApplyHolidayCharge = async (
  pickupDate: Date | string,
  firstDeliveryAttemptDate?: Date | string,
  options?: {
    pickupState?: string
    deliveryState?: string
    courierScope?: {
      courierId?: number | null
      serviceProvider?: string | null
    }
  },
): Promise<boolean> => {
  // Check pickup date
  const pickupIsHoliday = await checkHolidayCharge(pickupDate, {
    pickupState: options?.pickupState,
    courierScope: options?.courierScope,
  })

  if (pickupIsHoliday) return true

  // Check first delivery attempt date if provided
  if (firstDeliveryAttemptDate) {
    const deliveryIsHoliday = await checkHolidayCharge(firstDeliveryAttemptDate, {
      deliveryState: options?.deliveryState,
      courierScope: options?.courierScope,
    })

    if (deliveryIsHoliday) return true
  }

  return false
}

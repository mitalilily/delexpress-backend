import dayjs from 'dayjs'
import { and, eq, gte, isNull, lte, or, SQLWrapper } from 'drizzle-orm'
import { db } from '../client'
import { holidays } from '../schema/holidays'

type CourierScope = {
  courierId?: number | null
  serviceProvider?: string | null
}

type HolidayType = 'national' | 'state' | 'courier' | 'sunday'

export interface CreateHolidayParams {
  name: string
  date: string // YYYY-MM-DD
  type: HolidayType
  state?: string | null
  courierId?: number | null
  serviceProvider?: string | null
  description?: string
  isRecurring?: boolean
  year?: number | null
  isActive?: boolean
  metadata?: Record<string, any>
  createdBy?: string
}

export interface UpdateHolidayParams extends Partial<CreateHolidayParams> {
  id: string
}

export interface ListHolidaysParams {
  startDate?: string
  endDate?: string
  type?: HolidayType
  state?: string
  courierScope?: CourierScope
  isActive?: boolean
  year?: number
}

/**
 * Check if a date is a holiday
 * Returns true if the date is:
 * - A Sunday (always considered a holiday)
 * - A national holiday
 * - A state-specific holiday for the given state
 * - A courier-specific holiday for the given courier
 */
export const isHoliday = async (
  date: Date | string,
  options?: {
    state?: string
    courierScope?: CourierScope
  },
): Promise<boolean> => {
  const dateStr = typeof date === 'string' ? date : dayjs(date).format('YYYY-MM-DD')
  const dateObj = dayjs(dateStr)
  const year = dateObj.year()
  const month = dateObj.month() + 1
  const day = dateObj.date()
  const dayOfWeek = dateObj.day() // 0 = Sunday, 6 = Saturday

  // Check if it's a Sunday
  if (dayOfWeek === 0) {
    return true
  }

  // Fetch all active holidays that could match
  const allHolidays = await db.select().from(holidays).where(eq(holidays.is_active, true))

  // Filter holidays that match the date
  for (const holiday of allHolidays) {
    const holidayDate = dayjs(holiday.date)
    const holidayMonth = holidayDate.month() + 1
    const holidayDay = holidayDate.date()
    const holidayYear = holidayDate.year()

    // Check if date matches
    let dateMatches = false
    if (holiday.is_recurring) {
      // Recurring: match month and day
      dateMatches = month === holidayMonth && day === holidayDay
    } else {
      // Non-recurring: match exact date or year if year is null
      if (holiday.year) {
        dateMatches = dateStr === holiday.date && year === holiday.year
      } else {
        dateMatches =
          dateStr === holiday.date ||
          (month === holidayMonth && day === holidayDay && year === holidayYear)
      }
    }

    if (!dateMatches) continue

    // Check type and scope
    if (holiday.type === 'national') {
      return true // National holidays always apply
    }

    if (holiday.type === 'state' && options?.state && holiday.state === options.state) {
      return true
    }

    if (holiday.type === 'courier' && options?.courierScope) {
      const { courierId, serviceProvider } = options.courierScope
      const courierMatches =
        (courierId && holiday.courier_id === courierId) || (!courierId && !holiday.courier_id)
      const providerMatches =
        (serviceProvider && holiday.service_provider === serviceProvider) ||
        (!serviceProvider && !holiday.service_provider)
      if (courierMatches && providerMatches) {
        return true
      }
    }
  }

  return false
}

/**
 * Get all holidays in a date range
 */
export const listHolidays = async (params: ListHolidaysParams = {}) => {
  const conditions: SQLWrapper[] = []

  // Date range filter
  if (params.startDate || params.endDate) {
    if (params.startDate && params.endDate) {
      conditions.push(
        and(gte(holidays.date, params.startDate), lte(holidays.date, params.endDate)) as SQLWrapper,
      )
    } else if (params.startDate) {
      conditions.push(gte(holidays.date, params.startDate) as SQLWrapper)
    } else if (params.endDate) {
      conditions.push(lte(holidays.date, params.endDate) as SQLWrapper)
    }
  }

  // Type filter
  if (params.type) {
    conditions.push(eq(holidays.type, params.type))
  }

  // State filter
  if (params.state) {
    conditions.push(eq(holidays.state, params.state))
  }

  // Courier scope filter
  if (params.courierScope) {
    const { courierId, serviceProvider } = params.courierScope
    if (courierId) {
      conditions.push(eq(holidays.courier_id, courierId))
    } else {
      conditions.push(isNull(holidays.courier_id))
    }
    if (serviceProvider) {
      conditions.push(eq(holidays.service_provider, serviceProvider))
    } else {
      conditions.push(isNull(holidays.service_provider))
    }
  }

  // Active filter
  if (params.isActive !== undefined) {
    conditions.push(eq(holidays.is_active, params.isActive))
  }

  // Year filter (for non-recurring holidays)
  if (params.year) {
    conditions.push(
      or(
        eq(holidays.year, params.year),
        isNull(holidays.year),
        eq(holidays.is_recurring, true),
      ) as SQLWrapper,
    )
  }

  const result = await db
    .select()
    .from(holidays)
    .where(and(...conditions))

  return result
}

/**
 * Get a single holiday by ID
 */
export const getHoliday = async (id: string) => {
  const [holiday] = await db.select().from(holidays).where(eq(holidays.id, id)).limit(1)
  return holiday || null
}

/**
 * Create a new holiday
 */
export const createHoliday = async (params: CreateHolidayParams) => {
  // Validate: state holidays must have state
  if (params.type === 'state' && !params.state) {
    throw new Error('State holidays must have a state specified')
  }

  // Validate: courier holidays must have courier_id or service_provider
  if (params.type === 'courier' && !params.courierId && !params.serviceProvider) {
    throw new Error('Courier holidays must have courier_id or service_provider specified')
  }

  // Validate: national holidays should not have state or courier scope
  if (params.type === 'national' && (params.state || params.courierId || params.serviceProvider)) {
    throw new Error('National holidays cannot have state or courier scope')
  }

  const [created] = await db
    .insert(holidays)
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
    .returning()

  return created
}

/**
 * Update a holiday
 */
export const updateHoliday = async (params: UpdateHolidayParams) => {
  const { id, ...updateData } = params

  const updateValues: any = {
    updated_at: new Date(),
  }

  if (updateData.name !== undefined) updateValues.name = updateData.name.trim()
  if (updateData.date !== undefined) updateValues.date = updateData.date
  if (updateData.type !== undefined) updateValues.type = updateData.type
  if (updateData.state !== undefined) updateValues.state = updateData.state || null
  if (updateData.courierId !== undefined) updateValues.courier_id = updateData.courierId || null
  if (updateData.serviceProvider !== undefined)
    updateValues.service_provider = updateData.serviceProvider || null
  if (updateData.description !== undefined)
    updateValues.description = updateData.description || null
  if (updateData.isRecurring !== undefined) updateValues.is_recurring = updateData.isRecurring
  if (updateData.year !== undefined) updateValues.year = updateData.year || null
  if (updateData.isActive !== undefined) updateValues.is_active = updateData.isActive
  if (updateData.metadata !== undefined)
    updateValues.metadata = updateData.metadata ? JSON.stringify(updateData.metadata) : null

  // Validate constraints
  if (updateValues.type === 'state' && !updateValues.state) {
    throw new Error('State holidays must have a state specified')
  }
  if (
    updateValues.type === 'courier' &&
    !updateValues.courier_id &&
    !updateValues.service_provider
  ) {
    throw new Error('Courier holidays must have courier_id or service_provider specified')
  }
  if (
    updateValues.type === 'national' &&
    (updateValues.state || updateValues.courier_id || updateValues.service_provider)
  ) {
    throw new Error('National holidays cannot have state or courier scope')
  }

  const [updated] = await db
    .update(holidays)
    .set(updateValues)
    .where(eq(holidays.id, id))
    .returning()

  return updated
}

/**
 * Delete a holiday
 */
export const deleteHoliday = async (id: string) => {
  await db.delete(holidays).where(eq(holidays.id, id))
}

/**
 * Seed default national holidays for India
 * Uses API to fetch accurate dates, falls back to calculated dates
 */
export const seedDefaultNationalHolidays = async (year?: number) => {
  const targetYear = year || dayjs().year()

  // Try to fetch from API first, fallback to calculated dates
  const { getIndianNationalHolidays, fetchIndianHolidaysFromAPI } = await import(
    '../../utils/indianHolidays'
  )

  let holidaysToSeed
  try {
    holidaysToSeed = await fetchIndianHolidaysFromAPI(targetYear)
  } catch (error) {
    console.warn('API fetch failed, using calculated dates:', error)
    holidaysToSeed = getIndianNationalHolidays(targetYear)
  }

  const created: any[] = []
  const skipped: any[] = []

  for (const holiday of holidaysToSeed) {
    // Check if already exists (by name, type, and date for non-recurring, or name and type for recurring)
    const existingConditions: any[] = [
      eq(holidays.name, holiday.name),
      eq(holidays.type, 'national'),
    ]

    if (holiday.isRecurring) {
      existingConditions.push(eq(holidays.is_recurring, true))
    } else {
      existingConditions.push(eq(holidays.date, holiday.date))
    }

    const existing = await db
      .select()
      .from(holidays)
      .where(and(...existingConditions))
      .limit(1)

    if (existing.length === 0) {
      const [newHoliday] = await db
        .insert(holidays)
        .values({
          name: holiday.name,
          date: holiday.date,
          type: 'national',
          is_recurring: holiday.isRecurring,
          year: holiday.isRecurring ? null : targetYear,
          is_active: true,
        })
        .returning()
      created.push(newHoliday)
    } else {
      skipped.push(holiday.name)
    }
  }

  return { created, skipped, total: holidaysToSeed.length }
}

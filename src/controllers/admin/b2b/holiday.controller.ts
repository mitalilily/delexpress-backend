import { Request, Response } from 'express'
import {
  createHoliday,
  deleteHoliday,
  getHoliday,
  listHolidays,
  seedDefaultNationalHolidays,
  updateHoliday,
} from '../../../models/services/holiday.service'

const parseCourierScope = (req: Request) => {
  if (!req) {
    return { courierId: undefined, serviceProvider: undefined }
  }

  const courierIdParam = req.query?.courier_id ?? req.body?.courierId ?? req.body?.courier_id
  const serviceProviderParam =
    req.query?.service_provider ?? req.body?.serviceProvider ?? req.body?.service_provider

  return {
    courierId: courierIdParam != null && courierIdParam !== '' ? Number(courierIdParam) : undefined,
    serviceProvider:
      typeof serviceProviderParam === 'string' && serviceProviderParam.length
        ? serviceProviderParam
        : undefined,
  }
}

export const listHolidaysController = async (req: Request, res: Response) => {
  try {
    const holidays = await listHolidays({
      startDate: (req.query.start_date as string) ?? (req.query.startDate as string) ?? undefined,
      endDate: (req.query.end_date as string) ?? (req.query.endDate as string) ?? undefined,
      type: (req.query.type as any) ?? undefined,
      state: (req.query.state as string) ?? undefined,
      courierScope: parseCourierScope(req),
      isActive:
        req.query.is_active !== undefined
          ? req.query.is_active === 'true'
          : req.query.isActive !== undefined
          ? req.query.isActive === 'true'
          : undefined,
      year: req.query.year ? Number(req.query.year) : undefined,
    })

    res.json({ success: true, data: holidays })
  } catch (error: any) {
    res.status(500).json({ success: false, error: error?.message || 'Failed to fetch holidays' })
  }
}

export const getHolidayController = async (req: Request, res: Response) => {
  try {
    const holiday = await getHoliday(req.params.id)
    if (!holiday) {
      return res.status(404).json({ success: false, error: 'Holiday not found' })
    }
    res.json({ success: true, data: holiday })
  } catch (error: any) {
    res.status(500).json({ success: false, error: error?.message || 'Failed to fetch holiday' })
  }
}

export const createHolidayController = async (req: Request, res: Response) => {
  try {
    const holiday = await createHoliday({
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
      createdBy: (req as any).user?.id ?? null,
    })

    res.status(201).json({ success: true, data: holiday })
  } catch (error: any) {
    res.status(400).json({ success: false, error: error?.message || 'Failed to create holiday' })
  }
}

export const updateHolidayController = async (req: Request, res: Response) => {
  try {
    const holiday = await updateHoliday({
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
    })

    res.json({ success: true, data: holiday })
  } catch (error: any) {
    res.status(400).json({ success: false, error: error?.message || 'Failed to update holiday' })
  }
}

export const deleteHolidayController = async (req: Request, res: Response) => {
  try {
    await deleteHoliday(req.params.id)
    res.json({ success: true })
  } catch (error: any) {
    res.status(400).json({ success: false, error: error?.message || 'Failed to delete holiday' })
  }
}

export const seedNationalHolidaysController = async (req: Request, res: Response) => {
  try {
    const year = req.body.year ? Number(req.body.year) : undefined
    const result = await seedDefaultNationalHolidays(year)
    res.json({
      success: true,
      data: result,
      message: `Created ${result.created.length} new holidays, ${result.skipped.length} already existed`,
    })
  } catch (error: any) {
    res.status(400).json({ success: false, error: error?.message || 'Failed to seed holidays' })
  }
}

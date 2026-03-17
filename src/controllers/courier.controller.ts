import { Response } from 'express'
import { getUserShippingRates } from '../models/services/courierIntegration.service'
import { ShippingRateFilters } from './admin/courier.controller'

export const getShippingRatesForUserController = async (req: any, res: Response) => {
  try {
    const userId = req.user.sub
    let courierNames: string[] = []

    const rawCourierNames = req.query['courier_name[]'] ?? req.query.courier_name

    if (Array.isArray(rawCourierNames)) {
      courierNames = rawCourierNames.flat().filter(Boolean).map(String)
    } else if (typeof rawCourierNames === 'string') {
      courierNames = [rawCourierNames]
    }

    const filters: ShippingRateFilters = {
      courier_name: courierNames.length ? courierNames : undefined,
      mode: req.query.mode as string | undefined,
      min_weight: req.query.min_weight ? Number(req.query.min_weight) : undefined,
      business_type: (req.query.businessType as 'b2b' | 'b2c') || undefined,
    }

    const rates = await getUserShippingRates(userId, filters)
    res.json({ success: true, data: rates })
  } catch (err) {
    console.error('Error fetching shipping rates:', err)
    res.status(500).json({ success: false, message: 'Internal Server Error' })
  }
}

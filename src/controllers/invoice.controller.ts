import { Response } from 'express'
import { getInvoicesService } from '../models/services/invoice.service'

export const getInvoices = async (req: any, res: Response) => {
  const userId = req.user.sub
  try {
    const { page = '1', limit = '10', status, invoiceNumber, dateFrom, dateTo, awb } = req.query

    const filters = {
      status: status as string | undefined,
      userId: userId as string | undefined,
      invoiceNumber: invoiceNumber as string | undefined,
      dateFrom: dateFrom as string | undefined,
      dateTo: dateTo as string | undefined,
      awb: awb,
    }

    const result = await getInvoicesService({
      page: parseInt(page as string, 10),
      limit: parseInt(limit as string, 10),
      filters,
    })

    res.json(result)
  } catch (err: any) {
    console.error(err)
    res.status(500).json({ error: 'Failed to fetch invoices' })
  }
}

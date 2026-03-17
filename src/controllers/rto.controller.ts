import { Request, Response } from 'express'
import { adminRtoExport, adminRtoKpis, listRtoEvents, listRtoEventsAdmin } from '../models/services/rto.service'

export const getMyRtoEvents = async (req: any, res: Response) => {
  try {
    const userId = req.user?.sub
    const { orderId, page, limit, search, fromDate, toDate } = req.query as any
    const p = Number(page) || 1
    const l = Math.min(Number(limit) || 20, 200)
    const { rows, totalCount } = await listRtoEvents(userId, orderId, {
      page: p,
      limit: l,
      search: search || '',
      fromDate: fromDate || undefined,
      toDate: toDate || undefined,
    })
    res.json({ success: true, data: rows, totalCount })
  } catch (e: any) {
    res.status(500).json({ success: false, message: e.message })
  }
}

export const getAdminRtoEvents = async (req: any, res: Response) => {
  try {
    const { orderId, page, limit, search, fromDate, toDate } = req.query as any
    const p = Number(page) || 1
    const l = Math.min(Number(limit) || 20, 200)
    const { rows, totalCount } = await listRtoEventsAdmin(orderId, {
      page: p,
      limit: l,
      search: search || '',
      fromDate: fromDate || undefined,
      toDate: toDate || undefined,
    })
    res.json({ success: true, data: rows, totalCount })
  } catch (e: any) {
    res.status(500).json({ success: false, message: e.message })
  }
}

export const exportAdminRto = async (req: Request, res: Response) => {
  try {
    const { search, fromDate, toDate } = req.query as any
    const csv = await adminRtoExport({ search: search || '', fromDate, toDate })
    const ts = new Date().toISOString().split('T')[0]
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="rto_export_${ts}.csv"`)
    res.status(200).send(csv)
  } catch (e: any) {
    res.status(500).json({ success: false, message: e.message })
  }
}

export const getAdminRtoKpis = async (req: Request, res: Response) => {
  try {
    const { search, fromDate, toDate } = req.query as any
    const data = await adminRtoKpis({ search: search || '', fromDate, toDate })
    res.json({ success: true, data })
  } catch (e: any) {
    res.status(500).json({ success: false, message: e.message })
  }
}

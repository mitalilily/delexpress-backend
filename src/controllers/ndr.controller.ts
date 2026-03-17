import { and, eq, ilike, sql } from 'drizzle-orm'
import { Response } from 'express'
import { db } from '../models/client'
import { b2c_orders } from '../models/schema/b2cOrders'
import { ndr_events } from '../models/schema/ndr'
import { getNdrTimeline, listNdrEvents, listNdrEventsAdmin } from '../models/services/ndr.service'
import { buildCsv } from '../utils/csv'

export const getMyNdrEvents = async (req: any, res: Response) => {
  try {
    const userId = req.user?.sub
    const {
      orderId,
      page,
      limit,
      search,
      fromDate,
      toDate,
      courier,
      integration_type,
      attempt_count,
      status,
    } = req.query as any
    const p = Number(page) || 1
    const l = Math.min(Number(limit) || 20, 200)
    const { rows, totalCount } = await listNdrEvents(userId, orderId, {
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

export const getAdminNdrEvents = async (req: any, res: Response) => {
  try {
    const {
      orderId,
      page,
      limit,
      search,
      fromDate,
      toDate,
      courier,
      integration_type,
      attempt_count,
      status,
    } = req.query as any
    const p = Number(page) || 1
    const l = Math.min(Number(limit) || 20, 200)
    const { rows, totalCount } = await listNdrEventsAdmin(orderId, {
      page: p,
      limit: l,
      search: search || '',
      fromDate: fromDate || undefined,
      toDate: toDate || undefined,
      courier: courier || undefined,
      integration_type: integration_type || undefined,
      attempt_count: attempt_count ? Number(attempt_count) : undefined,
      status: status || undefined,
    })
    res.json({ success: true, data: rows, totalCount })
  } catch (e: any) {
    res.status(500).json({ success: false, message: e.message })
  }
}

export const getAdminNdrTimeline = async (req: any, res: Response) => {
  try {
    const { awb, orderId } = req.query as { awb?: string; orderId?: string }
    if (!awb && !orderId) {
      return res.status(400).json({ success: false, message: 'Provide awb or orderId' })
    }
    const data = await getNdrTimeline({ awb, orderId })
    return res.json({ success: true, data })
  } catch (e: any) {
    return res.status(500).json({ success: false, message: e.message })
  }
}

export const getMyNdrTimeline = async (req: any, res: Response) => {
  try {
    const userId = req.user?.sub
    const { awb, orderId } = req.query as { awb?: string; orderId?: string }
    if (!awb && !orderId) {
      return res.status(400).json({ success: false, message: 'Provide awb or orderId' })
    }

    let resolvedOrderId: string | undefined

    if (orderId) {
      const [order] = await db
        .select({ id: b2c_orders.id })
        .from(b2c_orders)
        .where(and(eq(b2c_orders.id, orderId), eq(b2c_orders.user_id, userId)))
        .limit(1)
      if (!order) {
        return res.status(404).json({ success: false, message: 'Order not found' })
      }
      resolvedOrderId = order.id
    } else if (awb) {
      const [order] = await db
        .select({ id: b2c_orders.id })
        .from(b2c_orders)
        .where(and(eq(b2c_orders.awb_number, awb), eq(b2c_orders.user_id, userId)))
        .limit(1)
      if (!order) {
        return res.status(404).json({ success: false, message: 'Order not found' })
      }
      resolvedOrderId = order.id
    }

    const data = await getNdrTimeline({ orderId: resolvedOrderId })
    return res.json({ success: true, data })
  } catch (e: any) {
    return res.status(500).json({ success: false, message: e.message })
  }
}

export const exportAdminNdrCsv = async (req: any, res: Response) => {
  try {
    const { search, fromDate, toDate, courier, integration_type, attempt_count, status } =
      req.query as any

    const where = and(
      search
        ? and(sql`true`, sql`${ndr_events.awb_number} ILIKE ${'%' + search + '%'}`)
        : sql`true`,
      status ? ilike(ndr_events.status, `%${status}%`) : sql`true`,
    )

    const rows = await db
      .select({
        awb: ndr_events.awb_number,
        order_id: ndr_events.order_id,
        status: ndr_events.status,
        reason: ndr_events.reason,
        remarks: ndr_events.remarks,
        attempt_no: ndr_events.attempt_no,
        created_at: ndr_events.created_at,
        courier_partner: b2c_orders.courier_partner,
        integration_type: b2c_orders.integration_type,
      })
      .from(ndr_events)
      .leftJoin(b2c_orders, eq(ndr_events.order_id, b2c_orders.id))
      .where(
        and(
          where,
          courier ? ilike(b2c_orders.courier_partner, `%${courier}%`) : sql`true`,
          integration_type
            ? ilike(b2c_orders.integration_type, `%${integration_type}%`)
            : sql`true`,
          attempt_count ? ilike(ndr_events.attempt_no, `%${String(attempt_count)}%`) : sql`true`,
          fromDate ? sql`${ndr_events.created_at} >= ${new Date(fromDate)}` : sql`true`,
          toDate ? sql`${ndr_events.created_at} <= ${new Date(toDate)}` : sql`true`,
        ),
      )

    const headers = [
      'AWB',
      'OrderId',
      'Courier',
      'Integration',
      'Status',
      'Reason',
      'Remarks',
      'AttemptNo',
      'CreatedAt',
    ]
    const csv = buildCsv(
      headers,
      rows.map((r) => [
        r.awb,
        r.order_id,
        r.courier_partner,
        r.integration_type,
        r.status,
        r.reason,
        r.remarks,
        r.attempt_no,
        (r.created_at as any)?.toISOString?.(),
      ]),
    )
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="ndr_export.csv"`)
    return res.status(200).send(csv)
  } catch (e: any) {
    return res.status(500).json({ success: false, message: e.message })
  }
}

export const getAdminNdrKpis = async (req: any, res: Response) => {
  try {
    // Simple KPIs: total NDRs, by status, by courier, unique orders affected
    const [{ total }] = (await db.select({ total: sql<number>`count(*)` }).from(ndr_events)) as any

    const byStatus = (await db
      .select({ status: ndr_events.status, count: sql<number>`count(*)` })
      .from(ndr_events)
      .groupBy(ndr_events.status)) as any

    const byCourier = (await db
      .select({ courier: b2c_orders.courier_partner, count: sql<number>`count(*)` })
      .from(ndr_events)
      .leftJoin(b2c_orders, eq(ndr_events.order_id, b2c_orders.id))
      .groupBy(b2c_orders.courier_partner)) as any

    const [{ ordersAffected }] = (await db
      .select({ ordersAffected: sql<number>`count(distinct ${ndr_events.order_id})` })
      .from(ndr_events)) as any

    return res
      .status(200)
      .json({ success: true, data: { total, byStatus, byCourier, ordersAffected } })
  } catch (e: any) {
    return res.status(500).json({ success: false, message: e.message })
  }
}

import { and, asc, eq, gte, inArray, lte } from 'drizzle-orm'
import { Response } from 'express'
import { db } from '../models/client'
import { b2b_orders } from '../models/schema/b2bOrders'
import { b2c_orders } from '../models/schema/b2cOrders'
import { codRemittances } from '../models/schema/codRemittance'
import { ndr_events } from '../models/schema/ndr'
import { buildCsv } from '../utils/csv'

type SectionKey = 'orders' | 'shipment' | 'ndr'

const FIELD_LABELS: Record<string, string> = {
  order_number: 'order_number',
  order_date: 'order_date',
  order_amount: 'order_amount',
  order_type: 'order_type',
  buyer_name: 'buyer_name',
  buyer_phone: 'buyer_phone',
  buyer_email: 'buyer_email',
  address: 'address',
  city: 'city',
  state: 'state',
  pincode: 'pincode',
  weight: 'weight',
  length: 'length',
  height: 'height',
  breadth: 'breadth',
  order_status: 'order_status',
  freight_charges: 'freight_charges',
  discount: 'discount',
  products: 'products',
  shipment_date: 'shipment_date',
  awb_number: 'awb_number',
  shipment_status: 'shipment_status',
  remittance_id: 'remittance_id',
  pickup_time: 'pickup_time',
  delivered_time: 'delivered_time',
  charged_weight: 'charged_weight',
  zone: 'zone',
  last_status_updated: 'last_status_updated',
  ndr_attempts_info: 'ndr_attempts_info',
}

const DEFAULT_FIELDS = Object.keys(FIELD_LABELS)

const parseDate = (value?: string) => {
  if (!value) return null
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

const endOfDay = (d: Date) => {
  const out = new Date(d)
  out.setHours(23, 59, 59, 999)
  return out
}

const toNumber = (v: unknown) => {
  const n = Number(v ?? 0)
  return Number.isFinite(n) ? n : 0
}

const formatProducts = (products: unknown) => {
  if (!Array.isArray(products) || products.length === 0) return ''
  return products
    .map((p: any) => {
      const name = p?.name || p?.productName || p?.box_name || 'Item'
      const qty = p?.qty ?? p?.quantity ?? 1
      const price = toNumber(p?.price)
      return `${name} x${qty} (Rs. ${price.toFixed(2)})`
    })
    .join(' | ')
}

const stringifyDate = (v: unknown) => {
  if (!v) return ''
  const d = new Date(v as any)
  if (Number.isNaN(d.getTime())) return String(v)
  return d.toISOString()
}

const getNdrAttemptSummary = (events: Array<{ attempt_no: string | null; status: string; reason: string | null }>) => {
  if (!events.length) return ''
  const latest = events[events.length - 1]
  const attempts = Array.from(
    new Set(events.map((e) => e.attempt_no).filter((x): x is string => !!x && x.trim() !== '')),
  )
  const attemptsText = attempts.length ? attempts.join('/') : String(events.length)
  return `Attempts: ${attemptsText}; Latest: ${latest.status}${latest.reason ? ` (${latest.reason})` : ''}`
}

export const exportCustomReportCsvController = async (req: any, res: Response) => {
  try {
    const userId = req.user?.sub
    if (!userId) return res.status(401).json({ success: false, message: 'Unauthorized' })

    const {
      fromDate,
      toDate: toDateStr,
      selectedFields,
    }: {
      fromDate?: string
      toDate?: string
      sections?: SectionKey[]
      selectedFields?: string[]
    } = req.body || {}

    const from = parseDate(fromDate)
    const to = parseDate(toDateStr)

    if (!from || !to) {
      return res.status(400).json({ success: false, message: 'Valid fromDate and toDate are required' })
    }

    const fields =
      Array.isArray(selectedFields) && selectedFields.length
        ? selectedFields.filter((f) => FIELD_LABELS[f])
        : DEFAULT_FIELDS

    if (!fields.length) {
      return res.status(400).json({ success: false, message: 'At least one field must be selected' })
    }

    const dateClauseB2C = and(
      eq(b2c_orders.user_id, userId),
      gte(b2c_orders.created_at, from),
      lte(b2c_orders.created_at, endOfDay(to)),
    )
    const dateClauseB2B = and(
      eq(b2b_orders.user_id, userId),
      gte(b2b_orders.created_at, from),
      lte(b2b_orders.created_at, endOfDay(to)),
    )

    const [b2cRows, b2bRows] = await Promise.all([
      db.select().from(b2c_orders).where(dateClauseB2C).orderBy(asc(b2c_orders.created_at)),
      db.select().from(b2b_orders).where(dateClauseB2B).orderBy(asc(b2b_orders.created_at)),
    ])

    const b2cIds = b2cRows.map((r) => r.id)
    const allOrderRefs = [
      ...b2cRows.map((r) => ({ orderId: r.id, orderType: 'b2c' as const })),
      ...b2bRows.map((r) => ({ orderId: r.id, orderType: 'b2b' as const })),
    ]

    const [ndrRows, remRows] = await Promise.all([
      b2cIds.length
        ? db
            .select({
              order_id: ndr_events.order_id,
              attempt_no: ndr_events.attempt_no,
              status: ndr_events.status,
              reason: ndr_events.reason,
              created_at: ndr_events.created_at,
            })
            .from(ndr_events)
            .where(inArray(ndr_events.order_id, b2cIds))
            .orderBy(asc(ndr_events.created_at))
        : Promise.resolve([] as any[]),
      allOrderRefs.length
        ? db
            .select({
              id: codRemittances.id,
              orderId: codRemittances.orderId,
              orderType: codRemittances.orderType,
            })
            .from(codRemittances)
            .where(
              and(
                eq(codRemittances.userId, userId),
                inArray(codRemittances.orderId, allOrderRefs.map((r) => r.orderId)),
              ),
            )
        : Promise.resolve([] as any[]),
    ])

    const ndrMap = new Map<string, any[]>()
    for (const ndr of ndrRows) {
      const arr = ndrMap.get(ndr.order_id) || []
      arr.push(ndr)
      ndrMap.set(ndr.order_id, arr)
    }

    const remMap = new Map<string, string>()
    for (const rem of remRows) {
      remMap.set(`${rem.orderType}:${rem.orderId}`, rem.id)
    }

    const unifiedRows = [
      ...b2cRows.map((o) => ({ ...o, _type: 'b2c' as const })),
      ...b2bRows.map((o) => ({ ...o, _type: 'b2b' as const })),
    ].sort((a, b) => new Date(a.created_at as any).getTime() - new Date(b.created_at as any).getTime())

    const headers = fields.map((f) => FIELD_LABELS[f])
    const rows = unifiedRows.map((order: any) => {
      const ndrInfo = order._type === 'b2c' ? getNdrAttemptSummary(ndrMap.get(order.id) || []) : ''
      const remittanceId = remMap.get(`${order._type}:${order.id}`) || ''
      const deliveredTime =
        String(order.order_status || '').toLowerCase() === 'delivered'
          ? stringifyDate(order.updated_at || order.created_at)
          : ''

      const pickupTimeFromDetails = order?.pickup_details?.pickup_time || order?.pickup_details?.pickupTime
      const shipmentDate = stringifyDate(order.created_at)
      const rowMap: Record<string, string | number> = {
        order_number: order.order_number || '',
        order_date: order.order_date || '',
        order_amount: toNumber(order.order_amount).toFixed(2),
        order_type: order.order_type || '',
        buyer_name: order.buyer_name || '',
        buyer_phone: order.buyer_phone || '',
        buyer_email: order.buyer_email || '',
        address: order.address || '',
        city: order.city || '',
        state: order.state || '',
        pincode: order.pincode || '',
        weight: toNumber(order.weight).toFixed(3),
        length: toNumber(order.length).toFixed(2),
        height: toNumber(order.height).toFixed(2),
        breadth: toNumber(order.breadth).toFixed(2),
        order_status: order.order_status || '',
        freight_charges: toNumber(order.freight_charges).toFixed(2),
        discount: toNumber(order.discount).toFixed(2),
        products: formatProducts(order.products),
        shipment_date: shipmentDate,
        awb_number: order.awb_number || '',
        shipment_status: order.order_status || '',
        remittance_id: remittanceId,
        pickup_time: pickupTimeFromDetails || '',
        delivered_time: deliveredTime,
        charged_weight: toNumber(order.charged_weight || order.weight).toFixed(3),
        zone: order.delivery_location || '',
        last_status_updated: stringifyDate(order.updated_at || order.created_at),
        ndr_attempts_info: ndrInfo,
      }

      return fields.map((f) => rowMap[f] ?? '')
    })

    const csv = buildCsv(headers, rows)
    const filename = `custom_report_${fromDate}_to_${toDateStr}.csv`
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`)
    return res.status(200).send(csv)
  } catch (error: any) {
    console.error('[exportCustomReportCsvController] Error:', error)
    return res.status(500).json({ success: false, message: error?.message || 'Failed to export report' })
  }
}

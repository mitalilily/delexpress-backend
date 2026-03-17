import { and, desc, eq, gte, ilike, lte, or, sql } from 'drizzle-orm'
import { db } from '../client'
import { b2c_orders } from '../schema/b2cOrders'
import { userProfiles } from '../schema/userProfile'
import { ndr_events } from '../schema/ndr'
import { tracking_events } from '../schema/trackingEvents'
import { sendWebhookEvent } from '../../services/webhookDelivery.service'

export async function recordNdrEvent(params: {
  orderId: string
  userId: string
  awbNumber?: string | null
  status: string
  reason?: string | null
  remarks?: string | null
  attemptNo?: string | null
  payload?: any
}) {
  const { orderId, userId, awbNumber, status, reason, remarks, attemptNo, payload } = params

  const [inserted] = await db
    .insert(ndr_events)
    .values({
      order_id: orderId,
      user_id: userId,
      awb_number: awbNumber || null,
      status,
      reason: reason || null,
      remarks: remarks || null,
      attempt_no: attemptNo || null,
      payload: payload || null,
    })
    .returning()

  // 🔔 Send webhook event for NDR
  sendWebhookEvent(userId, 'order.ndr', {
    order_id: orderId,
    awb_number: awbNumber,
    status,
    reason,
    remarks,
    attempt_no: attemptNo,
    created_at: inserted.created_at?.toISOString() || new Date().toISOString(),
  }).catch((err) => {
    console.error('Failed to send NDR webhook event:', err)
    // Don't fail the main flow if webhook fails
  })

  return inserted
}

export async function listNdrEvents(
  userId: string,
  orderId?: string,
  params?: { page?: number; limit?: number; search?: string; fromDate?: string; toDate?: string },
) {
  const { page = 1, limit = 20, search = '', fromDate, toDate } = params || {}
  const whereBase = orderId
    ? and(eq(ndr_events.user_id, userId), eq(ndr_events.order_id, orderId))
    : eq(ndr_events.user_id, userId)

  const searchWhere = search
    ? or(
        ilike(ndr_events.awb_number, `%${search}%`),
        // order_id is UUID → cast to text for ILIKE
        sql`(${ndr_events.order_id}::text) ILIKE ${`%${search}%`}`,
        ilike(ndr_events.reason, `%${search}%`),
        ilike(ndr_events.remarks, `%${search}%`),
      )
    : undefined

  const parsedFrom = fromDate ? new Date(fromDate) : undefined
  const parsedTo = toDate ? new Date(toDate) : undefined
  const hasValidFrom = parsedFrom && !isNaN(parsedFrom.getTime())
  const hasValidTo = parsedTo && !isNaN(parsedTo.getTime())
  const dateWhere = hasValidFrom || hasValidTo
    ? and(
        hasValidFrom ? gte(ndr_events.created_at, parsedFrom as Date) : sql`true`,
        hasValidTo ? lte(ndr_events.created_at, parsedTo as Date) : sql`true`,
      )
    : undefined

  const where =
    searchWhere || dateWhere
      ? and(whereBase, searchWhere || sql`true`, dateWhere || sql`true`)
      : whereBase

  const offset = (page - 1) * limit

  const rows = await db
    .select({
      id: ndr_events.id,
      awb_number: ndr_events.awb_number,
      order_id: ndr_events.order_id,
      status: ndr_events.status,
      reason: ndr_events.reason,
      remarks: ndr_events.remarks,
      attempt_no: ndr_events.attempt_no,
      created_at: ndr_events.created_at,
      last_event_time: ndr_events.updated_at,
      courier_partner: b2c_orders.courier_partner,
      integration_type: b2c_orders.integration_type,
    })
    .from(ndr_events)
    .leftJoin(b2c_orders, eq(ndr_events.order_id, b2c_orders.id))
    .where(where)
    .orderBy(desc(ndr_events.created_at))
    .limit(limit)
    .offset(offset)

  const [{ count }] = (await db
    .select({ count: sql<number>`count(*)` })
    .from(ndr_events)
    .leftJoin(b2c_orders, eq(ndr_events.order_id, b2c_orders.id))
    .where(where)) as unknown as Array<{ count: number }>

  return { rows, totalCount: Number(count) || 0 }
}

export async function listNdrEventsAdmin(
  orderId?: string,
  params?: {
    page?: number
    limit?: number
    search?: string
    fromDate?: string
    toDate?: string
    courier?: string
    integration_type?: string
    attempt_count?: number
    status?: string
  },
) {
  const {
    page = 1,
    limit = 20,
    search = '',
    fromDate,
    toDate,
    courier,
    integration_type,
    attempt_count,
    status,
  } = params || {}

  const base = orderId ? eq(ndr_events.order_id, orderId) : sql`true`

  const searchWhere = search
    ? or(
        ilike(ndr_events.awb_number, `%${search}%`),
        // order_id is UUID → cast to text for ILIKE
        sql`(${ndr_events.order_id}::text) ILIKE ${`%${search}%`}`,
        ilike(ndr_events.reason, `%${search}%`),
        ilike(ndr_events.remarks, `%${search}%`),
      )
    : undefined

  const parsedFromA = fromDate ? new Date(fromDate) : undefined
  const parsedToA = toDate ? new Date(toDate) : undefined
  const hasValidFromA = parsedFromA && !isNaN(parsedFromA.getTime())
  const hasValidToA = parsedToA && !isNaN(parsedToA.getTime())
  const dateWhere = hasValidFromA || hasValidToA
    ? and(
        hasValidFromA ? gte(ndr_events.created_at, parsedFromA as Date) : sql`true`,
        hasValidToA ? lte(ndr_events.created_at, parsedToA as Date) : sql`true`,
      )
    : undefined

  const statusWhere = status ? ilike(ndr_events.status, `%${status}%`) : undefined

  // Build join with orders to filter by courier/integration_type and to project columns
  const whereFinal = and(
    base,
    searchWhere || sql`true`,
    dateWhere || sql`true`,
    statusWhere || sql`true`,
  )

  const offset = (page - 1) * limit

  const rows = await db
    .select({
      id: ndr_events.id,
      awb_number: ndr_events.awb_number,
      order_id: ndr_events.order_id,
      status: ndr_events.status,
      reason: ndr_events.reason,
      remarks: ndr_events.remarks,
      attempt_no: ndr_events.attempt_no,
      created_at: ndr_events.created_at,
      courier_partner: b2c_orders.courier_partner,
      integration_type: b2c_orders.integration_type,
      merchant_id: b2c_orders.user_id,
      merchant_name: sql<string>`(${userProfiles.companyInfo} ->> 'companyName')`.as('merchant_name'),
      last_event_time: ndr_events.updated_at,
    })
    .from(ndr_events)
    .leftJoin(b2c_orders, eq(ndr_events.order_id, b2c_orders.id))
    .leftJoin(userProfiles, eq(userProfiles.userId, b2c_orders.user_id))
    .where(
      and(
        whereFinal,
        courier ? ilike(b2c_orders.courier_partner, `%${courier}%`) : sql`true`,
        integration_type ? ilike(b2c_orders.integration_type, `%${integration_type}%`) : sql`true`,
        attempt_count ? eq(ndr_events.attempt_no, String(attempt_count)) : sql`true`,
      ),
    )
    .orderBy(desc(ndr_events.created_at))
    .limit(limit)
    .offset(offset)

  const [{ count }] = (await db
    .select({ count: sql<number>`count(*)` })
    .from(ndr_events)
    .leftJoin(b2c_orders, eq(ndr_events.order_id, b2c_orders.id))
    .leftJoin(userProfiles, eq(userProfiles.userId, b2c_orders.user_id))
    .where(
      and(
        whereFinal,
        courier ? ilike(b2c_orders.courier_partner, `%${courier}%`) : sql`true`,
        integration_type ? ilike(b2c_orders.integration_type, `%${integration_type}%`) : sql`true`,
        attempt_count ? ilike(ndr_events.attempt_no, `%${String(attempt_count)}%`) : sql`true`,
      ),
    )) as unknown as Array<{ count: number }>

  return { rows, totalCount: Number(count) || 0 }
}

export async function getNdrTimeline(params: { awb?: string; orderId?: string }) {
  const { awb, orderId } = params

  let orderRow: { id: string; awb_number: string | null } | null = null

  if (orderId) {
    const [o] = await db
      .select({ id: b2c_orders.id, awb_number: b2c_orders.awb_number })
      .from(b2c_orders)
      .where(eq(b2c_orders.id, orderId))
      .limit(1)
    if (o) orderRow = o
  } else if (awb) {
    const [o] = await db
      .select({ id: b2c_orders.id, awb_number: b2c_orders.awb_number })
      .from(b2c_orders)
      .where(eq(b2c_orders.awb_number, awb))
      .limit(1)
    if (o) orderRow = o
  }

  const resolvedOrderId = orderRow?.id
  const resolvedAwb = orderRow?.awb_number || awb

  // NDR events timeline
  const ndr = await db
    .select({
      type: sql<string>`'ndr'`,
      at: ndr_events.created_at,
      status: ndr_events.status,
      remarks: ndr_events.remarks,
      reason: ndr_events.reason,
      attempt_no: ndr_events.attempt_no,
      raw: ndr_events.payload,
    })
    .from(ndr_events)
    .where(resolvedOrderId ? eq(ndr_events.order_id, resolvedOrderId) : sql`false`)

  // Tracking events timeline (optional)
  const tracking = resolvedAwb
    ? await db
        .select({
          type: sql<string>`'tracking'`,
          at: tracking_events.created_at,
          status: tracking_events.status_code,
          remarks: tracking_events.status_text,
          reason: sql<string>`null`,
          attempt_no: sql<string>`null`,
          raw: tracking_events.raw,
        })
        .from(tracking_events)
        .where(eq(tracking_events.awb_number, resolvedAwb))
    : []

  const combined = [...ndr, ...tracking].sort(
    (a, b) => new Date(a.at as any).getTime() - new Date(b.at as any).getTime(),
  )

  return { orderId: resolvedOrderId, awb: resolvedAwb, events: combined }
}

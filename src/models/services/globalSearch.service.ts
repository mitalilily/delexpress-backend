import { and, eq, ilike, or, sql } from 'drizzle-orm'
import { db } from '../client'
import { b2b_orders } from '../schema/b2bOrders'
import { b2c_orders } from '../schema/b2cOrders'
import { invoices } from '../schema/invoices'
import { ndr_events } from '../schema/ndr'
import { rto_events } from '../schema/rto'
import { weight_discrepancies } from '../schema/weightDiscrepancies'

export interface GlobalSearchResult {
  type: 'order' | 'invoice' | 'ndr' | 'rto' | 'weight_discrepancy'
  id: string
  title: string
  subtitle?: string
  link: string
  metadata?: Record<string, any>
}

export const globalSearch = async (
  userId: string,
  query: string,
  limit = 10,
): Promise<GlobalSearchResult[]> => {
  const searchTerm = `%${query.trim()}%`
  const results: GlobalSearchResult[] = []

  // Search in B2C Orders
  const b2cOrders = await db
    .select({
      id: b2c_orders.id,
      order_number: b2c_orders.order_number,
      awb_number: b2c_orders.awb_number,
      buyer_name: b2c_orders.buyer_name,
      city: b2c_orders.city,
      state: b2c_orders.state,
      order_status: b2c_orders.order_status,
    })
    .from(b2c_orders)
    .where(
      and(
        eq(b2c_orders.user_id, userId),
        or(
          ilike(b2c_orders.order_number, searchTerm),
          sql`COALESCE(CAST(${b2c_orders.awb_number} AS TEXT), '') ILIKE ${searchTerm}`,
          sql`COALESCE(CAST(${b2c_orders.order_id} AS TEXT), '') ILIKE ${searchTerm}`,
          ilike(b2c_orders.buyer_name, searchTerm),
        ),
      ),
    )
    .limit(limit)

  for (const order of b2cOrders) {
    results.push({
      type: 'order',
      id: order.id,
      title: order.order_number,
      subtitle: order.awb_number
        ? `${order.buyer_name} • ${order.city}, ${order.state} • ${order.awb_number}`
        : `${order.buyer_name} • ${order.city}, ${order.state}`,
      link: `/orders/list?search=${encodeURIComponent(order.order_number)}`,
      metadata: {
        awb: order.awb_number,
        status: order.order_status,
        type: 'b2c',
      },
    })
  }

  // Search in B2B Orders
  const b2bOrders = await db
    .select({
      id: b2b_orders.id,
      order_number: b2b_orders.order_number,
      awb_number: b2b_orders.awb_number,
      buyer_name: b2b_orders.buyer_name,
      city: b2b_orders.city,
      state: b2b_orders.state,
      order_status: b2b_orders.order_status,
    })
    .from(b2b_orders)
    .where(
      and(
        eq(b2b_orders.user_id, userId),
        or(
          ilike(b2b_orders.order_number, searchTerm),
          sql`COALESCE(CAST(${b2b_orders.awb_number} AS TEXT), '') ILIKE ${searchTerm}`,
          sql`COALESCE(CAST(${b2b_orders.order_id} AS TEXT), '') ILIKE ${searchTerm}`,
          ilike(b2b_orders.buyer_name, searchTerm),
        ),
      ),
    )
    .limit(limit)

  for (const order of b2bOrders) {
    results.push({
      type: 'order',
      id: order.id,
      title: order.order_number,
      subtitle: order.awb_number
        ? `${order.buyer_name} • ${order.city}, ${order.state} • ${order.awb_number}`
        : `${order.buyer_name} • ${order.city}, ${order.state}`,
      link: `/orders/list?search=${encodeURIComponent(order.order_number)}`,
      metadata: {
        awb: order.awb_number,
        status: order.order_status,
        type: 'b2b',
      },
    })
  }

  // Search in Invoices
  const invoiceResults = await db
    .select({
      id: invoices.id,
      invoice_number: invoices.invoiceNumber,
      status: invoices.status,
      net_payable_amount: invoices.netPayableAmount,
    })
    .from(invoices)
    .where(and(eq(invoices.userId, userId), ilike(invoices.invoiceNumber, searchTerm)))
    .limit(5)

  for (const invoice of invoiceResults) {
    results.push({
      type: 'invoice',
      id: String(invoice.id),
      title: invoice.invoice_number,
      subtitle: `Status: ${invoice.status} • Amount: ₹${Number(
        invoice.net_payable_amount,
      ).toLocaleString('en-IN')}`,
      link: `/billing/invoice_management?search=${encodeURIComponent(invoice.invoice_number)}`,
      metadata: {
        status: invoice.status,
        amount: invoice.net_payable_amount,
      },
    })
  }

  // Search in NDR Events (by AWB or order number)
  const ndrResults = await db
    .select({
      id: ndr_events.id,
      order_id: ndr_events.order_id,
      awb_number: ndr_events.awb_number,
      status: ndr_events.status,
      reason: ndr_events.reason,
    })
    .from(ndr_events)
    .where(
      and(
        eq(ndr_events.user_id, userId),
        or(
          sql`COALESCE(CAST(${ndr_events.awb_number} AS TEXT), '') ILIKE ${searchTerm}`,
          sql`COALESCE(CAST(${ndr_events.order_id} AS TEXT), '') ILIKE ${searchTerm}`,
        ),
      ),
    )
    .limit(5)

  for (const ndr of ndrResults) {
    results.push({
      type: 'ndr',
      id: ndr.id,
      title: ndr.awb_number || `NDR-${ndr.id.slice(0, 8)}`,
      subtitle: `NDR • ${ndr.status} • ${ndr.reason || 'No reason'}`,
      link: `/ops/ndr?search=${encodeURIComponent(ndr.awb_number || ndr.order_id)}`,
      metadata: {
        status: ndr.status,
        reason: ndr.reason,
      },
    })
  }

  // Search in RTO Events (by AWB or order number)
  const rtoResults = await db
    .select({
      id: rto_events.id,
      order_id: rto_events.order_id,
      awb_number: rto_events.awb_number,
      status: rto_events.status,
      reason: rto_events.reason,
    })
    .from(rto_events)
    .where(
      and(
        eq(rto_events.user_id, userId),
        or(
          sql`COALESCE(CAST(${rto_events.awb_number} AS TEXT), '') ILIKE ${searchTerm}`,
          sql`COALESCE(CAST(${rto_events.order_id} AS TEXT), '') ILIKE ${searchTerm}`,
        ),
      ),
    )
    .limit(5)

  for (const rto of rtoResults) {
    results.push({
      type: 'rto',
      id: rto.id,
      title: rto.awb_number || `RTO-${rto.id.slice(0, 8)}`,
      subtitle: `RTO • ${rto.status} • ${rto.reason || 'No reason'}`,
      link: `/ops/rto?search=${encodeURIComponent(rto.awb_number || rto.order_id)}`,
      metadata: {
        status: rto.status,
        reason: rto.reason,
      },
    })
  }

  // Search in Weight Discrepancies (by AWB or order number)
  const weightResults = await db
    .select({
      id: weight_discrepancies.id,
      order_number: weight_discrepancies.order_number,
      awb_number: weight_discrepancies.awb_number,
      status: weight_discrepancies.status,
    })
    .from(weight_discrepancies)
    .where(
      and(
        eq(weight_discrepancies.user_id, userId),
        or(
          ilike(weight_discrepancies.order_number, searchTerm),
          sql`COALESCE(CAST(${weight_discrepancies.awb_number} AS TEXT), '') ILIKE ${searchTerm}`,
        ),
      ),
    )
    .limit(5)

  for (const weight of weightResults) {
    results.push({
      type: 'weight_discrepancy',
      id: weight.id,
      title: weight.order_number,
      subtitle: weight.awb_number
        ? `Weight Discrepancy • ${weight.status} • AWB: ${weight.awb_number}`
        : `Weight Discrepancy • ${weight.status}`,
      link: `/reconciliation/weight?search=${encodeURIComponent(weight.order_number)}`,
      metadata: {
        status: weight.status,
        awb: weight.awb_number,
      },
    })
  }

  // Sort by relevance (exact matches first, then partial matches)
  return results
    .sort((a, b) => {
      const aExact = a.title.toLowerCase().includes(query.toLowerCase())
      const bExact = b.title.toLowerCase().includes(query.toLowerCase())
      if (aExact && !bExact) return -1
      if (!aExact && bExact) return 1
      return 0
    })
    .slice(0, limit)
}

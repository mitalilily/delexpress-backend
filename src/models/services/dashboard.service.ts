// services/pickupService.ts
import { and, count, desc, eq, sql } from 'drizzle-orm'
import { db } from '../client'
import { b2b_orders } from '../schema/b2bOrders'
import { b2c_orders } from '../schema/b2cOrders'
import { codRemittances } from '../schema/codRemittance'
import { invoices } from '../schema/invoices'
import { ndr_events } from '../schema/ndr'
import { rto_events } from '../schema/rto'
import { supportTickets } from '../schema/supportTickets'
import { wallets, walletTransactions } from '../schema/wallet'
import { weight_discrepancies } from '../schema/weightDiscrepancies'

export const getIncomingPickups = async (userId: string) => {
  // 🔹 Fetch top 3 pickups from B2C
  const b2cPickups = await db
    .select({
      id: b2c_orders.id,
      awb_number: b2c_orders.awb_number,
      courier_partner: b2c_orders.courier_partner,
      order_number: b2c_orders.order_number,
      pickup_details: b2c_orders.pickup_details,
      created_at: b2c_orders.created_at,
    })
    .from(b2c_orders)
    .where(and(eq(b2c_orders.user_id, userId), eq(b2c_orders.order_status, 'pickup_initiated')))
    .orderBy(b2c_orders.created_at) // oldest first
    .limit(3)

  // 🔹 Fetch top 3 pickups from B2B
  const b2bPickups = await db
    .select({
      id: b2b_orders.id,
      awb_number: b2b_orders.awb_number,
      courier_partner: b2b_orders.courier_partner,
      order_number: b2b_orders.order_number,
      pickup_details: b2b_orders.pickup_details,
      created_at: b2b_orders.created_at,
    })
    .from(b2b_orders)
    .where(and(eq(b2b_orders.user_id, userId), eq(b2b_orders.order_status, 'pickup_initiated')))
    .orderBy(b2b_orders.created_at)
    .limit(3)

  // Merge and sort by created_at
  const allPickups = [...b2cPickups, ...b2bPickups].sort(
    (a, b) => (a.created_at?.getTime() ?? 0) - (b.created_at?.getTime() ?? 0),
  )

  // Return only top 3 overall
  return allPickups.slice(0, 3)
}

export const getPendingActions = async (userId: string) => {
  // Count unique orders that have NDR/RTO events.
  // Event statuses vary (for example `address_issue`, `undelivered`, `rto_in_transit`),
  // so restricting to a single literal undercounts what the ops screens show.
  const ndrCount = await db
    .select({ count: sql<number>`COUNT(DISTINCT ${ndr_events.order_id})` })
    .from(ndr_events)
    .where(eq(ndr_events.user_id, userId))

  const rtoCount = await db
    .select({ count: sql<number>`COUNT(DISTINCT ${rto_events.order_id})` })
    .from(rto_events)
    .where(eq(rto_events.user_id, userId))

  // Count pending weight discrepancies
  const weightCount = await db
    .select({ count: count() })
    .from(weight_discrepancies)
    .where(and(eq(weight_discrepancies.user_id, userId), eq(weight_discrepancies.status, 'pending')))

  return {
    ndrCount: Number(ndrCount[0]?.count || 0),
    rtoCount: Number(rtoCount[0]?.count || 0),
    weightDiscrepancyCount: Number(weightCount[0]?.count || 0),
  }
}

export const getInvoiceStatus = async (userId: string) => {
  const statusCounts = await db
    .select({
      status: invoices.status,
      count: count(),
      totalAmount: sql<number>`COALESCE(SUM(${invoices.netPayableAmount}::numeric), 0)`,
    })
    .from(invoices)
    .where(eq(invoices.userId, userId))
    .groupBy(invoices.status)

  const statusSummary: Record<string, { count: number; totalAmount: number }> = {
    pending: { count: 0, totalAmount: 0 },
    paid: { count: 0, totalAmount: 0 },
    overdue: { count: 0, totalAmount: 0 },
  }

  for (const row of statusCounts) {
    if (row.status) {
      statusSummary[row.status] = {
        count: Number(row.count),
        totalAmount: Number(row.totalAmount),
      }
    }
  }

  return statusSummary
}

export const getTopDestinations = async (userId: string, limit = 10) => {
  // Get top cities from B2C orders
  const b2cCities = await db
    .select({
      city: b2c_orders.city,
      state: b2c_orders.state,
      count: count(),
    })
    .from(b2c_orders)
    .where(eq(b2c_orders.user_id, userId))
    .groupBy(b2c_orders.city, b2c_orders.state)
    .orderBy(sql`count(*) DESC`)

  // Get top cities from B2B orders
  const b2bCities = await db
    .select({
      city: b2b_orders.city,
      state: b2b_orders.state,
      count: count(),
    })
    .from(b2b_orders)
    .where(eq(b2b_orders.user_id, userId))
    .groupBy(b2b_orders.city, b2b_orders.state)
    .orderBy(sql`count(*) DESC`)

  // Merge and aggregate by city+state
  const cityMap = new Map<string, { city: string; state: string; count: number }>()

  for (const row of b2cCities) {
    const key = `${row.city}-${row.state}`
    const existing = cityMap.get(key)
    if (existing) {
      existing.count += Number(row.count)
    } else {
      cityMap.set(key, { city: row.city, state: row.state, count: Number(row.count) })
    }
  }

  for (const row of b2bCities) {
    const key = `${row.city}-${row.state}`
    const existing = cityMap.get(key)
    if (existing) {
      existing.count += Number(row.count)
    } else {
      cityMap.set(key, { city: row.city, state: row.state, count: Number(row.count) })
    }
  }

  // Sort by count and return top N
  return Array.from(cityMap.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
}

export const getCourierDistribution = async (userId: string) => {
  // Get courier distribution from B2C orders
  const b2cCouriers = await db
    .select({
      courier: b2c_orders.courier_partner,
      count: count(),
    })
    .from(b2c_orders)
    .where(and(eq(b2c_orders.user_id, userId), sql`${b2c_orders.courier_partner} IS NOT NULL`))
    .groupBy(b2c_orders.courier_partner)

  // Get courier distribution from B2B orders
  const b2bCouriers = await db
    .select({
      courier: b2b_orders.courier_partner,
      count: count(),
    })
    .from(b2b_orders)
    .where(and(eq(b2b_orders.user_id, userId), sql`${b2b_orders.courier_partner} IS NOT NULL`))
    .groupBy(b2b_orders.courier_partner)

  // Merge and aggregate
  const courierMap = new Map<string, number>()

  for (const row of b2cCouriers) {
    if (row.courier) {
      const existing = courierMap.get(row.courier) || 0
      courierMap.set(row.courier, existing + Number(row.count))
    }
  }

  for (const row of b2bCouriers) {
    if (row.courier) {
      const existing = courierMap.get(row.courier) || 0
      courierMap.set(row.courier, existing + Number(row.count))
    }
  }

  // Convert to array and sort by count
  return Array.from(courierMap.entries())
    .map(([courier, count]) => ({ courier, count }))
    .sort((a, b) => b.count - a.count)
}

// Comprehensive merchant dashboard stats
export const getMerchantDashboardStats = async (userId: string) => {
  // Get all orders for the user
  const b2cOrders = await db.select().from(b2c_orders).where(eq(b2c_orders.user_id, userId))
  const b2bOrders = await db.select().from(b2b_orders).where(eq(b2b_orders.user_id, userId))
  const allOrders = [...b2cOrders, ...b2bOrders]

  // Get wallet balance
  const [wallet] = await db.select().from(wallets).where(eq(wallets.userId, userId)).limit(1)
  const walletBalance = Number(wallet?.balance || 0)

  // Get COD remittance stats
  const codRemittanceStats = await db
    .select({
      pending: sql<number>`COALESCE(SUM(CASE WHEN status = 'pending' THEN remittable_amount::numeric ELSE 0 END), 0)`,
      credited: sql<number>`COALESCE(SUM(CASE WHEN status = 'credited' THEN remittable_amount::numeric ELSE 0 END), 0)`,
    })
    .from(codRemittances)
    .where(eq(codRemittances.userId, userId))

  // Get support tickets
  const tickets = await db
    .select()
    .from(supportTickets)
    .where(eq(supportTickets.userId, userId))

  // Calculate dates
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const thisWeekStart = new Date(today)
  thisWeekStart.setDate(thisWeekStart.getDate() - 6)
  const previousWeekStart = new Date(thisWeekStart)
  previousWeekStart.setDate(previousWeekStart.getDate() - 7)
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1)

  const getFirstValidDate = (...values: unknown[]) => {
    for (const value of values) {
      if (!value) continue
      const parsed = new Date(value as string | number | Date)
      if (!isNaN(parsed.getTime())) {
        return parsed
      }
    }
    return new Date(0)
  }
  // Prefer the business order date over insertion time so dashboard trends
  // remain accurate for imported/synced orders.
  const getOrderTimestamp = (order: any) =>
    getFirstValidDate(order.order_date, order.created_at, order.updated_at)
  const isSameLocalDay = (date: Date, target: Date) =>
    date.getFullYear() === target.getFullYear() &&
    date.getMonth() === target.getMonth() &&
    date.getDate() === target.getDate()
  const isWithinInclusiveRange = (date: Date, start: Date, end: Date) => date >= start && date <= end
  const isWithinHalfOpenRange = (date: Date, start: Date, endExclusive: Date) =>
    date >= start && date < endExclusive

  // Today's operations
  const todayOrders = allOrders.filter((o) => {
    const orderDate = getOrderTimestamp(o)
    return !isNaN(orderDate.getTime()) && isSameLocalDay(orderDate, today)
  })

  const pendingOrders = todayOrders.filter((o) => {
    const status = (o.order_status || '').toLowerCase()
    return ['pending', 'booked', 'pickup_initiated'].includes(status)
  })

  const inTransitOrders = todayOrders.filter((o) => {
    const status = (o.order_status || '').toLowerCase()
    return ['shipment_created', 'in_transit', 'out_for_delivery'].includes(status)
  })

  const deliveredToday = todayOrders.filter((o) => {
    const status = (o.order_status || '').toLowerCase()
    return status === 'delivered'
  })

  // Financial overview (CUSTOMER-FACING - only platform rates)
  // Customers see their profit: shipping_charges (what they charge) - freight_charges (what platform charges)
  // They should NOT see courier_cost or platform revenue
  const todayRevenue = todayOrders.reduce((sum, o) => {
    const shippingCharge = Number((o as any).shipping_charges || 0) // What seller charges customer
    const freightCharge = Number((o as any).freight_charges || 0) // What platform charges seller
    // Customer profit = what they charge - what platform charges them
    const customerProfit = freightCharge > 0 ? shippingCharge - freightCharge : shippingCharge
    return sum + customerProfit
  }, 0)

  const totalRevenue = allOrders.reduce((sum, o) => {
    const shippingCharge = Number((o as any).shipping_charges || 0) // What seller charges customer
    const freightCharge = Number((o as any).freight_charges || 0) // What platform charges seller
    // Customer profit = what they charge - what platform charges them
    const customerProfit = freightCharge > 0 ? shippingCharge - freightCharge : shippingCharge
    return sum + customerProfit
  }, 0)

  const totalShippingCharges = allOrders.reduce((sum, o) => sum + Number((o as any).shipping_charges || 0), 0)
  const totalFreightCharges = allOrders.reduce((sum, o) => sum + Number((o as any).freight_charges || 0), 0)

  const codOrders = allOrders.filter((o) => ((o as any).order_type || '').toLowerCase() === 'cod')
  const codAmount = codOrders.reduce((sum, o) => sum + Number(o.order_amount || 0), 0)
  const codRemittanceDue = Number(codRemittanceStats[0]?.pending || 0)
  const codRemittanceCreditedThisMonth = await db
    .select({
      credited: sql<number>`COALESCE(SUM(${codRemittances.remittableAmount}::numeric), 0)`,
    })
    .from(codRemittances)
    .where(
      and(
        eq(codRemittances.userId, userId),
        eq(codRemittances.status, 'credited'),
        sql`${codRemittances.creditedAt} >= ${thisMonthStart}`,
      ),
    )

  // Operational health
  const totalOrders = allOrders.length
  const nonCancelledOrders = allOrders.filter((o) => {
    const status = ((o as any).order_status || '').toLowerCase()
    return status !== 'cancelled'
  })
  const operationalBaseCount = nonCancelledOrders.length
  const deliveredOrders = allOrders.filter((o) => {
    const status = (o.order_status || '').toLowerCase()
    return status === 'delivered'
  })
  const deliverySuccessRate =
    operationalBaseCount > 0 ? Math.round((deliveredOrders.length / operationalBaseCount) * 100) : 0

  // NDR and RTO
  const ndrEvents = await db
    .select({ orderId: ndr_events.order_id })
    .from(ndr_events)
    .where(eq(ndr_events.user_id, userId))
  const ndrCount = new Set(ndrEvents.map((event) => event.orderId)).size
  const ndrRate = operationalBaseCount > 0 ? Math.round((ndrCount / operationalBaseCount) * 100) : 0

  const rtoEvents = await db
    .select({ orderId: rto_events.order_id })
    .from(rto_events)
    .where(eq(rto_events.user_id, userId))
  const rtoCount = new Set(rtoEvents.map((event) => event.orderId)).size
  const rtoRate = operationalBaseCount > 0 ? Math.round((rtoCount / operationalBaseCount) * 100) : 0

  // Average delivery time
  const deliveredOrdersWithDates = deliveredOrders.filter((o) => {
    const created = getOrderTimestamp(o)
    const delivered = getFirstValidDate((o as any).delivered_at, (o as any).updated_at, (o as any).created_at)
    return !isNaN(created.getTime()) && !isNaN(delivered.getTime())
  })
  const avgDeliveryTime =
    deliveredOrdersWithDates.length > 0
      ? Math.round(
          deliveredOrdersWithDates.reduce((sum, o) => {
            const created = getOrderTimestamp(o)
            const delivered = getFirstValidDate((o as any).delivered_at, (o as any).updated_at, (o as any).created_at)
            return sum + Math.floor((delivered.getTime() - created.getTime()) / (1000 * 60 * 60 * 24))
          }, 0) / deliveredOrdersWithDates.length
        )
      : 0

  // Courier performance (CUSTOMER-FACING - only platform rates)
  const courierPerformance = allOrders.reduce((acc, o) => {
    const courier = (o as any).courier_partner || 'Unknown'
    if (!acc[courier]) {
      acc[courier] = { count: 0, delivered: 0, revenue: 0, deliveryRate: 0 }
    }
    if (((o as any).order_status || '').toLowerCase() !== 'cancelled') {
      acc[courier].count += 1
    }
    const shippingCharge = Number((o as any).shipping_charges || 0) // What seller charges
    const freightCharge = Number((o as any).freight_charges || 0) // What platform charges
    // Customer profit per order
    const customerProfit = freightCharge > 0 ? shippingCharge - freightCharge : shippingCharge
    acc[courier].revenue += customerProfit
    if (((o as any).order_status || '').toLowerCase() === 'delivered') {
      acc[courier].delivered += 1
    }
    return acc
  }, {} as Record<string, { count: number; delivered: number; revenue: number; deliveryRate: number }>)

  Object.keys(courierPerformance).forEach((courier) => {
    const perf = courierPerformance[courier]
    perf.deliveryRate = perf.count > 0 ? Math.round((perf.delivered / perf.count) * 100) : 0
  })

  // Charts data - orders by date (last 7 days)
  const ordersByDate: Record<string, number> = {}
  const revenueByDate: Record<string, number> = {}
  const ordersByStatus: Record<string, number> = {}
  const revenueByOrderType: Record<string, number> = {}
  const ordersByCourier: Record<string, number> = {}
  const revenueByCourier: Record<string, number> = {}
  
  // 30 days data for monthly trends
  const ordersByDate30: Record<string, number> = {}
  const revenueByDate30: Record<string, number> = {}

  for (let i = 6; i >= 0; i--) {
    const date = new Date(today)
    date.setDate(date.getDate() - i)
    const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    const dayOrders = allOrders.filter((o) => {
      const orderDate = getOrderTimestamp(o)
      return !isNaN(orderDate.getTime()) && isSameLocalDay(orderDate, date)
    })
    ordersByDate[dateStr] = dayOrders.length
    // Customer profit (not platform revenue)
    revenueByDate[dateStr] = dayOrders.reduce((sum, o) => {
      const shippingCharge = Number((o as any).shipping_charges || 0) // What seller charges
      const freightCharge = Number((o as any).freight_charges || 0) // What platform charges
      const customerProfit = freightCharge > 0 ? shippingCharge - freightCharge : shippingCharge
      return sum + customerProfit
    }, 0)
  }

  // 30 days trends
  for (let i = 29; i >= 0; i--) {
    const date = new Date(today)
    date.setDate(date.getDate() - i)
    const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    const dayOrders = allOrders.filter((o) => {
      const orderDate = getOrderTimestamp(o)
      return !isNaN(orderDate.getTime()) && isSameLocalDay(orderDate, date)
    })
    ordersByDate30[dateStr] = dayOrders.length
    // Customer profit (not platform revenue)
    revenueByDate30[dateStr] = dayOrders.reduce((sum, o) => {
      const shippingCharge = Number((o as any).shipping_charges || 0) // What seller charges
      const freightCharge = Number((o as any).freight_charges || 0) // What platform charges
      const customerProfit = freightCharge > 0 ? shippingCharge - freightCharge : shippingCharge
      return sum + customerProfit
    }, 0)
  }

  // Order status breakdown
  allOrders.forEach((o) => {
    const status = ((o as any).order_status || 'pending').toLowerCase()
    ordersByStatus[status] = (ordersByStatus[status] || 0) + 1
  })

  // Revenue by order type (COD vs Prepaid) - Customer profit
  allOrders.forEach((o) => {
    const orderType = ((o as any).order_type || 'prepaid').toLowerCase()
    const shippingCharge = Number((o as any).shipping_charges || 0) // What seller charges
    const freightCharge = Number((o as any).freight_charges || 0) // What platform charges
    const customerProfit = freightCharge > 0 ? shippingCharge - freightCharge : shippingCharge
    revenueByOrderType[orderType] = (revenueByOrderType[orderType] || 0) + customerProfit
  })

  // Orders and revenue by courier - Customer profit
  allOrders.forEach((o) => {
    const courier = (o as any).courier_partner || 'Unknown'
    ordersByCourier[courier] = (ordersByCourier[courier] || 0) + 1
    const shippingCharge = Number((o as any).shipping_charges || 0) // What seller charges
    const freightCharge = Number((o as any).freight_charges || 0) // What platform charges
    const customerProfit = freightCharge > 0 ? shippingCharge - freightCharge : shippingCharge
    revenueByCourier[courier] = (revenueByCourier[courier] || 0) + customerProfit
  })

  // Additional metrics
  const prepaidOrders = allOrders.filter((o) => ((o as any).order_type || '').toLowerCase() === 'prepaid')
  const codOrdersCount = allOrders.filter((o) => ((o as any).order_type || '').toLowerCase() === 'cod')
  
  // Average order value
  const avgOrderValue = allOrders.length > 0
    ? allOrders.reduce((sum, o) => sum + Number((o as any).order_amount || 0), 0) / allOrders.length
    : 0

  // Top performing cities by revenue - Customer profit
  const cityRevenue: Record<string, number> = {}
  allOrders.forEach((o) => {
    const city = (o as any).city || 'Unknown'
    const shippingCharge = Number((o as any).shipping_charges || 0) // What seller charges
    const freightCharge = Number((o as any).freight_charges || 0) // What platform charges
    const customerProfit = freightCharge > 0 ? shippingCharge - freightCharge : shippingCharge
    cityRevenue[city] = (cityRevenue[city] || 0) + customerProfit
  })
  const topRevenueCities = Object.entries(cityRevenue)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([city, revenue]) => ({ city, revenue }))

  // Week-over-week comparison
  const thisWeekEnd = new Date(now)

  const thisWeekOrders = allOrders.filter((o) => {
    const orderDate = getOrderTimestamp(o)
    return !isNaN(orderDate.getTime()) && isWithinInclusiveRange(orderDate, thisWeekStart, thisWeekEnd)
  })
  const previousWeekOrders = allOrders.filter((o) => {
    const orderDate = getOrderTimestamp(o)
    return (
      !isNaN(orderDate.getTime()) &&
      isWithinHalfOpenRange(orderDate, previousWeekStart, thisWeekStart)
    )
  })

  const thisWeekRevenue = thisWeekOrders.reduce((sum, o) => {
    const shippingCharge = Number((o as any).shipping_charges || 0) // What seller charges
    const freightCharge = Number((o as any).freight_charges || 0) // What platform charges
    const customerProfit = freightCharge > 0 ? shippingCharge - freightCharge : shippingCharge
    return sum + customerProfit
  }, 0)
  const previousWeekRevenue = previousWeekOrders.reduce((sum, o) => {
    const shippingCharge = Number((o as any).shipping_charges || 0) // What seller charges
    const freightCharge = Number((o as any).freight_charges || 0) // What platform charges
    const customerProfit = freightCharge > 0 ? shippingCharge - freightCharge : shippingCharge
    return sum + customerProfit
  }, 0)

  const ordersGrowth = previousWeekOrders.length > 0
    ? Math.round(((thisWeekOrders.length - previousWeekOrders.length) / previousWeekOrders.length) * 100)
    : thisWeekOrders.length > 0 ? 100 : 0
  const revenueGrowth = previousWeekRevenue > 0
    ? Math.round(((thisWeekRevenue - previousWeekRevenue) / previousWeekRevenue) * 100)
    : thisWeekRevenue > 0 ? 100 : 0

  // Get recent wallet transactions
  const recentTransactions = wallet
    ? await db
        .select()
        .from(walletTransactions)
        .where(eq(walletTransactions.wallet_id, wallet.id))
        .orderBy(sql`${walletTransactions.created_at} DESC`)
        .limit(5)
    : []

  // Get recent orders for activity feed
  const recentOrdersList = allOrders
    .sort((a, b) => {
      const dateA = getOrderTimestamp(a).getTime()
      const dateB = getOrderTimestamp(b).getTime()
      return dateB - dateA
    })
    .slice(0, 5)

  // Get pending actions
  const pendingActions = await getPendingActions(userId)

  // Get invoice status
  const invoiceStatus = await getInvoiceStatus(userId)

  // Get top destinations
  const topDestinations = await getTopDestinations(userId, 5)

  // Get courier distribution
  const courierDistribution = await getCourierDistribution(userId)

  // Support tickets status
  const openTickets = tickets.filter((t) => t.status === 'open')
  const inProgressTickets = tickets.filter((t) => t.status === 'in_progress')

  return {
    success: true,
    data: {
      // Today's Operations
      todayOperations: {
        orders: todayOrders.length,
        pending: pendingOrders.length,
        inTransit: inTransitOrders.length,
        delivered: deliveredToday.length,
      },
      // Financial Overview
      financial: {
        walletBalance,
        todayRevenue,
        totalRevenue,
        totalShippingCharges,
        totalFreightCharges,
        profit: totalRevenue, // Margin
        codAmount,
        codRemittanceDue,
        codRemittanceCredited: Number(codRemittanceCreditedThisMonth[0]?.credited || 0),
      },
      // Operational Health
      operational: {
        deliverySuccessRate,
        ndrRate,
        rtoRate,
        avgDeliveryTime,
        totalOrders,
        deliveredOrders: deliveredOrders.length,
        ndrCount,
        rtoCount,
      },
      // Action Items
      actions: {
        ndrCount: pendingActions.ndrCount,
        rtoCount: pendingActions.rtoCount,
        weightDiscrepancyCount: pendingActions.weightDiscrepancyCount,
        openTickets: openTickets.length,
        inProgressTickets: inProgressTickets.length,
        pendingInvoices: invoiceStatus.pending.count,
        pendingInvoiceAmount: invoiceStatus.pending.totalAmount,
        overdueInvoices: invoiceStatus.overdue.count,
        overdueInvoiceAmount: invoiceStatus.overdue.totalAmount,
      },
      // Courier Performance
      couriers: {
        performance: courierPerformance,
        distribution: courierDistribution,
      },
      // Geographic
      geographic: {
        topDestinations,
      },
      // Charts
      charts: {
        ordersByDate: Object.entries(ordersByDate).map(([date, count]) => ({ date, orders: count })),
        revenueByDate: Object.entries(revenueByDate).map(([date, revenue]) => ({ date, revenue })),
        ordersByDate30: Object.entries(ordersByDate30).map(([date, count]) => ({ date, orders: count })),
        revenueByDate30: Object.entries(revenueByDate30).map(([date, revenue]) => ({ date, revenue })),
        ordersByStatus: Object.entries(ordersByStatus).map(([status, count]) => ({ status, count })),
        revenueByOrderType: Object.entries(revenueByOrderType).map(([type, revenue]) => ({ type, revenue })),
        ordersByCourier: Object.entries(ordersByCourier).map(([courier, count]) => ({ courier, count })),
        revenueByCourier: Object.entries(revenueByCourier).map(([courier, revenue]) => ({ courier, revenue })),
      },
      // Additional Metrics
      metrics: {
        avgOrderValue,
        totalPrepaidOrders: prepaidOrders.length,
        totalCodOrders: codOrdersCount.length,
        prepaidRevenue: prepaidOrders.reduce((sum, o) => {
          const shippingCharge = Number((o as any).shipping_charges || 0) // What seller charges
          const freightCharge = Number((o as any).freight_charges || 0) // What platform charges
          const customerProfit = freightCharge > 0 ? shippingCharge - freightCharge : shippingCharge
          return sum + customerProfit
        }, 0),
        codRevenue: codOrdersCount.reduce((sum, o) => {
          const shippingCharge = Number((o as any).shipping_charges || 0) // What seller charges
          const freightCharge = Number((o as any).freight_charges || 0) // What platform charges
          const customerProfit = freightCharge > 0 ? shippingCharge - freightCharge : shippingCharge
          return sum + customerProfit
        }, 0),
        topRevenueCities,
      },
      // Recent orders
      recentOrders: recentOrdersList,
      // Trends & Growth
      trends: {
        ordersGrowth,
        revenueGrowth,
        thisWeekOrders: thisWeekOrders.length,
        lastWeekOrders: previousWeekOrders.length,
        thisWeekRevenue,
        lastWeekRevenue: previousWeekRevenue,
      },
      // Recent Activity
      recentActivity: {
        transactions: recentTransactions.map((t) => ({
          id: t.id,
          type: t.type,
          amount: Number(t.amount || 0),
          reason: t.reason || '',
          createdAt: t.created_at,
        })),
        recentOrders: recentOrdersList.map((o) => ({
          id: (o as any).id,
          orderNumber: (o as any).order_number || '',
          status: (o as any).order_status || '',
          amount: Number((o as any).order_amount || 0),
          createdAt: getOrderTimestamp(o),
        })),
      },
    },
  }
}

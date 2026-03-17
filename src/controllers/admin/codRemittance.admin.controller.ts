import { and, desc, eq, gte, like, lte, or, sql } from 'drizzle-orm'
import { Response } from 'express'
import { buildCsv } from '../../utils/csv'
import { db } from '../../models/client'
import { codRemittances } from '../../models/schema/codRemittance'
import { users } from '../../models/schema/users'
import { wallets } from '../../models/schema/wallet'
import { creditCodRemittanceToWallet } from '../../models/services/codRemittance.service'

/**
 * Admin: Get all COD remittances across all users
 */
export const getAllCodRemittances = async (req: any, res: Response): Promise<any> => {
  try {
    const { status, fromDate, toDate, search, page = 1, limit = 50 } = req.query

    const offset = (parseInt(page as string) - 1) * parseInt(limit as string)
    const conditions = []

    if (status) {
      conditions.push(eq(codRemittances.status, status as any))
    }

    if (fromDate) {
      conditions.push(gte(codRemittances.collectedAt, new Date(fromDate as string)))
    }

    if (toDate) {
      const inclusiveToDate = new Date(toDate as string)
      inclusiveToDate.setHours(23, 59, 59, 999)
      conditions.push(lte(codRemittances.collectedAt, inclusiveToDate))
    }

    if (search) {
      conditions.push(
        or(
          like(codRemittances.orderNumber, `%${search}%`),
          like(codRemittances.awbNumber, `%${search}%`),
          like(users.email, `%${search}%`),
        ),
      )
    }

    // Fetch remittances with user info
    const remittances = await db
      .select({
        id: codRemittances.id,
        userId: codRemittances.userId,
        userEmail: users.email,
        // userName: users.name,
        orderId: codRemittances.orderId,
        orderType: codRemittances.orderType,
        orderNumber: codRemittances.orderNumber,
        awbNumber: codRemittances.awbNumber,
        courierPartner: codRemittances.courierPartner,
        codAmount: codRemittances.codAmount,
        codCharges: codRemittances.codCharges,
        shippingCharges: codRemittances.shippingCharges,
        deductions: codRemittances.deductions,
        remittableAmount: codRemittances.remittableAmount,
        status: codRemittances.status,
        collectedAt: codRemittances.collectedAt,
        creditedAt: codRemittances.creditedAt,
        walletTransactionId: codRemittances.walletTransactionId,
        notes: codRemittances.notes,
        createdAt: codRemittances.createdAt,
      })
      .from(codRemittances)
      .leftJoin(users, eq(codRemittances.userId, users.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(codRemittances.createdAt))
      .limit(parseInt(limit as string))
      .offset(offset)

    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(codRemittances)
      .where(conditions.length > 0 ? and(...conditions) : undefined)

    return res.json({
      success: true,
      data: {
        remittances,
        totalCount: Number(countResult?.count || 0),
        page: parseInt(page as string),
        limit: parseInt(limit as string),
        totalPages: Math.ceil(Number(countResult?.count || 0) / parseInt(limit as string)),
      },
    })
  } catch (error) {
    console.error('[getAllCodRemittances] Error:', error)
    return res.status(500).json({ success: false, message: 'Failed to fetch remittances' })
  }
}

/**
 * Admin: Get platform-wide COD statistics
 */
export const getCodPlatformStats = async (req: any, res: Response): Promise<any> => {
  try {
    // Total credited remittances
    const [creditedStats] = await db
      .select({
        count: sql<number>`count(*)`,
        totalAmount: sql<number>`COALESCE(SUM(${codRemittances.remittableAmount}), 0)`,
      })
      .from(codRemittances)
      .where(eq(codRemittances.status, 'credited'))

    // Total pending remittances
    const [pendingStats] = await db
      .select({
        count: sql<number>`count(*)`,
        totalAmount: sql<number>`COALESCE(SUM(${codRemittances.remittableAmount}), 0)`,
      })
      .from(codRemittances)
      .where(eq(codRemittances.status, 'pending'))

    // Unique users with pending remittances
    const [usersWithPending] = await db
      .select({ count: sql<number>`COUNT(DISTINCT ${codRemittances.userId})` })
      .from(codRemittances)
      .where(eq(codRemittances.status, 'pending'))

    // Today's credited remittances
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const [todayStats] = await db
      .select({
        count: sql<number>`count(*)`,
        totalAmount: sql<number>`COALESCE(SUM(${codRemittances.remittableAmount}), 0)`,
      })
      .from(codRemittances)
      .where(and(eq(codRemittances.status, 'credited'), gte(codRemittances.creditedAt, today)))

    return res.json({
      success: true,
      data: {
        totalCredited: {
          count: Number(creditedStats?.count || 0),
          amount: Number(creditedStats?.totalAmount || 0),
        },
        totalPending: {
          count: Number(pendingStats?.count || 0),
          amount: Number(pendingStats?.totalAmount || 0),
        },
        usersWithPending: Number(usersWithPending?.count || 0),
        todayCredited: {
          count: Number(todayStats?.count || 0),
          amount: Number(todayStats?.totalAmount || 0),
        },
      },
    })
  } catch (error) {
    console.error('[getCodPlatformStats] Error:', error)
    return res.status(500).json({ success: false, message: 'Failed to fetch platform stats' })
  }
}

/**
 * Admin: Get user-specific COD remittances
 */
export const getUserCodRemittances = async (req: any, res: Response): Promise<any> => {
  try {
    const { userId } = req.params

    if (!userId) {
      return res.status(400).json({ success: false, message: 'User ID required' })
    }

    // Get user details
    const [user] = await db.select().from(users).where(eq(users.id, userId))

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' })
    }

    // Get remittances
    const remittances = await db
      .select()
      .from(codRemittances)
      .where(eq(codRemittances.userId, userId))
      .orderBy(desc(codRemittances.createdAt))
      .limit(50)

    // Get stats
    const [creditedStats] = await db
      .select({
        count: sql<number>`count(*)`,
        totalAmount: sql<number>`COALESCE(SUM(${codRemittances.remittableAmount}), 0)`,
      })
      .from(codRemittances)
      .where(and(eq(codRemittances.userId, userId), eq(codRemittances.status, 'credited')))

    const [pendingStats] = await db
      .select({
        count: sql<number>`count(*)`,
        totalAmount: sql<number>`COALESCE(SUM(${codRemittances.remittableAmount}), 0)`,
      })
      .from(codRemittances)
      .where(and(eq(codRemittances.userId, userId), eq(codRemittances.status, 'pending')))

    // Get wallet balance
    const [wallet] = await db.select().from(wallets).where(eq(wallets.userId, userId))

    return res.json({
      success: true,
      data: {
        user: {
          id: user.id,
          email: user.email,
          // name: user.name,
        },
        stats: {
          credited: {
            count: Number(creditedStats?.count || 0),
            amount: Number(creditedStats?.totalAmount || 0),
          },
          pending: {
            count: Number(pendingStats?.count || 0),
            amount: Number(pendingStats?.totalAmount || 0),
          },
          walletBalance: Number(wallet?.balance || 0),
        },
        remittances,
      },
    })
  } catch (error) {
    console.error('[getUserCodRemittances] Error:', error)
    return res.status(500).json({ success: false, message: 'Failed to fetch user remittances' })
  }
}

/**
 * Admin: Manually credit wallet when courier settles
 * Real-world flow: Courier sends money → Admin receives it → Credits merchant wallet
 */
export const manualCreditWallet = async (req: any, res: Response): Promise<any> => {
  try {
    const { remittanceId } = req.params
    const { settledDate, utrNumber, settledAmount, notes } = req.body || {}

    if (!remittanceId) {
      return res.status(400).json({ success: false, message: 'Remittance ID required' })
    }

    // Credit using the service function
    const updated = await creditCodRemittanceToWallet({
      remittanceId,
      settledDate: settledDate ? new Date(settledDate) : new Date(), // Default to now
      utrNumber: utrNumber || `MANUAL-${Date.now()}`, // Auto-generate if not provided
      settledAmount: settledAmount ? Number(settledAmount) : undefined,
      notes: notes || 'Manual credit by admin',
      creditedBy: req.user?.sub || 'admin',
    })

    return res.json({
      success: true,
      message: 'COD remittance credited to wallet successfully',
      data: updated,
    })
  } catch (error: any) {
    console.error('[manualCreditWallet] Error:', error)
    return res.status(400).json({
      success: false,
      message: error.message || 'Failed to credit wallet',
    })
  }
}

/**
 * Admin: Update remittance notes
 */
export const updateRemittanceNotes = async (req: any, res: Response): Promise<any> => {
  try {
    const { remittanceId } = req.params
    const { notes } = req.body

    if (!remittanceId) {
      return res.status(400).json({ success: false, message: 'Remittance ID required' })
    }

    const [updated] = await db
      .update(codRemittances)
      .set({
        notes,
        updatedAt: new Date(),
      })
      .where(eq(codRemittances.id, remittanceId))
      .returning()

    return res.json({ success: true, data: updated })
  } catch (error) {
    console.error('[updateRemittanceNotes] Error:', error)
    return res.status(500).json({ success: false, message: 'Failed to update notes' })
  }
}

/**
 * Admin: Export all COD remittances as CSV
 */
export const exportAllCodRemittances = async (req: any, res: Response): Promise<any> => {
  try {
    const { status, fromDate, toDate } = req.query

    const conditions = []

    if (status) {
      conditions.push(eq(codRemittances.status, status as any))
    }

    if (fromDate) {
      conditions.push(gte(codRemittances.collectedAt, new Date(fromDate as string)))
    }

    if (toDate) {
      const inclusiveToDate = new Date(toDate as string)
      inclusiveToDate.setHours(23, 59, 59, 999)
      conditions.push(lte(codRemittances.collectedAt, inclusiveToDate))
    }

    const remittances = await db
      .select({
        orderNumber: codRemittances.orderNumber,
        awbNumber: codRemittances.awbNumber,
        userEmail: users.email,
        // userName: users.name,
        courierPartner: codRemittances.courierPartner,
        codAmount: codRemittances.codAmount,
        deductions: codRemittances.deductions,
        remittableAmount: codRemittances.remittableAmount,
        status: codRemittances.status,
        collectedAt: codRemittances.collectedAt,
        creditedAt: codRemittances.creditedAt,
      })
      .from(codRemittances)
      .leftJoin(users, eq(codRemittances.userId, users.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(codRemittances.createdAt))
      .limit(10000)

    const headers = [
      'Order Number',
      'AWB',
      'User Email',
      'User Name',
      'Courier',
      'COD Amount',
      'Deductions',
      'Remittable',
      'Status',
      'Collected At',
      'Credited At',
    ]

    const rows = remittances.map((r: any) => [
      r.orderNumber,
      r.awbNumber || 'N/A',
      r.userEmail || 'N/A',
      r.userName || 'N/A',
      r.courierPartner || 'N/A',
      r.codAmount,
      r.deductions,
      r.remittableAmount,
      r.status,
      r.collectedAt ? new Date(r.collectedAt).toISOString() : 'N/A',
      r.creditedAt ? new Date(r.creditedAt).toISOString() : 'N/A',
    ])

    const csv = buildCsv(headers, rows)

    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', 'attachment; filename=admin_cod_remittances.csv')
    return res.send(csv)
  } catch (error) {
    console.error('[exportAllCodRemittances] Error:', error)
    return res.status(500).json({ success: false, message: 'Failed to export remittances' })
  }
}

import { eq } from 'drizzle-orm'
import { Response } from 'express'
import { db } from '../models/client'
import { codRemittances } from '../models/schema/codRemittance'
import { buildCsv } from '../utils/csv'
import {
  getCodDashboardSummary,
  getCodRemittances,
  getCodRemittanceStats,
  updateCodRemittanceNotes,
} from '../models/services/codRemittance.service'

/**
 * Get COD dashboard summary
 */
export const getCodDashboard = async (req: any, res: Response): Promise<any> => {
  try {
    const userId = req.user?.sub

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' })
    }

    const summary = await getCodDashboardSummary(userId)

    return res.json({ success: true, data: summary })
  } catch (error) {
    console.error('[getCodDashboard] Error:', error)
    return res.status(500).json({ success: false, message: 'Failed to fetch COD dashboard' })
  }
}

/**
 * Get all COD remittances for logged-in user
 */
export const getRemittances = async (req: any, res: Response): Promise<any> => {
  try {
    const userId = req.user?.sub

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' })
    }

    const { status, fromDate, toDate, page, limit } = req.query

    const filters: any = {}
    if (status) filters.status = status
    if (fromDate) filters.fromDate = new Date(fromDate as string)
    if (toDate) filters.toDate = new Date(toDate as string)
    if (page) filters.page = parseInt(page as string)
    if (limit) filters.limit = parseInt(limit as string)

    const result = await getCodRemittances(userId, filters)

    return res.json({ success: true, data: result })
  } catch (error) {
    console.error('[getRemittances] Error:', error)
    return res.status(500).json({ success: false, message: 'Failed to fetch remittances' })
  }
}

/**
 * Get COD remittance statistics
 */
export const getRemittanceStats = async (req: any, res: Response): Promise<any> => {
  try {
    const userId = req.user?.sub

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' })
    }

    const stats = await getCodRemittanceStats(userId)

    return res.json({ success: true, data: stats })
  } catch (error) {
    console.error('[getRemittanceStats] Error:', error)
    return res.status(500).json({ success: false, message: 'Failed to fetch stats' })
  }
}

/**
 * Update remittance notes
 */
export const updateRemittance = async (req: any, res: Response): Promise<any> => {
  try {
    const { remittanceId } = req.params
    const { notes } = req.body

    if (!remittanceId) {
      return res.status(400).json({ success: false, message: 'Remittance ID required' })
    }

    const userId = req.user?.sub
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' })
    }

    const [remittance] = await db
      .select({ id: codRemittances.id, userId: codRemittances.userId })
      .from(codRemittances)
      .where(eq(codRemittances.id, remittanceId))
      .limit(1)

    if (!remittance) {
      return res.status(404).json({ success: false, message: 'Remittance not found' })
    }

    if (remittance.userId !== userId) {
      return res.status(403).json({ success: false, message: 'Forbidden' })
    }

    const updated = await updateCodRemittanceNotes(remittanceId, notes)

    return res.json({ success: true, data: updated })
  } catch (error) {
    console.error('[updateRemittance] Error:', error)
    return res.status(500).json({ success: false, message: 'Failed to update remittance' })
  }
}

/**
 * Export single settlement as detailed CSV receipt
 */
export const exportSingleSettlement = async (req: any, res: Response): Promise<any> => {
  try {
    const userId = req.user?.sub
    const { remittanceId } = req.params

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' })
    }

    if (!remittanceId) {
      return res.status(400).json({ success: false, message: 'Remittance ID required' })
    }

    // Get the specific remittance with all details
    const { db } = await import('../models/client')
    const { codRemittances } = await import('../models/schema/codRemittance')
    const { users } = await import('../models/schema/users')
    const { wallets } = await import('../models/schema/wallet')
    const { eq } = await import('drizzle-orm')

    const [remittance] = await db
      .select({
        // Remittance details
        id: codRemittances.id,
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
        notes: codRemittances.notes,
        createdAt: codRemittances.createdAt,
        walletTransactionId: codRemittances.walletTransactionId,
        // User details
        userEmail: users.email,
        userId: users.id,
      })
      .from(codRemittances)
      .leftJoin(users, eq(codRemittances.userId, users.id))
      .where(eq(codRemittances.id, remittanceId))

    if (!remittance) {
      return res.status(404).json({ success: false, message: 'Settlement not found' })
    }

    // Verify ownership
    if (remittance.userId !== userId) {
      return res.status(403).json({ success: false, message: 'Access denied' })
    }

    // Create detailed settlement report
    const codCharges = Number(remittance.codCharges || 0)
    const freightCharges = Number(remittance.shippingCharges || 0)
    const totalDeductions = Number(remittance.deductions || 0)
    const otherDeductions = totalDeductions - codCharges - freightCharges

    const report = []

    // Header
    report.push(['COD SETTLEMENT RECEIPT'])
    report.push([''])

    // Settlement Info
    report.push(['Settlement ID:', remittance.id])
    report.push([
      'Settlement Date:',
      remittance.creditedAt ? new Date(remittance.creditedAt).toLocaleString('en-IN') : 'Pending',
    ])
    report.push(['Status:', remittance.status?.toUpperCase()])
    report.push([''])

    // Order Details
    report.push(['ORDER DETAILS'])
    report.push(['Order Number:', remittance.orderNumber])
    report.push(['AWB Number:', remittance.awbNumber || 'N/A'])
    report.push(['Courier Partner:', remittance.courierPartner || 'N/A'])
    report.push([
      'Delivery Date:',
      remittance.collectedAt ? new Date(remittance.collectedAt).toLocaleDateString('en-IN') : 'N/A',
    ])
    report.push([''])

    // Amount Breakdown
    report.push(['AMOUNT BREAKDOWN'])
    report.push(['COD Amount Collected:', `₹${Number(remittance.codAmount || 0).toFixed(2)}`])
    report.push([''])
    report.push(['DEDUCTIONS:'])
    report.push(['  COD Charges:', `₹${codCharges.toFixed(2)}`])
    report.push(['  Freight Charges:', `₹${freightCharges.toFixed(2)}`])
    if (otherDeductions > 0) {
      report.push(['  Other Deductions:', `₹${otherDeductions.toFixed(2)}`])
    }
    report.push(['  Total Deductions:', `₹${totalDeductions.toFixed(2)}`])
    report.push([''])
    report.push(['NET AMOUNT REMITTED:', `₹${Number(remittance.remittableAmount || 0).toFixed(2)}`])
    report.push([''])

    // Settlement Notes
    if (remittance.notes) {
      report.push(['Settlement Notes:', remittance.notes])
      report.push([''])
    }

    // Transaction Details
    if (remittance.walletTransactionId) {
      report.push(['Wallet Transaction ID:', remittance.walletTransactionId])
    }

    // Footer
    report.push([''])
    report.push(['Generated on:', new Date().toLocaleString('en-IN')])
    report.push(['Merchant Email:', remittance.userEmail])

    // Convert to CSV
    const csv = report.map((row) => row.join(',')).join('\n')

    // Generate filename
    const filename = `Settlement_${remittance.orderNumber}_${remittance.id.substring(0, 8)}.csv`

    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename=${filename}`)

    // Add BOM for Excel compatibility
    return res.send('\uFEFF' + csv)
  } catch (error) {
    console.error('[exportSingleSettlement] Error:', error)
    return res.status(500).json({ success: false, message: 'Failed to export settlement' })
  }
}

/**
 * Export remittances as CSV (Enhanced with detailed settlement info)
 */
export const exportRemittances = async (req: any, res: Response): Promise<any> => {
  try {
    const userId = req.user?.sub

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' })
    }

    const { status, fromDate, toDate } = req.query

    const filters: any = { limit: 10000 }
    if (status) filters.status = status
    if (fromDate) filters.fromDate = new Date(fromDate as string)
    if (toDate) filters.toDate = new Date(toDate as string)

    const result = await getCodRemittances(userId, filters)

    // Enhanced headers with settlement details
    const headers = [
      'Order Number',
      'AWB Number',
      'Courier Partner',
      'COD Amount Collected',
      'COD Charges',
      'Freight Charges',
      'Other Deductions',
      'Total Deductions',
      'Net Remittable Amount',
      'Status',
      'Order Delivered Date',
      'Settlement Credited Date',
      'Settlement Notes',
      'Created Date',
    ]

    const rows = result.remittances.map((r: any) => {
      // Calculate individual deduction components
      const codCharges = Number(r.codCharges || 0)
      const freightCharges = Number(r.shippingCharges || 0)
      const totalDeductions = Number(r.deductions || 0)
      const otherDeductions = totalDeductions - codCharges - freightCharges

      return [
        r.orderNumber || '',
        r.awbNumber || 'N/A',
        r.courierPartner || 'N/A',
        r.codAmount || 0,
        codCharges,
        freightCharges,
        otherDeductions > 0 ? otherDeductions : 0,
        totalDeductions,
        r.remittableAmount || 0,
        r.status?.toUpperCase() || 'PENDING',
        r.collectedAt ? new Date(r.collectedAt).toLocaleDateString('en-IN') : 'N/A',
        r.creditedAt ? new Date(r.creditedAt).toLocaleDateString('en-IN') : 'Not Yet Settled',
        r.notes || '',
        r.createdAt ? new Date(r.createdAt).toLocaleDateString('en-IN') : '',
      ]
    })

    // Create CSV content
    const csv = buildCsv(headers, rows)

    // Generate filename with date range
    const today = new Date().toISOString().split('T')[0]
    const filename = `COD_Settlement_${today}.csv`

    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename=${filename}`)

    return res.send(csv)
  } catch (error) {
    console.error('[exportRemittances] Error:', error)
    return res.status(500).json({ success: false, message: 'Failed to export remittances' })
  }
}

import { Response } from 'express'
import {
  getIncomingPickups,
  getPendingActions,
  getInvoiceStatus,
  getTopDestinations,
  getCourierDistribution,
  getMerchantDashboardStats,
} from '../models/services/dashboard.service'

export const getHomePickups = async (req: any, res: Response) => {
  try {
    const userId = req.user?.sub // assume JWT middleware sets this

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' })
    }

    const pickups = await getIncomingPickups(userId)

    return res.json({ success: true, pickups })
  } catch (error) {
    console.error(error)
    return res.status(500).json({ success: false, message: 'Failed to fetch pickups' })
  }
}

export const getDashboardPendingActions = async (req: any, res: Response) => {
  try {
    const userId = req.user?.sub

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' })
    }

    const pendingActions = await getPendingActions(userId)

    return res.json({ success: true, ...pendingActions })
  } catch (error) {
    console.error('Error fetching pending actions:', error)
    return res.status(500).json({ success: false, message: 'Failed to fetch pending actions' })
  }
}

export const getDashboardInvoiceStatus = async (req: any, res: Response) => {
  try {
    const userId = req.user?.sub

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' })
    }

    const invoiceStatus = await getInvoiceStatus(userId)

    return res.json({ success: true, status: invoiceStatus })
  } catch (error) {
    console.error('Error fetching invoice status:', error)
    return res.status(500).json({ success: false, message: 'Failed to fetch invoice status' })
  }
}

export const getDashboardTopDestinations = async (req: any, res: Response) => {
  try {
    const userId = req.user?.sub
    const limit = parseInt((req.query.limit as string) || '10')

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' })
    }

    const destinations = await getTopDestinations(userId, limit)

    return res.json({ success: true, destinations })
  } catch (error) {
    console.error('Error fetching top destinations:', error)
    return res.status(500).json({ success: false, message: 'Failed to fetch top destinations' })
  }
}

export const getDashboardCourierDistribution = async (req: any, res: Response) => {
  try {
    const userId = req.user?.sub

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' })
    }

    const distribution = await getCourierDistribution(userId)

    return res.json({ success: true, distribution })
  } catch (error) {
    console.error('Error fetching courier distribution:', error)
    return res.status(500).json({ success: false, message: 'Failed to fetch courier distribution' })
  }
}

export const getMerchantDashboardStatsController = async (req: any, res: Response) => {
  try {
    const userId = req.user?.sub

    if (!userId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' })
    }

    const stats = await getMerchantDashboardStats(userId)

    return res.json(stats)
  } catch (error) {
    console.error('Error fetching merchant dashboard stats:', error)
    return res.status(500).json({ success: false, message: 'Failed to fetch merchant dashboard stats' })
  }
}

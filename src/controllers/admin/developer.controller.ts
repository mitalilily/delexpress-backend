import { Response } from 'express'
import {
  getDeveloperErrorLogsService,
  retryFailedManifestServiceForAdmin,
  updateDeveloperIssueStateService,
} from '../../models/services/adminDeveloper.service'

export const getDeveloperErrorLogsController = async (req: any, res: Response) => {
  try {
    const page = parseInt(req.query.page as string, 10) || 1
    const limit = parseInt(req.query.limit as string, 10) || 20

    const filters = {
      source: req.query.source as string | undefined,
      status: req.query.status as string | undefined,
      priority: req.query.priority as string | undefined,
      search: req.query.search as string | undefined,
      fromDate: req.query.fromDate as string | undefined,
      toDate: req.query.toDate as string | undefined,
      courier: req.query.courier as string | undefined,
      merchant: req.query.merchant as string | undefined,
      issueOwner: req.query.issueOwner as string | undefined,
      actionRequired: req.query.actionRequired as string | undefined,
      actionable: req.query.actionable as string | undefined,
      rootCause: req.query.rootCause as string | undefined,
    }

    const result = await getDeveloperErrorLogsService({
      page,
      limit,
      filters,
    })

    return res.status(200).json({
      success: true,
      ...result,
    })
  } catch (error: any) {
    console.error('Error fetching developer logs:', error?.message || error)
    return res.status(500).json({
      success: false,
      message: error?.message || 'Failed to fetch developer logs',
    })
  }
}

export const updateDeveloperIssueStateController = async (req: any, res: Response) => {
  try {
    const adminUserId = req.user?.sub
    const issueKey = decodeURIComponent(String(req.params.issueKey || ''))

    const result = await updateDeveloperIssueStateService({
      issueKey,
      adminUserId,
      status: req.body?.status,
      priority: req.body?.priority,
      assignToMe: req.body?.assignToMe === true,
      clearOwner: req.body?.clearOwner === true,
      markAlertSeen: req.body?.markAlertSeen === true,
    })

    return res.status(200).json({
      success: true,
      data: result,
    })
  } catch (error: any) {
    console.error('Error updating developer issue:', error?.message || error)
    return res.status(typeof error?.statusCode === 'number' ? error.statusCode : 500).json({
      success: false,
      message: error?.message || 'Failed to update developer issue',
    })
  }
}

export const retryDeveloperManifestController = async (req: any, res: Response) => {
  try {
    const adminUserId = req.user?.sub
    const orderId = String(req.body?.orderId || '').trim()
    const issueKey = req.body?.issueKey ? String(req.body.issueKey) : undefined
    const result = await retryFailedManifestServiceForAdmin({ orderId, issueKey, adminUserId })

    return res.status(200).json({
      success: true,
      data: result,
    })
  } catch (error: any) {
    console.error('Error retrying manifest from developer tab:', error?.message || error)
    return res.status(typeof error?.statusCode === 'number' ? error.statusCode : 500).json({
      success: false,
      message: error?.message || 'Failed to retry manifest',
    })
  }
}

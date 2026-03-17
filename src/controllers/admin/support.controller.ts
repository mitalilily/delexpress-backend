import { Request, Response } from 'express'
import {
  getAllTicketsService,
  getTicketByIdService,
  getTicketsForUserService,
  TicketStatus,
  updateTicketStatusService,
} from '../../models/services/support.service'

export const getAllTickets = async (req: Request, res: Response) => {
  try {
    const limit = parseInt(req.query.limit as string) || 20

    const page = parseInt(req.query.page as string) || 1
    const offset = (page - 1) * limit

    // Normalize all status values into a single array
    let status: TicketStatus[] | undefined = []

    const statusRaw = req.query['status[]'] ?? req.query.status

    if (Array.isArray(statusRaw)) {
      status = statusRaw.flat().filter(Boolean) as TicketStatus[]
    } else if (typeof statusRaw === 'string') {
      status = [statusRaw as TicketStatus]
    }

    // If still empty, set as undefined
    if (!status.length) status = undefined

    const filters = {
      status,
      category: req.query.category as string | undefined,
      subcategory: req.query.subcategory as string | undefined,
      awbNumber: req.query.awbNumber as string | undefined,
      userId: req.query.userId as string | undefined,
      userName: req.query.userName as string | undefined,
      subject: req.query.subject as string | undefined,
      sortBy: req.query.sortBy as string | undefined,
    }

    const { tickets, totalCount, statusCounts } = await getAllTicketsService(limit, offset, filters)

    res.json({
      success: true,
      data: tickets,
      totalCount,
      statusCounts,
      message: 'Fetched tickets successfully',
    })
  } catch (error) {
    console.error('[Admin] Get all tickets failed:', error)
    res.status(200).json({
      success: false,
      message: 'Failed to fetch support tickets.',
      data: [],
      statusCounts: {},
      totalCount: 0,
    })
  }
}

export const getTicketDetails = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const ticket = await getTicketByIdService(id, '', true)

    if (!ticket) return res.status(404).json({ message: 'Ticket not found' })
    res.status(200).json(ticket)
  } catch (err) {
    console.error('[Admin] Get ticket by ID failed:', err)
    res.status(500).json({ message: 'Internal server error' })
  }
}

export const updateTicketStatus = async (req: Request, res: Response) => {
  try {
    const { id } = req.params
    const { status, dueDate } = req.body

    const ticket = await updateTicketStatusService(id, {
      status,
      dueDate: dueDate ? new Date(dueDate) : undefined,
    })

    res.status(200).json(ticket)
  } catch (err) {
    console.error('[Admin] Update ticket status failed:', err)
    res.status(500).json({ message: 'Internal server error' })
  }
}

export const getTicketsByUserId = async (req: Request, res: Response) => {
  try {
    const userId = req.params.userId as string // assert to string
    const page = parseInt(req.query.page as string) || 1
    const perPage = parseInt(req.query.perPage as string) || 10

    const data = await getTicketsForUserService(userId, page, perPage)
    res.status(200).json(data)
  } catch (error) {
    console.error(error)
    res.status(500).json({ message: 'Error fetching tickets' })
  }
}

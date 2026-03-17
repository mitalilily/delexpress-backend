import { Response } from 'express'
import {
  getAllOrdersServiceAdmin,
  regenerateOrderDocumentsServiceAdmin,
} from '../../models/services/adminOrders.service'
import { buildCsv } from '../../utils/csv'

export const getAllOrdersControllerAdmin = async (req: any, res: Response) => {
  try {
    // Pagination params
    const page = parseInt(req.query.page as string, 10) || 1
    const limit = parseInt(req.query.limit as string, 10) || 10

    // Filters from query
    const filters = {
      status: req.query.status as string | undefined,
      fromDate: req.query.fromDate as string | undefined,
      toDate: req.query.toDate as string | undefined,
      search: req.query.search as string | undefined,
      userId: req.query.userId as string | undefined,
      sortBy: (req.query.sortBy as 'created_at' | undefined) || 'created_at',
      sortOrder: (req.query.sortOrder as 'asc' | 'desc' | undefined) || 'desc',
    }

    const { orders, totalCount, totalPages } = await getAllOrdersServiceAdmin({
      page,
      limit,
      filters,
    })

    res.status(200).json({ success: true, orders, totalCount, totalPages })
  } catch (error: any) {
    console.error('Error fetching all orders:', error.message)
    res.status(500).json({ success: false, message: error.message })
  }
}

export const exportOrdersControllerAdmin = async (req: any, res: Response) => {
  try {
    // Filters from query
    const filters = {
      status: req.query.status as string | undefined,
      fromDate: req.query.fromDate as string | undefined,
      toDate: req.query.toDate as string | undefined,
      search: req.query.search as string | undefined,
      userId: req.query.userId as string | undefined,
      sortBy: (req.query.sortBy as 'created_at' | undefined) || 'created_at',
      sortOrder: (req.query.sortOrder as 'asc' | 'desc' | undefined) || 'desc',
    }

    // Fetch all orders without pagination for export
    const { orders } = await getAllOrdersServiceAdmin({
      page: 1,
      limit: 100000, // Large limit to get all orders
      filters,
    })

    // Generate CSV
    const headers = [
      'Order ID',
      'AWB Number',
      'Customer Name',
      'Customer Phone',
      'Customer Email',
      'Status',
      'Order Type',
      'Amount',
      'Courier Partner',
      'Order Date',
      'City',
      'State',
      'Pincode',
      'Address',
    ]

    const rows = orders.map((order: any) => [
      order.order_id,
      order.awb_number,
      order.buyer_name,
      order.buyer_phone,
      order.buyer_email,
      order.order_status,
      order.order_type,
      order.order_amount,
      order.courier_partner,
      order.order_date,
      order.city,
      order.state,
      order.pincode,
      order.address,
    ])

    const csv = buildCsv(headers, rows)

    // Set headers for file download
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename=orders_export_${new Date().toISOString().split('T')[0]}.csv`)
    res.status(200).send(csv)
  } catch (error: any) {
    console.error('Error exporting orders:', error.message)
    res.status(500).json({ success: false, message: error.message })
  }
}

export const regenerateOrderDocumentsControllerAdmin = async (req: any, res: Response) => {
  try {
    const orderId = String(req.params.id || '').trim()
    if (!orderId) {
      return res.status(400).json({ success: false, message: 'Order ID is required' })
    }

    const regenerateLabel =
      typeof req.body?.regenerateLabel === 'boolean' ? req.body.regenerateLabel : true
    const regenerateInvoice =
      typeof req.body?.regenerateInvoice === 'boolean' ? req.body.regenerateInvoice : true

    const result = await regenerateOrderDocumentsServiceAdmin({
      orderId,
      regenerateLabel,
      regenerateInvoice,
    })

    return res.status(200).json({
      success: true,
      message: 'Order documents regenerated successfully',
      data: result,
    })
  } catch (error: any) {
    console.error('Error regenerating order documents:', error?.message || error)
    return res.status(400).json({
      success: false,
      message: error?.message || 'Failed to regenerate order documents',
    })
  }
}

import { Response } from 'express'
import { cancelOrderShipment } from '../models/services/pickup.service'

export const cancelShipment = async (req: any, res: Response) => {
  try {
    const { orderId } = req.body as { orderId: string }
    
    console.log('📋 Cancellation Request:', {
      orderId,
      userId: req.user?.sub,
      timestamp: new Date().toISOString(),
    })

    if (!orderId) {
      console.error('❌ Cancellation failed: Missing orderId')
      return res.status(400).json({ success: false, message: 'Order ID is required' })
    }

    const result = await cancelOrderShipment(orderId)
    
    console.log('✅ Cancellation Success Response:', {
      orderId,
      result: JSON.stringify(result, null, 2),
    })

    res.json({ 
      success: true, 
      message: 'Order cancellation requested successfully',
      result 
    })
  } catch (e: any) {
    console.error('❌ Cancellation Error:', {
      orderId: req.body?.orderId,
      error: e.message,
      stack: e.stack,
      response: e.response?.data,
      status: e.response?.status,
      fullError: JSON.stringify(e, null, 2),
    })
    
    const errorMessage = e.message || 'Failed to cancel order'
    const statusCode = e.response?.status || 400
    
    res.status(statusCode).json({ 
      success: false, 
      message: errorMessage,
      error: e.response?.data || e.message,
    })
  }
}

import { Request, Response } from 'express'
import { createB2CShipmentService } from '../models/services/shiprocket.service'
import { quoteReverseForOrder } from '../models/services/reverse.service'
import { db } from '../models/client'
import { wallets } from '../models/schema/wallet'
import { eq } from 'drizzle-orm'
import { createWalletTransaction } from '../models/services/wallet.service'

export const createReversePickup = async (req: any, res: Response) => {
  try {
    const userId = req.user?.sub
    const body = req.body || {}

    const payload = {
      ...body,
      payment_type: 'reverse',
    }
    // Quote reverse charge and debit wallet
    let reverseCharge = 0
    try {
      const orderId = body?.original_order_id || body?.order_id || body?.orderId
      if (orderId) {
        const quote = await quoteReverseForOrder(orderId, Number(body?.package_weight))
        reverseCharge = Number(quote.rate || 0)
        payload.selected_max_slab_weight = quote.max_slab_weight ?? undefined
        payload.freight_charges = reverseCharge
      }
    } catch (e) {
      // optional: keep zero if not found
    }

    if (reverseCharge > 0) {
      const [userWallet] = await db.select().from(wallets).where(eq(wallets.userId, userId)).limit(1)
      if (!userWallet) throw new Error('Wallet not found')
      if (Number(userWallet.balance || 0) < reverseCharge) {
        return res.status(400).json({ success: false, message: 'Insufficient wallet balance for reverse shipment' })
      }
      await createWalletTransaction({ walletId: userWallet.id, amount: reverseCharge, type: 'debit', reason: 'reverse_shipment', meta: { order_number: payload.order_number } })
      payload.shipping_charges = reverseCharge
    }

    const shipment = await createB2CShipmentService(payload, userId)
    res.status(200).json({ success: true, shipment })
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message })
  }
}

export const quoteReverse = async (req: any, res: Response) => {
  try {
    const { orderId, weightGrams } = req.body
    if (!orderId) return res.status(400).json({ success: false, message: 'orderId required' })
    const quote = await quoteReverseForOrder(orderId, weightGrams ? Number(weightGrams) : undefined)
    return res.json({ success: true, quote })
  } catch (e: any) {
    return res.status(400).json({ success: false, message: e.message })
  }
}

import { Request, Response } from 'express'
import {
  processShopifyWebhookOrder,
  syncShopifyOrdersForUser,
  verifyShopifyWebhookSignatureForDomain,
} from '../models/services/shopify.service'

export const syncShopifyOrdersController = async (req: any, res: Response): Promise<any> => {
  try {
    const userId = req.user?.sub
    if (!userId) return res.status(401).json({ error: 'Unauthorized' })

    const rawLimit = Number(req.body?.limit ?? req.query?.limit ?? 50)
    const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 250) : 50
    const storeId = String(req.body?.storeId ?? req.query?.storeId ?? '').trim() || undefined

    const result = await syncShopifyOrdersForUser(userId, limit, storeId)
    return res.status(200).json({
      success: true,
      message: 'Shopify orders synced successfully',
      ...result,
    })
  } catch (error: any) {
    console.error('Shopify sync failed:', error)
    return res.status(500).json({
      success: false,
      error: error?.message || 'Failed to sync Shopify orders',
    })
  }
}

export const shopifyOrderWebhookController = async (req: Request, res: Response): Promise<any> => {
  try {
    const rawBody: Buffer = req.body as Buffer
    const hmac = String(req.headers['x-shopify-hmac-sha256'] || '')
    const topic = String(req.headers['x-shopify-topic'] || '')
    const shopDomain = String(req.headers['x-shopify-shop-domain'] || '')

    if (!rawBody || !Buffer.isBuffer(rawBody)) {
      return res.status(400).json({ success: false, error: 'Invalid webhook payload' })
    }

    const isValid = await verifyShopifyWebhookSignatureForDomain(rawBody, hmac, shopDomain)
    if (!isValid) {
      return res.status(401).json({ success: false, error: 'Invalid Shopify webhook signature' })
    }

    const payload = JSON.parse(rawBody.toString('utf8') || '{}')
    const result = await processShopifyWebhookOrder(shopDomain, topic, payload)
    return res.status(200).json({ success: true, result })
  } catch (error: any) {
    console.error('Shopify webhook handling failed:', error)
    return res.status(500).json({
      success: false,
      error: error?.message || 'Failed to process Shopify webhook',
    })
  }
}

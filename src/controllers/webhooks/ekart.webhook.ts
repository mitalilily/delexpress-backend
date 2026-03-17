import { Request, Response } from 'express'
import { eq } from 'drizzle-orm'
import { db } from '../../models/client'
import { processEkartWebhook } from '../../models/services/webhookProcessor'
import { courier_credentials } from '../../models/schema/courierCredentials'
import crypto from 'crypto'

const EKART_WEBHOOK_SECRET_HEADERS = [
  'x-ekart-webhook-secret',
  'x-ekart-webhook-signature',
  'x-ekart-signature',
]

const EKART_PROVIDER = 'ekart'

const findSecretHeader = (headers: Request['headers']) => {
  const normalized = headers as Record<string, string | string[] | undefined>
  for (const header of EKART_WEBHOOK_SECRET_HEADERS) {
    const value = normalized[header] || normalized[header.toLowerCase()]
    if (!value) continue
    if (Array.isArray(value) && value.length) return String(value[0]).trim()
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return ''
}

const fetchEkartWebhookSecret = async () => {
  try {
    const [row] = await db
      .select({
        webhookSecret: courier_credentials.webhookSecret,
      })
      .from(courier_credentials)
      .where(eq(courier_credentials.provider, EKART_PROVIDER))
      .limit(1)
    return (row?.webhookSecret || '').trim()
  } catch (err: any) {
    console.error('❌ Failed to load Ekart webhook secret:', err?.message || err)
    return ''
  }
}

export const ekartWebhookHandler = async (req: Request, res: Response) => {
  const payload = req.body
  const configuredSecret = await fetchEkartWebhookSecret()
  const receivedSecret = findSecretHeader(req.headers)
  const rawBody =
    (req as any).rawBody || (req.body ? JSON.stringify(req.body) : '')

  if (configuredSecret) {
    if (!receivedSecret) {
      console.warn('⚠️ Ekart webhook missing signature header; skipping verification')
    } else {
      const expected = 'sha256=' + crypto.createHmac('sha256', configuredSecret).update(rawBody).digest('hex')
      const provided = receivedSecret.startsWith('sha256=') ? receivedSecret : `sha256=${receivedSecret}`
      const expectedBuf = Buffer.from(expected)
      const providedBuf = Buffer.from(provided)
      if (expectedBuf.length !== providedBuf.length) {
        console.warn('⚠️ Ekart webhook rejected: signature length mismatch')
        return res.status(401).json({ success: false, message: 'invalid signature' })
      }
      if (!crypto.timingSafeEqual(expectedBuf, providedBuf)) {
        console.warn('⚠️ Ekart webhook rejected: invalid signature', { provided })
        return res.status(401).json({ success: false, message: 'invalid signature' })
      }
    }
  } else if (receivedSecret) {
    console.info(
      'ℹ️ Ekart webhook header received but no secret configured locally; payload will be accepted.',
    )
  }
  const awb =
    payload?.tracking_id ||
    payload?.trackingId ||
    payload?.awb ||
    payload?.waybill ||
    payload?.wbn ||
    payload?.barcodes?.wbn ||
    'unknown'

  console.log('='.repeat(80))
  console.log(`📦 [Ekart] Webhook Received - AWB: ${awb}`)
  console.log(`Headers:`, JSON.stringify(req.headers, null, 2))
  console.log(`Payload:`, JSON.stringify(payload, null, 2))
  console.log('='.repeat(80))

  try {
    const result = await processEkartWebhook(payload)

    if (!result.success && result.reason === 'order_not_found') {
      return res.status(202).json({ success: true, queued: true })
    }

    if (!result.success) {
      return res.status(202).json({ success: false, reason: result.reason })
    }

    return res.status(200).json({ success: true })
  } catch (err: any) {
    console.error('❌ Ekart webhook processing failed:', err?.message || err)
    return res.status(500).json({ success: false, message: 'Internal Server Error' })
  }
}

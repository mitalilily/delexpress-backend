import { Request, Response } from 'express'
import { and, eq, gte, isNull } from 'drizzle-orm'
import { db } from '../../models/client'
import {
  processDelhiveryDocumentWebhook,
  processDelhiveryWebhook,
} from '../../models/services/webhookProcessor'
import { pending_webhooks } from '../../schema/schema'

/**
 * Delhivery Scan Push Webhook Handler
 * Handles shipment status updates (Manifested, In Transit, Delivered, RTO, etc.)
 */
export const delhiveryScanPushHandler = async (req: Request, res: Response) => {
  const timestamp = new Date().toISOString()
  const payload = req.body
  const shipment = payload?.Shipment
  const awb = shipment?.AWB || payload?.waybill || payload?.AWB || null
  const status = shipment?.Status?.Status || payload?.status || 'unknown'

  console.log('='.repeat(80))
  console.log(`📦 [${timestamp}] Delhivery Scan Push Webhook Received`)
  console.log(`   AWB: ${awb || 'N/A'}`)
  console.log(`   Status: ${status}`)
  console.log(`   IP: ${req.ip || req.socket.remoteAddress || 'unknown'}`)
  console.log(`   Headers:`, JSON.stringify(req.headers, null, 2))
  console.log(`   Full Payload:`, JSON.stringify(payload, null, 2))
  console.log('='.repeat(80))

  try {
    if (!awb) {
      console.error(`❌ Delhivery scan push webhook rejected: Missing AWB/waybill`)
      return res.status(400).json({ message: 'Missing AWB/waybill' })
    }

    console.log(`🔄 Processing Delhivery scan push webhook for AWB: ${awb}, Status: ${status}`)
    const result = await processDelhiveryWebhook(payload)

    // If order doesn't exist yet → store webhook for retry
    if (!result.success && result.reason === 'order_not_found') {
      const dedupeWindowStart = new Date(Date.now() - 10 * 60 * 1000)
      const [existingPending] = await db
        .select({ id: pending_webhooks.id })
        .from(pending_webhooks)
        .where(
          and(
            eq(pending_webhooks.awb_number, String(awb)),
            eq(pending_webhooks.status, String(status || 'unknown')),
            isNull(pending_webhooks.processed_at),
            gte(pending_webhooks.created_at, dedupeWindowStart),
          ),
        )
        .limit(1)

      if (!existingPending) {
        await db.insert(pending_webhooks).values({
          awb_number: awb,
          status: status,
          payload,
        })
        console.warn(
          `⚠️ Stored Delhivery scan push webhook for AWB ${awb} (order not yet created).`,
        )
      } else {
        console.warn(`⚠️ Duplicate pending webhook skipped for AWB ${awb} (within dedupe window).`)
      }
      return res.status(202).json({ success: true, queued: true })
    }

    // Respond OK for successful handling
    if (result.success) {
      console.log(`✅ Delhivery scan push webhook processed successfully for AWB: ${awb}`)
      return res.status(200).json({ success: true })
    }

    // Handle known soft errors (e.g. invalid status)
    console.warn(
      `⚠️ Delhivery scan push webhook partially processed for AWB: ${awb}, reason: ${result.reason}`,
    )
    return res.status(202).json({ success: false })
  } catch (err: any) {
    console.error('='.repeat(80))
    console.error(
      `❌ [${timestamp}] Delhivery scan push webhook error for AWB: ${awb || 'unknown'}`,
    )
    console.error(`   Error Message: ${err?.message || err}`)
    console.error(`   Error Stack:`, err?.stack)
    console.error(`   Payload:`, JSON.stringify(payload, null, 2))
    console.error('='.repeat(80))
    return res.status(500).json({ message: 'Internal Server Error' })
  }
}

/**
 * Delhivery Document Push Webhook Handler
 * Handles POD, Sorter Image, and QC Image document pushes
 */
export const delhiveryDocumentPushHandler = async (req: Request, res: Response) => {
  const timestamp = new Date().toISOString()
  const payload = req.body
  const shipment = payload?.Shipment || payload
  const awb = shipment?.AWB || payload?.AWB || payload?.waybill || null

  // Detect document type
  const documentType =
    payload?.DocumentType ||
    (payload?.PODDocument || shipment?.PODDocument ? 'POD' : null) ||
    (payload?.SorterImage || shipment?.SorterImage ? 'SorterImage' : null) ||
    (payload?.QCImage || shipment?.QCImage ? 'QCImage' : null)

  console.log('='.repeat(80))
  console.log(`📄 [${timestamp}] Delhivery Document Push Webhook Received`)
  console.log(`   Type: ${documentType || 'Unknown'}`)
  console.log(`   AWB: ${awb || 'N/A'}`)
  console.log(`   IP: ${req.ip || req.socket.remoteAddress || 'unknown'}`)
  console.log(`   Headers:`, JSON.stringify(req.headers, null, 2))
  console.log(`   Full Payload:`, JSON.stringify(payload, null, 2))
  console.log('='.repeat(80))

  try {
    if (!awb) {
      console.error(`❌ Delhivery document push webhook rejected: Missing AWB/waybill`)
      return res.status(400).json({ message: 'Missing AWB/waybill' })
    }

    console.log(
      `📄 Processing Delhivery document push webhook for AWB: ${awb}, Type: ${documentType}`,
    )
    const result = await processDelhiveryDocumentWebhook(payload, documentType)

    if (result.success) {
      console.log(`✅ Delhivery document push webhook processed successfully for AWB: ${awb}`)
      return res.status(200).json({ success: true })
    }

    console.warn(`⚠️ Delhivery document push webhook partially processed for AWB: ${awb}`)
    return res.status(202).json({ success: false })
  } catch (err: any) {
    console.error('='.repeat(80))
    console.error(
      `❌ [${timestamp}] Delhivery document push webhook error for AWB: ${awb || 'unknown'}`,
    )
    console.error(`   Error Message: ${err?.message || err}`)
    console.error(`   Error Stack:`, err?.stack)
    console.error(`   Payload:`, JSON.stringify(payload, null, 2))
    console.error('='.repeat(80))
    return res.status(500).json({ message: 'Internal Server Error' })
  }
}

/**
 * Legacy unified webhook handler (for backward compatibility)
 * Auto-detects webhook type and routes accordingly
 * @deprecated Use delhiveryScanPushHandler or delhiveryDocumentPushHandler instead
 */
export const delhiveryWebhookHandler = async (req: Request, res: Response) => {
  const timestamp = new Date().toISOString()
  const payload = req.body
  const shipment = payload?.Shipment
  const awb = shipment?.AWB || payload?.waybill || payload?.AWB || null
  const status = shipment?.Status?.Status || payload?.status || 'unknown'

  // Detect webhook type: Scan Push (status update) vs Document Push (POD, Sorter Image, QC Image)
  const isDocumentPush =
    payload?.DocumentType ||
    payload?.PODDocument ||
    payload?.SorterImage ||
    payload?.QCImage ||
    shipment?.PODDocument ||
    shipment?.SorterImage ||
    shipment?.QCImage

  const documentType =
    payload?.DocumentType ||
    (payload?.PODDocument || shipment?.PODDocument ? 'POD' : null) ||
    (payload?.SorterImage || shipment?.SorterImage ? 'SorterImage' : null) ||
    (payload?.QCImage || shipment?.QCImage ? 'QCImage' : null)

  console.log('='.repeat(80))
  console.log(`📦 [${timestamp}] Delhivery Webhook Received`)
  console.log(
    `   Type: ${isDocumentPush ? `Document Push (${documentType})` : 'Scan Push (Status Update)'}`,
  )
  console.log(`   AWB: ${awb || 'N/A'}`)
  console.log(`   Status: ${status}`)
  console.log(`   IP: ${req.ip || req.socket.remoteAddress || 'unknown'}`)
  console.log(`   Headers:`, JSON.stringify(req.headers, null, 2))
  console.log(`   Full Payload:`, JSON.stringify(payload, null, 2))
  console.log('='.repeat(80))

  try {
    if (!awb) {
      console.error(`❌ Delhivery webhook rejected: Missing AWB/waybill`)
      return res.status(400).json({ message: 'Missing AWB/waybill' })
    }

    // Route to appropriate processor based on webhook type
    if (isDocumentPush) {
      console.log(
        `📄 Processing Delhivery document push webhook for AWB: ${awb}, Type: ${documentType}`,
      )
      const result = await processDelhiveryDocumentWebhook(payload, documentType)

      if (result.success) {
        console.log(`✅ Delhivery document webhook processed successfully for AWB: ${awb}`)
        return res.status(200).json({ success: true })
      }

      console.warn(`⚠️ Delhivery document webhook partially processed for AWB: ${awb}`)
      return res.status(202).json({ success: false })
    }

    console.log(`🔄 Processing Delhivery scan push webhook for AWB: ${awb}, Status: ${status}`)
    // Process the webhook payload (updates order, label, pickup, etc.)
    const result = await processDelhiveryWebhook(payload)

    // If order doesn't exist yet → store webhook for retry
    if (!result.success && result.reason === 'order_not_found') {
      const dedupeWindowStart = new Date(Date.now() - 10 * 60 * 1000)
      const [existingPending] = await db
        .select({ id: pending_webhooks.id })
        .from(pending_webhooks)
        .where(
          and(
            eq(pending_webhooks.awb_number, String(awb)),
            eq(pending_webhooks.status, String(status || 'unknown')),
            isNull(pending_webhooks.processed_at),
            gte(pending_webhooks.created_at, dedupeWindowStart),
          ),
        )
        .limit(1)

      if (!existingPending) {
        await db.insert(pending_webhooks).values({
          awb_number: awb,
          status: status,
          payload,
        })
        console.warn(`⚠️ Stored Delhivery webhook for AWB ${awb} (order not yet created).`)
      } else {
        console.warn(`⚠️ Duplicate pending webhook skipped for AWB ${awb} (within dedupe window).`)
      }
      return res.status(202).json({ success: true, queued: true })
    }

    // Respond OK for successful handling
    if (result.success) {
      console.log(`✅ Delhivery webhook processed successfully for AWB: ${awb}`)
      return res.status(200).json({ success: true })
    }

    // Handle known soft errors (e.g. invalid status)
    console.warn(
      `⚠️ Delhivery webhook partially processed for AWB: ${awb}, reason: ${result.reason}`,
    )
    return res.status(202).json({ success: false })
  } catch (err: any) {
    console.error('='.repeat(80))
    console.error(`❌ [${timestamp}] Delhivery webhook error for AWB: ${awb || 'unknown'}`)
    console.error(`   Error Message: ${err?.message || err}`)
    console.error(`   Error Stack:`, err?.stack)
    console.error(`   Payload:`, JSON.stringify(payload, null, 2))
    console.error('='.repeat(80))
    return res.status(500).json({ message: 'Internal Server Error' })
  }
}

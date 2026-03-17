// scripts/processPendingWebhooks.ts
import { and, asc, eq, inArray, isNull } from 'drizzle-orm'
import { db } from '../models/client'
import {
  processDelhiveryWebhook,
  processXpressbeesWebhook,
} from '../models/services/webhookProcessor'
import { pending_webhooks } from '../schema/schema'

const MAX_EVENTS_PER_RUN = Number(process.env.PENDING_WEBHOOK_MAX_PER_RUN || 100)
const MAX_PENDING_AGE_MINUTES = Number(process.env.PENDING_WEBHOOK_MAX_AGE_MINUTES || 180)
const MAX_PENDING_DUPLICATE_RETRIES = Number(
  process.env.PENDING_WEBHOOK_MAX_DUPLICATE_RETRIES || 5,
)
let isProcessingPendingWebhooks = false

export async function processPendingWebhooks() {
  if (isProcessingPendingWebhooks) {
    console.log('⏭️ Skipping pending webhook run: previous run still in progress')
    return
  }

  isProcessingPendingWebhooks = true

  try {
    const events = await db
      .select()
      .from(pending_webhooks)
      .where(isNull(pending_webhooks.processed_at))
      .orderBy(asc(pending_webhooks.created_at))
      .limit(MAX_EVENTS_PER_RUN)

    if (!events.length) {
      return
    }

    console.log(`🔄 Processing pending webhooks... count=${events.length}`)

    const pendingCounts = new Map<string, number>()
    const pendingIdsByKey = new Map<string, string[]>()
    for (const event of events) {
      const payload: any = event.payload || {}
      const provider =
        payload?.__provider || (String(event.status || '').startsWith('xpressbees:') ? 'xpressbees' : 'delhivery')
      const rawPayload = payload?.__provider === 'xpressbees' ? payload?.body || {} : payload
      const awb =
        event.awb_number ||
        rawPayload?.Shipment?.AWB ||
        rawPayload?.AWB ||
        rawPayload?.waybill ||
        rawPayload?.awb_number ||
        rawPayload?.awb

      if (!awb) continue
      const key = `${provider}:${String(awb)}`
      pendingCounts.set(key, (pendingCounts.get(key) || 0) + 1)
      if (!pendingIdsByKey.has(key)) pendingIdsByKey.set(key, [])
      pendingIdsByKey.get(key)!.push(event.id)
    }

    let processedCount = 0
    let deferredCount = 0
    let skippedCount = 0
    let expiredCount = 0
    const thresholdClosedKeys = new Set<string>()

    for (const event of events) {
      const payload: any = event.payload || {}
      const provider = payload?.__provider || (String(event.status || '').startsWith('xpressbees:') ? 'xpressbees' : 'delhivery')
      const rawPayload = payload?.__provider === 'xpressbees' ? payload?.body || {} : payload
      const awb =
        event.awb_number ||
        rawPayload?.Shipment?.AWB ||
        rawPayload?.AWB ||
        rawPayload?.waybill ||
        rawPayload?.awb_number ||
        rawPayload?.awb
      const pendingKey = awb ? `${provider}:${String(awb)}` : null
      const createdAt = event.created_at ? new Date(event.created_at) : new Date()
      const ageMs = Date.now() - createdAt.getTime()
      const ageMinutes = Math.floor(ageMs / 60000)

      try {
        if (
          pendingKey &&
          !thresholdClosedKeys.has(pendingKey) &&
          Number(pendingCounts.get(pendingKey) || 0) >= MAX_PENDING_DUPLICATE_RETRIES
        ) {
          const duplicateCount = Number(pendingCounts.get(pendingKey) || 0)
          const pendingIds = pendingIdsByKey.get(pendingKey) || []
          const deletedRows =
            pendingIds.length > 0
              ? await db
                  .delete(pending_webhooks)
                  .where(inArray(pending_webhooks.id, pendingIds))
                  .returning({ id: pending_webhooks.id })
              : []

          thresholdClosedKeys.add(pendingKey)
          expiredCount += deletedRows.length
          console.warn(
            `⌛ Deleted pending webhook queue for ${pendingKey} after ${duplicateCount} repeated pending entries`,
          )
          continue
        }

        const looksLikeDelhivery =
          provider === 'delhivery' &&
          (!!rawPayload?.Shipment ||
            typeof rawPayload?.waybill === 'string' ||
            typeof rawPayload?.AWB === 'string' ||
            typeof awb === 'string')
        const looksLikeXpressbees =
          provider === 'xpressbees' &&
          (typeof rawPayload?.awb_number === 'string' ||
            typeof rawPayload?.awb === 'string' ||
            typeof rawPayload?.order_number === 'string' ||
            typeof rawPayload?.order_id === 'string' ||
            typeof awb === 'string')

        if (!looksLikeDelhivery && !looksLikeXpressbees) {
          console.warn(`⚠️ Skipping unsupported pending webhook ${event.id} (AWB: ${awb || 'N/A'})`)
          skippedCount++
          await db
            .update(pending_webhooks)
            .set({ processed_at: new Date(), status: 'skipped_unsupported' })
            .where(eq(pending_webhooks.id, event.id))
          continue
        }

        const result =
          provider === 'xpressbees'
            ? await processXpressbeesWebhook(rawPayload)
            : await processDelhiveryWebhook(rawPayload)

        if (result.success) {
          processedCount++
          await db
            .update(pending_webhooks)
            .set({ processed_at: new Date(), status: 'processed' })
            .where(eq(pending_webhooks.id, event.id))
          console.log(
            `✅ Replayed pending ${provider === 'xpressbees' ? 'Xpressbees' : 'Delhivery'} webhook for AWB ${awb}`,
          )
          continue
        }

        // Keep in queue only while within max age and order is still not present.
        if (result.reason === 'order_not_found') {
          if (ageMinutes >= MAX_PENDING_AGE_MINUTES) {
            expiredCount++
            await db
              .update(pending_webhooks)
              .set({ processed_at: new Date(), status: 'expired_order_not_found' })
              .where(eq(pending_webhooks.id, event.id))
            console.warn(
              `⌛ Expired pending ${provider === 'xpressbees' ? 'Xpressbees' : 'Delhivery'} webhook for AWB ${awb} after ${ageMinutes}m (order still missing)`,
            )
          } else {
            deferredCount++
            console.log(
              `⏳ Delaying pending ${provider === 'xpressbees' ? 'Xpressbees' : 'Delhivery'} webhook for AWB ${awb}: order still missing`,
            )
          }
          continue
        }

        // For hard-invalid payloads, mark processed to avoid infinite retries.
        skippedCount++
        await db
          .update(pending_webhooks)
          .set({ processed_at: new Date(), status: `skipped_${result.reason || 'unknown'}` })
          .where(eq(pending_webhooks.id, event.id))
        console.warn(
          `⚠️ Marked pending webhook as processed for AWB ${awb} due to non-retryable reason: ${result.reason}`,
        )
      } catch (error: any) {
        // Keep row pending on runtime failures only up to max age.
        if (ageMinutes >= MAX_PENDING_AGE_MINUTES) {
          expiredCount++
          await db
            .update(pending_webhooks)
            .set({ processed_at: new Date(), status: 'expired_runtime_error' })
            .where(eq(pending_webhooks.id, event.id))
          console.error(
            `⌛ Expired pending webhook ${event.id} (AWB: ${awb || 'N/A'}) after runtime failures for ${ageMinutes}m`,
          )
        } else {
          deferredCount++
          console.error(
            `❌ Failed processing pending webhook ${event.id} (AWB: ${awb || 'N/A'}):`,
            error?.message || error,
          )
        }
      }
    }

    console.log(
      `📊 Pending webhook run complete: processed=${processedCount}, deferred=${deferredCount}, skipped=${skippedCount}, expired=${expiredCount}, batch_limit=${MAX_EVENTS_PER_RUN}`,
    )
  } finally {
    isProcessingPendingWebhooks = false
  }
}

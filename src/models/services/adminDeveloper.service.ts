import { desc, eq, inArray, sql } from 'drizzle-orm'
import { HttpError } from '../../utils/classes'
import { db } from '../client'
import { retryFailedManifestService } from './shiprocket.service'
import { b2c_orders } from '../schema/b2cOrders'
import { developer_issue_audit_logs } from '../schema/developerIssueAuditLogs'
import { developer_issue_states } from '../schema/developerIssueStates'
import { pending_webhooks } from '../schema/pendingWebhooks'
import { userProfiles } from '../schema/userProfile'
import { users } from '../schema/users'
import { webhook_deliveries, webhook_subscriptions } from '../schema/webhookSubscriptions'

type DeveloperErrorSource =
  | 'manifest_failure'
  | 'pickup_failure'
  | 'pending_webhook'
  | 'webhook_delivery_failed'

type DeveloperIssueStatus = 'open' | 'resolved'
type DeveloperIssuePriority = 'high' | 'medium' | 'low'
type DeveloperIssueOwner = 'merchant' | 'courier' | 'platform' | 'unknown'
type DeveloperActionRequired = 'retry' | 'contact_merchant' | 'fix_data' | 'ignore' | 'escalate'

interface DeveloperErrorFilters {
  source?: string
  status?: string
  priority?: string
  search?: string
  fromDate?: string
  toDate?: string
  courier?: string
  merchant?: string
  issueOwner?: string
  actionRequired?: string
  actionable?: string
  rootCause?: string
}

interface RelatedOrder {
  id: string
  order_number: string | null
  awb_number: string | null
  buyer_name: string | null
  buyer_phone: string | null
  order_status: string | null
  occurrence_count: number
  can_retry_manifest: boolean
  manifest_retry_count: number
  updated_at: Date | null
  created_at: Date | null
}

interface DeveloperIssueCandidate {
  issue_key: string
  source: DeveloperErrorSource
  source_label: string
  priority_default: DeveloperIssuePriority
  issue_owner: DeveloperIssueOwner
  action_required: DeveloperActionRequired
  root_cause_key: string
  root_cause_label: string
  title: string
  where_it_happened: string
  how_it_happened: string
  for_whom: string
  summary: string
  recommendation: string
  why_this_matters: string
  raw_error: string
  raw_payload: string
  merchant_user_id: string | null
  merchant_name: string | null
  merchant_email: string | null
  buyer_name: string | null
  buyer_phone: string | null
  order_id: string | null
  order_number: string | null
  awb_number: string | null
  courier_partner: string | null
  status: string | null
  first_seen_at: Date | null
  last_seen_at: Date | null
  occurrence_count: number
  affected_order_count: number
  can_retry_manifest: boolean
  retryable_order_count: number
  related_orders: RelatedOrder[]
  related_pending_webhooks: Array<{
    id: string
    awb_number: string | null
    status: string | null
    created_at: Date | null
  }>
  related_webhook_deliveries: Array<{
    id: string
    event_type: string | null
    event_id: string | null
    http_status: number | null
    attempt_count: number
    max_attempts: number
    failed_at: Date | null
  }>
  related_record_refs: {
    order_ids: string[]
    pending_webhook_ids: string[]
    webhook_delivery_ids: string[]
    merchant_user_id: string | null
  }
}

interface DeveloperIssueRow extends DeveloperIssueCandidate {
  status_label: DeveloperIssueStatus
  priority: DeveloperIssuePriority
  owner_admin_id: string | null
  owner_admin_name: string | null
  owner_admin_email: string | null
  resolved_by_admin_id: string | null
  resolved_by_admin_name: string | null
  resolved_by_admin_email: string | null
  resolved_at: Date | null
  alert_seen_at: Date | null
  has_new_alert: boolean
  actionable: boolean
  audit_trail: DeveloperIssueAuditLogRow[]
}

interface DeveloperIssueAuditLogRow {
  id: string
  action: string
  note: string | null
  created_at: Date | null
  admin_user_id: string | null
  admin_name: string | null
  admin_email: string | null
  metadata: Record<string, any> | null
}

const PRIORITY_WEIGHT: Record<DeveloperIssuePriority, number> = {
  high: 3,
  medium: 2,
  low: 1,
}

const ISSUE_OWNER_LABELS: Record<DeveloperIssueOwner, string> = {
  merchant: 'Merchant',
  courier: 'Courier',
  platform: 'Platform',
  unknown: 'Unknown',
}

const ACTION_REQUIRED_LABELS: Record<DeveloperActionRequired, string> = {
  retry: 'Retry',
  contact_merchant: 'Contact merchant',
  fix_data: 'Fix data',
  ignore: 'Ignore',
  escalate: 'Escalate',
}
const MAX_PENDING_DUPLICATE_RETRIES = Number(
  process.env.PENDING_WEBHOOK_MAX_DUPLICATE_RETRIES || 5,
)

const toDateSafe = (value: unknown): Date | null => {
  if (!value) return null
  const date = value instanceof Date ? value : new Date(String(value))
  return Number.isNaN(date.getTime()) ? null : date
}

const trimText = (value: unknown, fallback = '') => {
  if (typeof value !== 'string') return fallback
  return value.trim()
}

const clampText = (value: string, max = 600) => {
  if (value.length <= max) return value
  return `${value.slice(0, Math.max(0, max - 3))}...`
}

const stringifyJson = (value: unknown) => {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value ?? '')
  }
}

const normalizeKeyPart = (value: unknown) => {
  const normalized = trimText(value, 'unknown')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  return normalized || 'unknown'
}

const getMerchantName = (profile: any, user: any) => {
  return (
    profile?.companyInfo?.brandName ||
    profile?.companyInfo?.companyName ||
    profile?.companyInfo?.displayName ||
    user?.email ||
    user?.phone ||
    null
  )
}

const getUserDisplayName = (user: any) => user?.email || user?.phone || null

const buildForWhom = ({
  merchantName,
  merchantEmail,
  buyerName,
  buyerPhone,
  orderNumber,
  awbNumber,
  affectedOrderCount,
}: {
  merchantName?: string | null
  merchantEmail?: string | null
  buyerName?: string | null
  buyerPhone?: string | null
  orderNumber?: string | null
  awbNumber?: string | null
  affectedOrderCount?: number
}) => {
  const merchantPart = merchantName
    ? `Merchant: ${merchantName}${merchantEmail ? ` (${merchantEmail})` : ''}`
    : merchantEmail
      ? `Merchant: ${merchantEmail}`
      : 'Merchant: Unknown'
  const customerPart = buyerName
    ? `Customer: ${buyerName}${buyerPhone ? ` (${buyerPhone})` : ''}`
    : null
  const orderPart = orderNumber ? `Latest order: ${orderNumber}` : null
  const awbPart = awbNumber ? `Latest AWB: ${awbNumber}` : null
  const countPart = affectedOrderCount && affectedOrderCount > 1 ? `Affected orders: ${affectedOrderCount}` : null
  return [merchantPart, customerPart, orderPart, awbPart, countPart].filter(Boolean).join(' | ')
}

const makeIssueKey = (source: DeveloperErrorSource, parts: Array<string | null | undefined>) =>
  `${source}:${parts.map((part) => normalizeKeyPart(part)).filter(Boolean).join(':')}`

const getLatestByDate = <T>(rows: T[], selector: (row: T) => Date | null) => {
  return rows
    .slice()
    .sort((a, b) => (selector(b)?.getTime() ?? 0) - (selector(a)?.getTime() ?? 0))[0]
}

const getEarliestDate = (dates: Array<Date | null>) =>
  dates
    .filter(Boolean)
    .sort((a, b) => (a as Date).getTime() - (b as Date).getTime())[0] ?? null

const getLatestDate = (dates: Array<Date | null>) =>
  dates
    .filter(Boolean)
    .sort((a, b) => (b as Date).getTime() - (a as Date).getTime())[0] ?? null

const getAgeHours = (date: Date | null) => {
  if (!date) return 0
  return (Date.now() - date.getTime()) / (1000 * 60 * 60)
}

const buildRelatedOrder = (order: any): RelatedOrder => {
  const retryCount = Number(order.manifest_retry_count ?? 0)
  return {
    id: order.id,
    order_number: order.order_number ?? null,
    awb_number: order.awb_number ?? null,
    buyer_name: order.buyer_name ?? null,
    buyer_phone: order.buyer_phone ?? null,
    order_status: order.order_status ?? null,
    occurrence_count: Math.max(1, retryCount + (trimText(order.manifest_error) ? 1 : 0)),
    can_retry_manifest:
      trimText(order.manifest_error).length > 0 &&
      String(order.order_status || '').toLowerCase() === 'manifest_failed' &&
      !order.awb_number &&
      String(order.integration_type || '').toLowerCase() === 'delhivery' &&
      retryCount < 3,
    manifest_retry_count: retryCount,
    updated_at: toDateSafe(order.updated_at ?? order.created_at),
    created_at: toDateSafe(order.created_at),
  }
}

const classifyManifestIssue = (message: string, retryCount = 0) => {
  const normalized = message.toLowerCase()

  if (normalized.includes('non serviceable pincode')) {
    return {
      rootCauseKey: 'non_serviceable_pincode',
      rootCauseLabel: 'Non-serviceable pincode',
      issueOwner: 'merchant' as DeveloperIssueOwner,
      actionRequired: 'contact_merchant' as DeveloperActionRequired,
      priority: 'high' as DeveloperIssuePriority,
      summary:
        'Courier rejected the shipment because the destination or pickup pincode is not serviceable.',
      recommendation:
        'Ask the merchant to change courier, address, or payment mode before trying again.',
      whyThisMatters: 'Shipment blocked',
    }
  }

  if (normalized.includes('invoice_number')) {
    return {
      rootCauseKey: 'missing_invoice',
      rootCauseLabel: 'Missing invoice',
      issueOwner: 'merchant' as DeveloperIssueOwner,
      actionRequired: 'fix_data' as DeveloperActionRequired,
      priority: 'high' as DeveloperIssuePriority,
      summary: 'Courier booking failed because invoice details required by the courier are missing or invalid.',
      recommendation: 'Fix invoice number/date on the order, then retry the manifest.',
      whyThisMatters: 'Shipment blocked',
    }
  }

  if (normalized.includes('hsn')) {
    return {
      rootCauseKey: 'missing_hsn',
      rootCauseLabel: 'Missing HSN',
      issueOwner: 'merchant' as DeveloperIssueOwner,
      actionRequired: 'fix_data' as DeveloperActionRequired,
      priority: 'high' as DeveloperIssuePriority,
      summary: 'Courier booking failed because product HSN details required by the courier are missing or invalid.',
      recommendation: 'Fix HSN or product tax data, then retry the manifest.',
      whyThisMatters: 'Shipment blocked',
    }
  }

  if (normalized.includes('internal error')) {
    return {
      rootCauseKey: 'courier_internal_error',
      rootCauseLabel: 'Courier internal error',
      issueOwner: 'courier' as DeveloperIssueOwner,
      actionRequired: retryCount < 3 ? ('retry' as DeveloperActionRequired) : ('escalate' as DeveloperActionRequired),
      priority: 'high' as DeveloperIssuePriority,
      summary: 'Courier responded with an internal processing error while creating the shipment.',
      recommendation:
        retryCount < 3
          ? 'Retry the manifest. If it keeps failing, escalate to the courier.'
          : 'Courier retries are exhausted. Escalate this case to the courier.',
      whyThisMatters: 'Shipment blocked',
    }
  }

  return {
    rootCauseKey: 'manifest_creation_failed',
    rootCauseLabel: 'Manifest creation failed',
    issueOwner: 'unknown' as DeveloperIssueOwner,
    actionRequired: retryCount < 3 ? ('retry' as DeveloperActionRequired) : ('escalate' as DeveloperActionRequired),
    priority: 'high' as DeveloperIssuePriority,
    summary: 'Courier rejected shipment creation during manifest generation.',
    recommendation:
      retryCount < 3
        ? 'Review the courier message and retry after checking the order data.'
        : 'Retries are exhausted. Escalate after reviewing the courier response.',
    whyThisMatters: 'Shipment blocked',
  }
}

const classifyPickupIssue = (message: string) => {
  const normalized = message.toLowerCase()
  if (normalized.includes('address') || normalized.includes('pincode') || normalized.includes('warehouse')) {
    return {
      rootCauseKey: 'pickup_data_issue',
      rootCauseLabel: 'Pickup data issue',
      issueOwner: 'merchant' as DeveloperIssueOwner,
      actionRequired: 'fix_data' as DeveloperActionRequired,
      priority: 'medium' as DeveloperIssuePriority,
      summary: 'Pickup scheduling failed because pickup details need review.',
      recommendation: 'Fix the pickup address, pincode, or warehouse details before trying again.',
      whyThisMatters: 'Pickup blocked',
    }
  }

  return {
    rootCauseKey: 'pickup_failed',
    rootCauseLabel: 'Pickup failed',
    issueOwner: 'unknown' as DeveloperIssueOwner,
    actionRequired: 'fix_data' as DeveloperActionRequired,
    priority: 'medium' as DeveloperIssuePriority,
    summary: 'Pickup-related work failed and needs manual review.',
    recommendation: 'Review pickup details and courier readiness before trying again.',
    whyThisMatters: 'Pickup blocked',
  }
}

const classifyPendingWebhookIssue = (linkedOrder: any | null, rows: any[]) => {
  const firstSeen = getEarliestDate(rows.map((row) => toDateSafe(row.created_at)))
  const ageHours = getAgeHours(firstSeen)

  if (!linkedOrder) {
    return {
      rootCauseKey: 'order_mapping_mismatch',
      rootCauseLabel: 'Order mapping mismatch',
      issueOwner: 'platform' as DeveloperIssueOwner,
      actionRequired: 'fix_data' as DeveloperActionRequired,
      priority: 'high' as DeveloperIssuePriority,
      summary: 'Courier webhook arrived but the platform could not map it to a local order.',
      recommendation: 'Check AWB-to-order mapping and create or repair the missing local order link.',
      whyThisMatters: 'Tracking may fail',
    }
  }

  if (ageHours <= 1) {
    return {
      rootCauseKey: 'transient_retry_pending',
      rootCauseLabel: 'Transient retry pending',
      issueOwner: 'platform' as DeveloperIssueOwner,
      actionRequired: 'ignore' as DeveloperActionRequired,
      priority: 'low' as DeveloperIssuePriority,
      summary: 'Webhook reconciliation is still pending and may resolve on the next retry.',
      recommendation: 'No immediate action needed unless this stays unresolved for more than 1 hour.',
      whyThisMatters: 'Tracking may be delayed',
    }
  }

  return {
    rootCauseKey: 'tracking_reconciliation_pending',
    rootCauseLabel: 'Tracking reconciliation pending',
    issueOwner: 'platform' as DeveloperIssueOwner,
    actionRequired: 'escalate' as DeveloperActionRequired,
    priority: 'medium' as DeveloperIssuePriority,
    summary: 'Courier webhook could not be reconciled with the local order flow in time.',
    recommendation: 'Review tracking reconciliation and retry or repair the processing path.',
    whyThisMatters: 'Tracking may fail',
  }
}

const classifyWebhookDeliveryIssue = (latest: any, items: any[]) => {
  const httpStatus = Number(latest?.http_status ?? 0)
  const attempts = Number(latest?.attempt_count ?? 0)
  const maxAttempts = Math.max(1, Number(latest?.max_attempts ?? 0))
  const exhausted = attempts >= maxAttempts || items.length >= maxAttempts
  const noResponse = !httpStatus
  const isServerSide = noResponse || httpStatus >= 500

  if (isServerSide) {
    return {
      rootCauseKey: 'webhook_endpoint_down',
      rootCauseLabel: 'Webhook endpoint down',
      issueOwner: 'merchant' as DeveloperIssueOwner,
      actionRequired: exhausted ? ('contact_merchant' as DeveloperActionRequired) : ('ignore' as DeveloperActionRequired),
      priority: exhausted ? ('high' as DeveloperIssuePriority) : ('low' as DeveloperIssuePriority),
      summary: exhausted
        ? 'Merchant webhook endpoint keeps failing and automatic retries are exhausted.'
        : 'Merchant webhook endpoint is failing, but automatic retries are still pending.',
      recommendation: exhausted
        ? 'Ask the merchant to fix their webhook endpoint and then re-trigger the event.'
        : 'No immediate action needed unless retries keep failing.',
      whyThisMatters: exhausted ? 'Merchant webhook broken' : 'Merchant webhook may be delayed',
    }
  }

  if (httpStatus >= 400) {
    return {
      rootCauseKey: 'merchant_webhook_rejected',
      rootCauseLabel: 'Merchant webhook rejected payload',
      issueOwner: 'merchant' as DeveloperIssueOwner,
      actionRequired: exhausted ? ('contact_merchant' as DeveloperActionRequired) : ('ignore' as DeveloperActionRequired),
      priority: exhausted ? ('high' as DeveloperIssuePriority) : ('low' as DeveloperIssuePriority),
      summary: exhausted
        ? 'Merchant webhook endpoint keeps rejecting payloads and retries are exhausted.'
        : 'Merchant webhook endpoint rejected the payload, but automatic retries are still pending.',
      recommendation: exhausted
        ? 'Ask the merchant to validate webhook payload handling and then re-trigger the event.'
        : 'Wait for automatic retries unless the merchant reports webhook problems.',
      whyThisMatters: exhausted ? 'Merchant webhook broken' : 'Merchant webhook may be delayed',
    }
  }

  return {
    rootCauseKey: 'webhook_delivery_failed',
    rootCauseLabel: 'Webhook delivery failed',
    issueOwner: 'platform' as DeveloperIssueOwner,
    actionRequired: exhausted ? ('escalate' as DeveloperActionRequired) : ('ignore' as DeveloperActionRequired),
    priority: exhausted ? ('high' as DeveloperIssuePriority) : ('low' as DeveloperIssuePriority),
    summary: exhausted
      ? 'Outbound merchant webhook delivery failed repeatedly.'
      : 'Outbound merchant webhook delivery failed but retries are still pending.',
    recommendation: exhausted
      ? 'Review the delivery failure and escalate if it is not caused by the merchant endpoint.'
      : 'Monitor automatic retries.',
    whyThisMatters: exhausted ? 'Merchant webhook broken' : 'Merchant webhook may be delayed',
  }
}

const createIssueAuditLog = async ({
  issueKey,
  action,
  note,
  metadata,
  adminUserId,
}: {
  issueKey: string
  action: string
  note?: string | null
  metadata?: Record<string, any> | null
  adminUserId?: string | null
}) => {
  const normalizedIssueKey = trimText(issueKey)
  if (!normalizedIssueKey) return

  await db.insert(developer_issue_audit_logs).values({
    issue_key: normalizedIssueKey,
    admin_user_id: adminUserId ?? null,
    action,
    note: note ?? null,
    metadata: metadata ?? null,
  })
}

const syncIssueStates = async (issues: DeveloperIssueCandidate[]) => {
  if (!issues.length) return new Map<string, any>()

  const issueKeys = issues.map((issue) => issue.issue_key)
  const existingStates = await db
    .select()
    .from(developer_issue_states)
    .where(inArray(developer_issue_states.issue_key, issueKeys))

  const existingMap = new Map(existingStates.map((row) => [row.issue_key, row]))

  for (const issue of issues) {
    const existing = existingMap.get(issue.issue_key)
    const issueLastSeen = issue.last_seen_at || new Date()

    if (!existing) {
      const [inserted] = await db
        .insert(developer_issue_states)
        .values({
          issue_key: issue.issue_key,
          source: issue.source,
          title: issue.title,
          status: 'open',
          priority: issue.priority_default,
          first_seen_at: issue.first_seen_at || new Date(),
          last_seen_at: issueLastSeen,
          occurrence_count: Math.max(1, issue.occurrence_count),
        })
        .returning()

      existingMap.set(issue.issue_key, inserted)
      continue
    }

    const resolvedAt = toDateSafe(existing.resolved_at)
    const shouldAutoReopen =
      existing.status === 'resolved' &&
      issueLastSeen &&
      (!resolvedAt || issueLastSeen.getTime() > resolvedAt.getTime())

    const [updated] = await db
      .update(developer_issue_states)
      .set({
        source: issue.source,
        title: issue.title,
        last_seen_at: issueLastSeen,
        occurrence_count: Math.max(1, issue.occurrence_count),
        updated_at: new Date(),
        ...(shouldAutoReopen
          ? {
              status: 'open',
              resolved_at: null,
              resolved_by_admin_id: null,
              alert_seen_at: null,
            }
          : {}),
      })
      .where(eq(developer_issue_states.issue_key, issue.issue_key))
      .returning()

    if (shouldAutoReopen) {
      await createIssueAuditLog({
        issueKey: issue.issue_key,
        action: 'system_reopened',
        note: 'Issue reopened automatically because it appeared again after being resolved.',
      })
    }

    existingMap.set(issue.issue_key, updated)
  }

  return existingMap
}

const buildGroupedIssues = async (): Promise<DeveloperIssueCandidate[]> => {
  const [orderErrors, pendingWebhookRows, failedWebhookDeliveries, subscriptions] =
    await Promise.all([
      db
        .select()
        .from(b2c_orders)
        .where(
          sql`(${b2c_orders.manifest_error} is not null and trim(${b2c_orders.manifest_error}) <> '') or (${b2c_orders.pickup_error} is not null and trim(${b2c_orders.pickup_error}) <> '')`,
        )
        .orderBy(desc(b2c_orders.updated_at)),
      db
        .select()
        .from(pending_webhooks)
        .where(sql`${pending_webhooks.processed_at} is null`)
        .orderBy(desc(pending_webhooks.created_at)),
      db
        .select()
        .from(webhook_deliveries)
        .where(eq(webhook_deliveries.status, 'failed'))
        .orderBy(desc(webhook_deliveries.created_at)),
      db.select().from(webhook_subscriptions),
    ])

  const pendingWebhookAwbs = Array.from(
    new Set(
      pendingWebhookRows
        .map((row) => trimText(row.awb_number))
        .filter((awb): awb is string => Boolean(awb)),
    ),
  )

  const pendingWebhookOrders =
    pendingWebhookAwbs.length > 0
      ? await db.select().from(b2c_orders).where(inArray(b2c_orders.awb_number, pendingWebhookAwbs))
      : []

  const subscriptionMap = new Map(subscriptions.map((row) => [row.id, row]))
  const pendingOrderMap = new Map(
    pendingWebhookOrders.map((row) => [trimText(row.awb_number), row]),
  )

  const userIds = Array.from(
    new Set(
      [
        ...orderErrors.map((row) => row.user_id),
        ...pendingWebhookOrders.map((row) => row.user_id),
        ...failedWebhookDeliveries
          .map((row) => subscriptionMap.get(row.subscription_id)?.user_id)
          .filter(Boolean),
      ].filter((id): id is string => Boolean(id)),
    ),
  )

  const [profiles, userRows] =
    userIds.length > 0
      ? await Promise.all([
          db.select().from(userProfiles).where(inArray(userProfiles.userId, userIds)),
          db.select().from(users).where(inArray(users.id, userIds)),
        ])
      : [[], []]

  const profileMap = new Map(profiles.map((row) => [row.userId, row]))
  const userMap = new Map(userRows.map((row) => [row.id, row]))

  const issues: DeveloperIssueCandidate[] = []

  const manifestGroups = new Map<string, any[]>()
  const pickupGroups = new Map<string, any[]>()

  for (const order of orderErrors) {
    const manifestError = trimText(order.manifest_error)
    if (manifestError) {
      const manifestMeta = classifyManifestIssue(manifestError, Number(order.manifest_retry_count ?? 0))
      const courier = trimText(order.courier_partner) || trimText(order.integration_type) || 'unknown'
      const key = makeIssueKey('manifest_failure', [
        order.user_id,
        courier,
        manifestMeta.rootCauseKey,
        order.order_type,
      ])
      if (!manifestGroups.has(key)) manifestGroups.set(key, [])
      manifestGroups.get(key)!.push(order)
    }

    const pickupError = trimText(order.pickup_error)
    if (pickupError) {
      const pickupMeta = classifyPickupIssue(pickupError)
      const courier = trimText(order.courier_partner) || trimText(order.integration_type) || 'unknown'
      const key = makeIssueKey('pickup_failure', [order.user_id, courier, pickupMeta.rootCauseKey])
      if (!pickupGroups.has(key)) pickupGroups.set(key, [])
      pickupGroups.get(key)!.push(order)
    }
  }

  for (const [issueKey, orders] of manifestGroups.entries()) {
    const latest = getLatestByDate(orders, (row) => toDateSafe(row.updated_at ?? row.created_at)) || orders[0]
    const latestError = trimText(latest.manifest_error)
    const classification = classifyManifestIssue(latestError, Number(latest.manifest_retry_count ?? 0))
    const profile = profileMap.get(latest.user_id)
    const user = userMap.get(latest.user_id)
    const merchantName = getMerchantName(profile, user)
    const merchantEmail = user?.email ?? null
    const relatedOrders = orders
      .map((order) => buildRelatedOrder(order))
      .sort((a, b) => (b.updated_at?.getTime() ?? 0) - (a.updated_at?.getTime() ?? 0))
    const retryableOrders = relatedOrders.filter((order) => order.can_retry_manifest)

    issues.push({
      issue_key: issueKey,
      source: 'manifest_failure',
      source_label: 'Manifest',
      priority_default: classification.priority,
      issue_owner: classification.issueOwner,
      action_required: classification.actionRequired,
      root_cause_key: classification.rootCauseKey,
      root_cause_label: classification.rootCauseLabel,
      title:
        relatedOrders.length > 1
          ? `Shipment manifest failed for ${relatedOrders.length} orders`
          : 'Shipment manifest failed',
      where_it_happened: 'Courier booking -> Manifest creation',
      how_it_happened: `This happened during ${trimText(latest.courier_partner) || trimText(latest.integration_type) || 'courier'} manifest creation. Latest courier message: ${latestError}`,
      for_whom: buildForWhom({
        merchantName,
        merchantEmail,
        buyerName: latest.buyer_name ?? null,
        buyerPhone: latest.buyer_phone ?? null,
        orderNumber: latest.order_number ?? null,
        awbNumber: latest.awb_number ?? null,
        affectedOrderCount: relatedOrders.length,
      }),
      summary: classification.summary,
      recommendation: classification.recommendation,
      why_this_matters: classification.whyThisMatters,
      raw_error: clampText(latestError),
      raw_payload: stringifyJson({
        latest_error: latestError,
        courier_partner: latest.courier_partner ?? latest.integration_type ?? null,
        payment_mode: latest.order_type ?? null,
        destination_pincode: latest.pincode ?? null,
        pickup_pincode: latest.pickup_details?.pincode ?? null,
        orders: relatedOrders.map((order) => ({
          id: order.id,
          order_number: order.order_number,
          awb_number: order.awb_number,
          order_status: order.order_status,
          retry_count: order.manifest_retry_count,
        })),
      }),
      merchant_user_id: latest.user_id ?? null,
      merchant_name: merchantName,
      merchant_email: merchantEmail,
      buyer_name: latest.buyer_name ?? null,
      buyer_phone: latest.buyer_phone ?? null,
      order_id: latest.id ?? null,
      order_number: latest.order_number ?? null,
      awb_number: latest.awb_number ?? null,
      courier_partner: latest.courier_partner ?? latest.integration_type ?? null,
      status: latest.order_status ?? null,
      first_seen_at: getEarliestDate(orders.map((row) => toDateSafe(row.created_at))),
      last_seen_at: getLatestDate(orders.map((row) => toDateSafe(row.updated_at ?? row.created_at))),
      occurrence_count: relatedOrders.reduce((total, order) => total + order.occurrence_count, 0),
      affected_order_count: relatedOrders.length,
      can_retry_manifest: retryableOrders.length > 0,
      retryable_order_count: retryableOrders.length,
      related_orders: relatedOrders,
      related_pending_webhooks: [],
      related_webhook_deliveries: [],
      related_record_refs: {
        order_ids: relatedOrders.map((order) => order.id),
        pending_webhook_ids: [],
        webhook_delivery_ids: [],
        merchant_user_id: latest.user_id ?? null,
      },
    })
  }

  for (const [issueKey, orders] of pickupGroups.entries()) {
    const latest = getLatestByDate(orders, (row) => toDateSafe(row.updated_at ?? row.created_at)) || orders[0]
    const latestError = trimText(latest.pickup_error)
    const classification = classifyPickupIssue(latestError)
    const profile = profileMap.get(latest.user_id)
    const user = userMap.get(latest.user_id)
    const merchantName = getMerchantName(profile, user)
    const merchantEmail = user?.email ?? null
    const relatedOrders = orders
      .map((order) => buildRelatedOrder({ ...order, manifest_error: null }))
      .map((order) => ({ ...order, occurrence_count: 1, can_retry_manifest: false }))
      .sort((a, b) => (b.updated_at?.getTime() ?? 0) - (a.updated_at?.getTime() ?? 0))

    issues.push({
      issue_key: issueKey,
      source: 'pickup_failure',
      source_label: 'Pickup',
      priority_default: classification.priority,
      issue_owner: classification.issueOwner,
      action_required: classification.actionRequired,
      root_cause_key: classification.rootCauseKey,
      root_cause_label: classification.rootCauseLabel,
      title: relatedOrders.length > 1 ? `Pickup issues detected for ${relatedOrders.length} orders` : 'Pickup issue detected',
      where_it_happened: 'Pickup handling',
      how_it_happened: `This happened while the platform was handling pickup work. Latest system message: ${latestError}`,
      for_whom: buildForWhom({
        merchantName,
        merchantEmail,
        buyerName: latest.buyer_name ?? null,
        buyerPhone: latest.buyer_phone ?? null,
        orderNumber: latest.order_number ?? null,
        awbNumber: latest.awb_number ?? null,
        affectedOrderCount: relatedOrders.length,
      }),
      summary: classification.summary,
      recommendation: classification.recommendation,
      why_this_matters: classification.whyThisMatters,
      raw_error: clampText(latestError),
      raw_payload: stringifyJson({
        latest_error: latestError,
        courier_partner: latest.courier_partner ?? latest.integration_type ?? null,
        orders: relatedOrders.map((order) => ({
          id: order.id,
          order_number: order.order_number,
          pickup_status: latest.pickup_status ?? latest.order_status ?? null,
        })),
      }),
      merchant_user_id: latest.user_id ?? null,
      merchant_name: merchantName,
      merchant_email: merchantEmail,
      buyer_name: latest.buyer_name ?? null,
      buyer_phone: latest.buyer_phone ?? null,
      order_id: latest.id ?? null,
      order_number: latest.order_number ?? null,
      awb_number: latest.awb_number ?? null,
      courier_partner: latest.courier_partner ?? latest.integration_type ?? null,
      status: latest.pickup_status ?? latest.order_status ?? null,
      first_seen_at: getEarliestDate(orders.map((row) => toDateSafe(row.created_at))),
      last_seen_at: getLatestDate(orders.map((row) => toDateSafe(row.updated_at ?? row.created_at))),
      occurrence_count: relatedOrders.length,
      affected_order_count: relatedOrders.length,
      can_retry_manifest: false,
      retryable_order_count: 0,
      related_orders: relatedOrders,
      related_pending_webhooks: [],
      related_webhook_deliveries: [],
      related_record_refs: {
        order_ids: relatedOrders.map((order) => order.id),
        pending_webhook_ids: [],
        webhook_delivery_ids: [],
        merchant_user_id: latest.user_id ?? null,
      },
    })
  }

  const pendingGroups = new Map<string, any[]>()
  for (const pendingWebhook of pendingWebhookRows) {
    const linkedOrder = pendingOrderMap.get(trimText(pendingWebhook.awb_number))
    const classification = classifyPendingWebhookIssue(linkedOrder ?? null, [pendingWebhook])
    const key = linkedOrder
      ? makeIssueKey('pending_webhook', [
          linkedOrder.user_id,
          trimText(linkedOrder.courier_partner) || trimText(linkedOrder.integration_type) || 'courier',
          classification.rootCauseKey,
        ])
      : makeIssueKey('pending_webhook', [classification.rootCauseKey])
    if (!pendingGroups.has(key)) pendingGroups.set(key, [])
    pendingGroups.get(key)!.push(pendingWebhook)
  }

  for (const [issueKey, rows] of pendingGroups.entries()) {
    if (rows.length >= MAX_PENDING_DUPLICATE_RETRIES) {
      continue
    }

    const latest = getLatestByDate(rows, (row) => toDateSafe(row.created_at)) || rows[0]
    const awb = trimText(latest.awb_number)
    const linkedOrder = pendingOrderMap.get(awb) ?? null
    const classification = classifyPendingWebhookIssue(linkedOrder, rows)
    const profile = linkedOrder ? profileMap.get(linkedOrder.user_id) : null
    const user = linkedOrder ? userMap.get(linkedOrder.user_id) : null
    const merchantName = linkedOrder ? getMerchantName(profile, user) : null
    const merchantEmail = linkedOrder ? user?.email ?? null : null

    issues.push({
      issue_key: issueKey,
      source: 'pending_webhook',
      source_label: 'Pending Webhook',
      priority_default: classification.priority,
      issue_owner: classification.issueOwner,
      action_required: classification.actionRequired,
      root_cause_key: classification.rootCauseKey,
      root_cause_label: classification.rootCauseLabel,
      title:
        rows.length > 1
          ? `Courier webhooks pending reconciliation for ${rows.length} records`
          : 'Courier webhook is pending reconciliation',
      where_it_happened: 'Inbound courier webhook processing',
      how_it_happened: linkedOrder
        ? `Courier sent webhook updates for AWB ${awb}, but the local reconciliation flow is still pending.`
        : `Courier sent webhook updates for AWB ${awb || 'unknown'}, but the platform could not find a matching local order.`,
      for_whom: buildForWhom({
        merchantName,
        merchantEmail,
        buyerName: linkedOrder?.buyer_name ?? null,
        buyerPhone: linkedOrder?.buyer_phone ?? null,
        orderNumber: linkedOrder?.order_number ?? null,
        awbNumber: awb || linkedOrder?.awb_number || null,
        affectedOrderCount: linkedOrder ? 1 : undefined,
      }),
      summary: classification.summary,
      recommendation: classification.recommendation,
      why_this_matters: classification.whyThisMatters,
      raw_error: clampText(
        linkedOrder
          ? `Pending courier webhook for AWB ${awb}.`
          : `No local order found yet for courier webhook AWB ${awb || 'unknown'}.`,
      ),
      raw_payload: stringifyJson({
        pending_webhook_ids: rows.map((row) => row.id),
        latest_payload: latest.payload,
        linked_order: linkedOrder
          ? {
              id: linkedOrder.id,
              order_number: linkedOrder.order_number,
              awb_number: linkedOrder.awb_number,
              order_status: linkedOrder.order_status,
            }
          : null,
      }),
      merchant_user_id: linkedOrder?.user_id ?? null,
      merchant_name: merchantName,
      merchant_email: merchantEmail,
      buyer_name: linkedOrder?.buyer_name ?? null,
      buyer_phone: linkedOrder?.buyer_phone ?? null,
      order_id: linkedOrder?.id ?? null,
      order_number: linkedOrder?.order_number ?? null,
      awb_number: awb || linkedOrder?.awb_number || null,
      courier_partner: linkedOrder?.courier_partner ?? 'Courier Webhook',
      status: trimText(latest.status) || 'pending',
      first_seen_at: getEarliestDate(rows.map((row) => toDateSafe(row.created_at))),
      last_seen_at: getLatestDate(rows.map((row) => toDateSafe(row.created_at))),
      occurrence_count: rows.length,
      affected_order_count: linkedOrder ? 1 : 0,
      can_retry_manifest: false,
      retryable_order_count: 0,
      related_orders: linkedOrder ? [buildRelatedOrder({ ...linkedOrder, manifest_error: null })] : [],
      related_pending_webhooks: rows.map((row) => ({
        id: row.id,
        awb_number: row.awb_number ?? null,
        status: row.status ?? null,
        created_at: toDateSafe(row.created_at),
      })),
      related_webhook_deliveries: [],
      related_record_refs: {
        order_ids: linkedOrder?.id ? [linkedOrder.id] : [],
        pending_webhook_ids: rows.map((row) => row.id),
        webhook_delivery_ids: [],
        merchant_user_id: linkedOrder?.user_id ?? null,
      },
    })
  }

  const webhookGroups = new Map<string, any[]>()
  for (const delivery of failedWebhookDeliveries) {
    const subscription = subscriptionMap.get(delivery.subscription_id)
    const classification = classifyWebhookDeliveryIssue(delivery, [delivery])
    const key = makeIssueKey('webhook_delivery_failed', [
      subscription?.user_id,
      delivery.event_type,
      classification.rootCauseKey,
    ])
    if (!webhookGroups.has(key)) webhookGroups.set(key, [])
    webhookGroups.get(key)!.push(delivery)
  }

  for (const [issueKey, rows] of webhookGroups.entries()) {
    const latest = getLatestByDate(rows, (row) => toDateSafe(row.failed_at ?? row.created_at)) || rows[0]
    const subscription = subscriptionMap.get(latest.subscription_id)
    const profile = subscription ? profileMap.get(subscription.user_id) : null
    const user = subscription ? userMap.get(subscription.user_id) : null
    const merchantName = subscription ? getMerchantName(profile, user) : null
    const merchantEmail = subscription ? user?.email ?? null : null
    const classification = classifyWebhookDeliveryIssue(latest, rows)
    const payload = (latest.payload as any) || {}

    issues.push({
      issue_key: issueKey,
      source: 'webhook_delivery_failed',
      source_label: 'Outbound Webhook',
      priority_default: classification.priority,
      issue_owner: classification.issueOwner,
      action_required: classification.actionRequired,
      root_cause_key: classification.rootCauseKey,
      root_cause_label: classification.rootCauseLabel,
      title:
        rows.length > 1
          ? `Merchant webhook delivery failed ${rows.length} times`
          : 'Merchant webhook delivery failed',
      where_it_happened: 'Platform -> Merchant webhook delivery',
      how_it_happened: `Platform tried to send an outbound webhook. Latest failure was attempt ${Number(latest.attempt_count ?? 0)}/${Number(latest.max_attempts ?? 0)} with ${
        latest.http_status ? `HTTP ${latest.http_status}` : 'no HTTP response'
      }.`,
      for_whom: buildForWhom({
        merchantName,
        merchantEmail,
        buyerName: trimText(payload.buyer_name) || null,
        buyerPhone: trimText(payload.buyer_phone) || null,
        orderNumber: trimText(payload.order_number) || trimText(latest.event_id) || null,
        awbNumber: trimText(payload.awb_number) || null,
      }),
      summary: classification.summary,
      recommendation: classification.recommendation,
      why_this_matters: classification.whyThisMatters,
      raw_error: clampText(
        trimText(latest.error_message) || trimText(latest.response_body) || 'Webhook delivery failed.',
      ),
      raw_payload: stringifyJson({
        latest_delivery_id: latest.id,
        event_type: latest.event_type,
        event_id: latest.event_id,
        attempts: rows.map((row) => ({
          id: row.id,
          attempt_count: row.attempt_count,
          max_attempts: row.max_attempts,
          http_status: row.http_status,
          failed_at: row.failed_at,
          error_message: row.error_message,
        })),
        payload,
        subscription: subscription
          ? {
              id: subscription.id,
              url: subscription.url,
              name: subscription.name,
            }
          : null,
      }),
      merchant_user_id: subscription?.user_id ?? null,
      merchant_name: merchantName,
      merchant_email: merchantEmail,
      buyer_name: trimText(payload.buyer_name) || null,
      buyer_phone: trimText(payload.buyer_phone) || null,
      order_id: null,
      order_number: trimText(payload.order_number) || trimText(latest.event_id) || null,
      awb_number: trimText(payload.awb_number) || null,
      courier_partner: trimText(payload.courier_partner) || null,
      status: latest.status ?? null,
      first_seen_at: getEarliestDate(rows.map((row) => toDateSafe(row.created_at))),
      last_seen_at: getLatestDate(rows.map((row) => toDateSafe(row.failed_at ?? row.created_at))),
      occurrence_count: rows.length,
      affected_order_count: Array.from(
        new Set(rows.map((row) => trimText((row.payload as any)?.order_number)).filter(Boolean)),
      ).length,
      can_retry_manifest: false,
      retryable_order_count: 0,
      related_orders: [],
      related_pending_webhooks: [],
      related_webhook_deliveries: rows.map((row) => ({
        id: row.id,
        event_type: row.event_type ?? null,
        event_id: row.event_id ?? null,
        http_status: row.http_status ?? null,
        attempt_count: Number(row.attempt_count ?? 0),
        max_attempts: Number(row.max_attempts ?? 0),
        failed_at: toDateSafe(row.failed_at ?? row.created_at),
      })),
      related_record_refs: {
        order_ids: [],
        pending_webhook_ids: [],
        webhook_delivery_ids: rows.map((row) => row.id),
        merchant_user_id: subscription?.user_id ?? null,
      },
    })
  }

  return issues
}

const filterRows = (rows: DeveloperIssueRow[], filters: DeveloperErrorFilters) => {
  let nextRows = rows

  if (filters.source) {
    nextRows = nextRows.filter((row) => row.source === filters.source)
  }

  if (filters.status) {
    nextRows = nextRows.filter((row) => row.status_label === filters.status)
  }

  if (filters.priority) {
    nextRows = nextRows.filter((row) => row.priority === filters.priority)
  }

  if (filters.issueOwner) {
    nextRows = nextRows.filter((row) => row.issue_owner === filters.issueOwner)
  }

  if (filters.actionRequired) {
    nextRows = nextRows.filter((row) => row.action_required === filters.actionRequired)
  }

  if (filters.rootCause) {
    nextRows = nextRows.filter((row) => row.root_cause_key === filters.rootCause)
  }

  const actionableFilter = trimText(filters.actionable).toLowerCase()
  if (actionableFilter === 'yes') {
    nextRows = nextRows.filter((row) => row.actionable)
  } else if (actionableFilter === 'no') {
    nextRows = nextRows.filter((row) => !row.actionable)
  }

  const fromDate = toDateSafe(filters.fromDate)
  if (fromDate) {
    nextRows = nextRows.filter((row) => {
      const createdAt = toDateSafe(row.last_seen_at)
      return createdAt ? createdAt >= fromDate : false
    })
  }

  const toDate = toDateSafe(filters.toDate)
  if (toDate) {
    toDate.setHours(23, 59, 59, 999)
    nextRows = nextRows.filter((row) => {
      const createdAt = toDateSafe(row.last_seen_at)
      return createdAt ? createdAt <= toDate : false
    })
  }

  const courierSearch = trimText(filters.courier).toLowerCase()
  if (courierSearch) {
    nextRows = nextRows.filter((row) =>
      String(row.courier_partner || '').toLowerCase().includes(courierSearch),
    )
  }

  const merchantSearch = trimText(filters.merchant).toLowerCase()
  if (merchantSearch) {
    nextRows = nextRows.filter((row) =>
      [row.merchant_name, row.merchant_email]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(merchantSearch)),
    )
  }

  const search = trimText(filters.search).toLowerCase()
  if (search) {
    nextRows = nextRows.filter((row) =>
      [
        row.title,
        row.summary,
        row.where_it_happened,
        row.how_it_happened,
        row.for_whom,
        row.raw_error,
        row.recommendation,
        row.order_number,
        row.awb_number,
        row.merchant_name,
        row.merchant_email,
        row.owner_admin_name,
        row.owner_admin_email,
        row.courier_partner,
        row.root_cause_label,
        row.why_this_matters,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(search)),
    )
  }

  return nextRows
}

export const getDeveloperErrorLogsService = async ({
  page = 1,
  limit = 20,
  filters = {},
}: {
  page?: number
  limit?: number
  filters?: DeveloperErrorFilters
}) => {
  const safePage = Math.max(1, Number(page) || 1)
  const safeLimit = Math.max(1, Math.min(100, Number(limit) || 20))
  const offset = (safePage - 1) * safeLimit

  const activeIssues = await buildGroupedIssues()
  const syncedStateMap = await syncIssueStates(activeIssues)
  const issueStates = Array.from(syncedStateMap.values())

  const adminIds = Array.from(
    new Set(
      issueStates
        .flatMap((state) => [state.owner_admin_id, state.resolved_by_admin_id])
        .filter((id): id is string => Boolean(id)),
    ),
  )

  const adminUsers =
    adminIds.length > 0 ? await db.select().from(users).where(inArray(users.id, adminIds)) : []
  const adminUserMap = new Map(adminUsers.map((admin) => [admin.id, admin]))

  let rows: DeveloperIssueRow[] = activeIssues.map((issue) => {
    const state = syncedStateMap.get(issue.issue_key)
    const owner = state?.owner_admin_id ? adminUserMap.get(state.owner_admin_id) : null
    const resolvedBy = state?.resolved_by_admin_id
      ? adminUserMap.get(state.resolved_by_admin_id)
      : null
    const statusLabel = (state?.status as DeveloperIssueStatus) || 'open'
    const priority = (state?.priority as DeveloperIssuePriority) || issue.priority_default
    const alertSeenAt = toDateSafe(state?.alert_seen_at)
    const lastSeenAt = toDateSafe(issue.last_seen_at)
    const hasNewAlert =
      priority === 'high' &&
      statusLabel === 'open' &&
      (!alertSeenAt || (lastSeenAt ? lastSeenAt.getTime() > alertSeenAt.getTime() : true))

    return {
      ...issue,
      status_label: statusLabel,
      priority,
      owner_admin_id: state?.owner_admin_id ?? null,
      owner_admin_name: owner ? getUserDisplayName(owner) : null,
      owner_admin_email: owner?.email ?? null,
      resolved_by_admin_id: state?.resolved_by_admin_id ?? null,
      resolved_by_admin_name: resolvedBy ? getUserDisplayName(resolvedBy) : null,
      resolved_by_admin_email: resolvedBy?.email ?? null,
      resolved_at: toDateSafe(state?.resolved_at),
      alert_seen_at: alertSeenAt,
      has_new_alert: hasNewAlert,
      actionable: statusLabel === 'open' && issue.action_required !== 'ignore',
      audit_trail: [],
    }
  })

  rows = filterRows(rows, filters)

  rows.sort((a, b) => {
    if (a.has_new_alert !== b.has_new_alert) return a.has_new_alert ? -1 : 1
    if (a.status_label !== b.status_label) return a.status_label === 'open' ? -1 : 1
    const priorityDiff = PRIORITY_WEIGHT[b.priority] - PRIORITY_WEIGHT[a.priority]
    if (priorityDiff !== 0) return priorityDiff
    return (toDateSafe(b.last_seen_at)?.getTime() ?? 0) - (toDateSafe(a.last_seen_at)?.getTime() ?? 0)
  })

  const totalCount = rows.length
  const paginatedRows = rows.slice(offset, offset + safeLimit)

  const paginatedIssueKeys = paginatedRows.map((row) => row.issue_key)
  const auditRows =
    paginatedIssueKeys.length > 0
      ? await db
          .select()
          .from(developer_issue_audit_logs)
          .where(inArray(developer_issue_audit_logs.issue_key, paginatedIssueKeys))
          .orderBy(desc(developer_issue_audit_logs.created_at))
      : []

  const auditAdminIds = Array.from(
    new Set(auditRows.map((row) => row.admin_user_id).filter((id): id is string => Boolean(id))),
  )

  if (auditAdminIds.length > 0) {
    const missingAdminIds = auditAdminIds.filter((id) => !adminUserMap.has(id))
    if (missingAdminIds.length > 0) {
      const moreAdmins = await db.select().from(users).where(inArray(users.id, missingAdminIds))
      moreAdmins.forEach((admin) => adminUserMap.set(admin.id, admin))
    }
  }

  const auditTrailMap = new Map<string, DeveloperIssueAuditLogRow[]>()
  for (const audit of auditRows) {
    const admin = audit.admin_user_id ? adminUserMap.get(audit.admin_user_id) : null
    if (!auditTrailMap.has(audit.issue_key)) auditTrailMap.set(audit.issue_key, [])
    auditTrailMap.get(audit.issue_key)!.push({
      id: audit.id,
      action: audit.action,
      note: audit.note ?? null,
      created_at: toDateSafe(audit.created_at),
      admin_user_id: audit.admin_user_id ?? null,
      admin_name: admin ? getUserDisplayName(admin) : audit.admin_user_id ? 'Admin' : 'System',
      admin_email: admin?.email ?? null,
      metadata: (audit.metadata as Record<string, any> | null) ?? null,
    })
  }

  const logs = paginatedRows.map((row) => ({
    ...row,
    audit_trail: auditTrailMap.get(row.issue_key) || [],
  }))

  const openRows = rows.filter((row) => row.status_label === 'open')
  const summary = {
    total: totalCount,
    open: openRows.length,
    resolved: rows.filter((row) => row.status_label === 'resolved').length,
    highPriority: rows.filter((row) => row.priority === 'high').length,
    mediumPriority: rows.filter((row) => row.priority === 'medium').length,
    lowPriority: rows.filter((row) => row.priority === 'low').length,
    manifest: rows.filter((row) => row.source === 'manifest_failure').length,
    pickup: rows.filter((row) => row.source === 'pickup_failure').length,
    pendingWebhook: rows.filter((row) => row.source === 'pending_webhook').length,
    failedWebhookDelivery: rows.filter((row) => row.source === 'webhook_delivery_failed').length,
    actionable: rows.filter((row) => row.actionable).length,
    alerts: rows.filter((row) => row.has_new_alert).length,
    slaOpenOver1Hour: openRows.filter((row) => getAgeHours(toDateSafe(row.first_seen_at)) > 1).length,
    slaOpenOver1Day: openRows.filter((row) => getAgeHours(toDateSafe(row.first_seen_at)) > 24).length,
  }

  const filterMeta = {
    couriers: Array.from(new Set(rows.map((row) => trimText(row.courier_partner)).filter(Boolean))).sort(),
    rootCauses: Array.from(
      new Map(rows.map((row) => [row.root_cause_key, { value: row.root_cause_key, label: row.root_cause_label }])).values(),
    ),
  }

  return {
    logs,
    totalCount,
    totalPages: Math.ceil(totalCount / safeLimit),
    summary,
    alerts: rows.filter((row) => row.has_new_alert).slice(0, 5),
    filterMeta,
  }
}

export const updateDeveloperIssueStateService = async ({
  issueKey,
  adminUserId,
  status,
  priority,
  assignToMe,
  clearOwner,
  markAlertSeen,
}: {
  issueKey: string
  adminUserId: string
  status?: string
  priority?: string
  assignToMe?: boolean
  clearOwner?: boolean
  markAlertSeen?: boolean
}) => {
  const normalizedIssueKey = trimText(issueKey)
  if (!normalizedIssueKey) {
    throw new HttpError(400, 'Issue key is required.')
  }

  const [issueState] = await db
    .select()
    .from(developer_issue_states)
    .where(eq(developer_issue_states.issue_key, normalizedIssueKey))
    .limit(1)

  if (!issueState) {
    throw new HttpError(404, 'Issue not found.')
  }

  const nextStatus =
    status && ['open', 'resolved'].includes(status) ? (status as DeveloperIssueStatus) : undefined
  const nextPriority =
    priority && ['high', 'medium', 'low'].includes(priority)
      ? (priority as DeveloperIssuePriority)
      : undefined

  const updateData: Record<string, any> = {
    updated_at: new Date(),
  }
  const auditEntries: Array<{ action: string; note: string; metadata?: Record<string, any> }> = []

  if (nextStatus) {
    updateData.status = nextStatus
    if (nextStatus === 'resolved') {
      updateData.resolved_at = new Date()
      updateData.resolved_by_admin_id = adminUserId
      updateData.alert_seen_at = new Date()
      auditEntries.push({
        action: 'resolved',
        note: 'Issue marked as resolved.',
      })
    } else {
      updateData.resolved_at = null
      updateData.resolved_by_admin_id = null
      updateData.alert_seen_at = null
      auditEntries.push({
        action: 'reopened',
        note: 'Issue reopened.',
      })
    }
  }

  if (nextPriority && nextPriority !== issueState.priority) {
    updateData.priority = nextPriority
    auditEntries.push({
      action: 'priority_changed',
      note: `Priority changed to ${nextPriority}.`,
      metadata: {
        previous_priority: issueState.priority,
        next_priority: nextPriority,
      },
    })
  }

  if (assignToMe === true && issueState.owner_admin_id !== adminUserId) {
    updateData.owner_admin_id = adminUserId
    auditEntries.push({
      action: 'assigned',
      note: 'Issue assigned to current admin.',
    })
  }

  if (clearOwner === true && issueState.owner_admin_id) {
    updateData.owner_admin_id = null
    auditEntries.push({
      action: 'unassigned',
      note: 'Issue owner cleared.',
    })
  }

  if (markAlertSeen === true) {
    updateData.alert_seen_at = new Date()
    auditEntries.push({
      action: 'alert_seen',
      note: 'High-priority alert marked as seen.',
    })
  }

  const [updated] = await db
    .update(developer_issue_states)
    .set(updateData)
    .where(eq(developer_issue_states.issue_key, normalizedIssueKey))
    .returning()

  await Promise.all(
    auditEntries.map((entry) =>
      createIssueAuditLog({
        issueKey: normalizedIssueKey,
        action: entry.action,
        note: entry.note,
        metadata: entry.metadata,
        adminUserId,
      }),
    ),
  )

  return updated
}

export const retryFailedManifestServiceForAdmin = async ({
  orderId,
  issueKey,
  adminUserId,
}: {
  orderId: string
  issueKey?: string
  adminUserId?: string
}) => {
  const normalizedOrderId = trimText(orderId)
  if (!normalizedOrderId) {
    throw new HttpError(400, 'Order ID is required.')
  }

  const [order] = await db
    .select({
      id: b2c_orders.id,
      user_id: b2c_orders.user_id,
      order_status: b2c_orders.order_status,
      order_number: b2c_orders.order_number,
    })
    .from(b2c_orders)
    .where(eq(b2c_orders.id, normalizedOrderId))
    .limit(1)

  if (!order) {
    throw new HttpError(404, 'Order not found.')
  }

  if (String(order.order_status || '').toLowerCase() !== 'manifest_failed') {
    throw new HttpError(400, 'Only manifest_failed orders can be retried from Developer tab.')
  }

  try {
    const result = await retryFailedManifestService(order.id, order.user_id)

    if (issueKey) {
      await createIssueAuditLog({
        issueKey,
        action: 'retry_manifest',
        note: `Manual manifest retry triggered for order ${order.order_number || order.id}.`,
        metadata: {
          order_id: order.id,
          order_number: order.order_number,
        },
        adminUserId,
      })
    }

    return result
  } catch (error: any) {
    if (issueKey) {
      await createIssueAuditLog({
        issueKey,
        action: 'retry_manifest_failed',
        note: `Manual manifest retry failed for order ${order.order_number || order.id}.`,
        metadata: {
          order_id: order.id,
          order_number: order.order_number,
          error: error?.message || 'Unknown retry error',
        },
        adminUserId,
      })
    }

    throw error
  }
}

export const developerIssueLabels = {
  ISSUE_OWNER_LABELS,
  ACTION_REQUIRED_LABELS,
}

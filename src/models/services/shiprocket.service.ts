import axios from 'axios'
import {
  and,
  asc,
  count,
  desc,
  eq,
  getTableColumns,
  gte,
  ilike,
  inArray,
  isNull,
  lte,
  or,
  SQL,
  sql,
} from 'drizzle-orm'
import { DelhiveryManifestError, HttpError } from '../../utils/classes'
import {
  DELHIVERY_ALLOWED_COURIER_IDS,
  getDelhiveryShippingModeByCourierId,
  isSupportedDelhiveryCourierId,
  normalizeCourierId,
} from '../../utils/delhiveryCourier'
import { getBucketName } from '../../utils/functions'
import { db } from '../client'
import { b2b_orders } from '../schema/b2bOrders'
import { b2c_orders } from '../schema/b2cOrders'
import { invoicePreferences } from '../schema/invoicePreferences'
// import { shippingRate, shippingRateCard } from '../schema/shippingRateCard'
import { sendWebhookEvent } from '../../services/webhookDelivery.service'
import { users } from '../schema/users'
import { wallets, walletTransactions } from '../schema/wallet'
import dayjs from 'dayjs'
import { computeRovChargeForOrder } from './insurance.service'
import {
  formatPickupAddress,
  loadInvoiceAssets,
  normalizePickupDetails,
} from './invoiceHelpers'
import { generateInvoicePDF, Product } from './invoice.service'
import { presignDownload, presignUpload } from './upload.service'
import { createWalletTransaction } from './wallet.service'
import { walletOfUser } from './walletTopupService'
import { resolveInvoiceNumber } from './invoiceNumber.service'

import * as dotenv from 'dotenv'
import { PgTransaction } from 'drizzle-orm/pg-core'
import path from 'path'
import PdfPrinter from 'pdfmake'
import { requireMerchantOrderReadiness } from '../../utils/merchantReadiness'
import { courierPriorityProfiles } from '../schema/courierPriority'
import { couriers } from '../schema/couriers'
import { locations } from '../schema/locations'
import { addresses, pickupAddresses } from '../schema/pickupAddresses'
import { plans } from '../schema/plans'
import { shippingRates } from '../schema/shippingRates'
import { userPlans } from '../schema/userPlans'
import { userProfiles } from '../schema/userProfile'
import { b2bPincodes, b2bZoneToZoneRates, zones } from '../schema/zones'
import { calculateB2BRate } from './b2bAdmin.service'
import { DelhiveryService } from './couriers/delhivery.service'
import { EkartService } from './couriers/ekart.service'
import { XpressbeesService } from './couriers/xpressbees.service'
import { calculateOrderWeights } from './courierWeightCalculation.service'
import { generateLabelForOrder } from './generateCustomLabelService'
import {
  computeB2CRateCardCharge,
  fetchResolvedB2CRateCards,
  findMatchingSlabIndex,
  formatCourierSlabDisplayName,
  normalizeB2CShippingMode,
} from './b2cRateCard.service'
import { calculateFreight } from './pricing/chargeableFreight'

// Load correct .env based on NODE_ENV
const env = process.env.NODE_ENV || 'development'
dotenv.config({ path: path.resolve(__dirname, `../../.env.${env}`) })

const pdfFonts = {
  Helvetica: {
    normal: 'Helvetica',
    bold: 'Helvetica-Bold',
    italics: 'Helvetica-Oblique',
    bolditalics: 'Helvetica-BoldOblique',
  },
}

const MAX_MANIFEST_RETRY_ATTEMPTS = 3
const ORIGINAL_WALLET_DEBIT_REASONS = ['B2C Prepaid Order Payment', 'B2C COD Service Charges']

const truncateColumnValue = (value: string, maxLength = 255) => {
  if (value.length <= maxLength) return value
  return `${value.slice(0, Math.max(0, maxLength - 3))}...`
}

const getErrorStatusCode = (error: any, fallback = 500) =>
  typeof error?.statusCode === 'number' ? error.statusCode : fallback

const getUserFacingManifestError = (
  error: any,
  fallback = 'Failed to generate manifest. Please try again.',
) => {
  const rawMessage = typeof error?.message === 'string' ? error.message.trim() : ''
  if (!rawMessage) {
    return fallback
  }

  if (/non serviceable pincode/i.test(rawMessage)) {
    return rawMessage
  }

  if (/destination pincode .* not serviceable/i.test(rawMessage)) {
    return rawMessage
  }

  if (/pickup pincode .* not serviceable/i.test(rawMessage)) {
    return rawMessage
  }

  if (/invoice_number/i.test(rawMessage) || /hsn/i.test(rawMessage)) {
    return rawMessage
  }

  return rawMessage
}

const summarizeManifestRefs = (values: Array<string | null | undefined>, maxVisible = 5) => {
  const normalized = values.map((value) => String(value ?? '').trim()).filter(Boolean)
  if (normalized.length <= maxVisible) {
    return normalized.join(', ')
  }

  return `${normalized.slice(0, maxVisible).join(', ')} +${normalized.length - maxVisible} more`
}

const getManifestFailureRefundReason = (orderNumber: string | null | undefined) =>
  `Refund for manifest failed order #${String(orderNumber || '').trim() || 'unknown'}`

const getExpectedWalletDebitFromOrder = (order: {
  order_type?: string | null
  freight_charges?: number | string | null
  other_charges?: number | string | null
  cod_charges?: number | string | null
}) => {
  const freightCharges = Number(order.freight_charges ?? 0)
  const otherCharges = Number(order.other_charges ?? 0)
  const codCharges = Number(order.cod_charges ?? 0)
  return String(order.order_type || '').toLowerCase() === 'cod'
    ? freightCharges + otherCharges + codCharges
    : freightCharges + otherCharges
}

const getWalletDebitReasonFromOrder = (orderType: string | null | undefined) =>
  String(orderType || '').toLowerCase() === 'cod'
    ? 'B2C COD Service Charges'
    : 'B2C Prepaid Order Payment'

const getManifestFailureRefundOutstanding = async (
  executor: any,
  walletId: string,
  orderId: string,
  orderNumber: string | null | undefined,
) => {
  const transactions = await executor
    .select({
      amount: walletTransactions.amount,
      type: walletTransactions.type,
      reason: walletTransactions.reason,
    })
    .from(walletTransactions)
    .where(
      and(eq(walletTransactions.wallet_id, walletId), eq(walletTransactions.ref, orderId)),
    )

  const totalOriginalDebit = transactions
    .filter((transaction: any) =>
      transaction.type === 'debit' &&
      ORIGINAL_WALLET_DEBIT_REASONS.includes(String(transaction.reason ?? '')),
    )
    .reduce((sum: number, transaction: any) => sum + Number(transaction.amount ?? 0), 0)

  const totalManifestRefund = transactions
    .filter(
      (transaction: any) =>
        transaction.type === 'credit' &&
        String(transaction.reason ?? '') === getManifestFailureRefundReason(orderNumber),
    )
    .reduce((sum: number, transaction: any) => sum + Number(transaction.amount ?? 0), 0)

  return Math.max(0, totalOriginalDebit - totalManifestRefund)
}

const refundManifestFailureChargeOnce = async ({
  orderId,
  manifestErrorMessage,
}: {
  orderId: string
  manifestErrorMessage: string
}) => {
  await db.transaction(async (tx) => {
    const [order] = await tx
      .select()
      .from(b2c_orders)
      .where(eq(b2c_orders.id, orderId))
      .limit(1)

    if (!order) return

    await tx
      .update(b2c_orders)
      .set({
        order_status: 'manifest_failed',
        manifest_error: truncateColumnValue(manifestErrorMessage),
        updated_at: new Date(),
      })
      .where(eq(b2c_orders.id, order.id))

    const [wallet] = await tx.select().from(wallets).where(eq(wallets.userId, order.user_id)).limit(1)
    if (!wallet?.id) {
      return
    }

    const outstandingRefund = await getManifestFailureRefundOutstanding(
      tx,
      wallet.id,
      order.id,
      order.order_number,
    )

    if (outstandingRefund <= 0) {
      return
    }

    await createWalletTransaction({
      walletId: wallet.id,
      amount: outstandingRefund,
      type: 'credit',
      ref: order.id,
      reason: getManifestFailureRefundReason(order.order_number),
      currency: wallet.currency ?? 'INR',
      meta: {
        source: 'manifest_failure',
        order_id: order.id,
        order_number: order.order_number,
        manifest_error: manifestErrorMessage,
      },
      tx: tx as any,
    })
  })
}

const debitManifestSuccessChargeIfNeeded = async ({
  tx,
  order,
}: {
  tx: any
  order: any
}) => {
  const [wallet] = await tx.select().from(wallets).where(eq(wallets.userId, order.user_id)).limit(1)
  if (!wallet?.id) {
    throw new Error(`Wallet not found for user ${order.user_id}`)
  }

  const expectedDebit = getExpectedWalletDebitFromOrder(order)
  if (expectedDebit <= 0) {
    return
  }

  const transactions = await tx
    .select({
      amount: walletTransactions.amount,
      type: walletTransactions.type,
      reason: walletTransactions.reason,
    })
    .from(walletTransactions)
    .where(and(eq(walletTransactions.wallet_id, wallet.id), eq(walletTransactions.ref, order.id)))

  const totalOriginalDebit = transactions
    .filter((transaction: any) =>
      transaction.type === 'debit' &&
      ORIGINAL_WALLET_DEBIT_REASONS.includes(String(transaction.reason ?? '')),
    )
    .reduce((sum: number, transaction: any) => sum + Number(transaction.amount ?? 0), 0)

  const totalManifestRefund = transactions
    .filter(
      (transaction: any) =>
        transaction.type === 'credit' &&
        String(transaction.reason ?? '') === getManifestFailureRefundReason(order.order_number),
    )
    .reduce((sum: number, transaction: any) => sum + Number(transaction.amount ?? 0), 0)

  const netCharged = totalOriginalDebit - totalManifestRefund
  const amountToDebit = Math.max(0, expectedDebit - netCharged)

  if (amountToDebit <= 0) {
    return
  }

  await createWalletTransaction({
    walletId: wallet.id,
    amount: amountToDebit,
    type: 'debit',
    ref: order.id,
    reason: getWalletDebitReasonFromOrder(order.order_type),
    currency: wallet.currency ?? 'INR',
    meta: {
      order_number: order.order_number,
      payment_type: order.order_type,
      freight_charges: Number(order.freight_charges ?? 0),
      other_charges: Number(order.other_charges ?? 0),
      cod_charges: String(order.order_type || '').toLowerCase() === 'cod' ? Number(order.cod_charges ?? 0) : 0,
      triggered_by: 'manifest_success',
      debit_recovery_after_refund: totalManifestRefund > 0,
      total_wallet_debit: amountToDebit,
    },
    tx: tx as any,
  })
}

interface PickupWarehouseRecord {
  pickupId: string
  addressNickname?: string | null
  addressLine1: string
  addressLine2?: string | null
  city: string
  state: string
  pincode: string
  contactName?: string | null
  contactPhone?: string | null
  gstNumber?: string | null
  country?: string | null
}

async function fetchPickupWarehouseRecord(
  userId: string,
  pickupLocationId?: string,
): Promise<PickupWarehouseRecord | null> {
  if (!pickupLocationId) return null
  const normalizedId = String(pickupLocationId).trim()
  if (!normalizedId) return null

  const [warehouse] = await db
    .select({
      pickupId: pickupAddresses.id,
      addressNickname: addresses.addressNickname,
      addressLine1: addresses.addressLine1,
      addressLine2: addresses.addressLine2,
      city: addresses.city,
      state: addresses.state,
      pincode: addresses.pincode,
      contactName: addresses.contactName,
      contactPhone: addresses.contactPhone,
      gstNumber: addresses.gstNumber,
      country: addresses.country,
    })
    .from(pickupAddresses)
    .innerJoin(addresses, eq(pickupAddresses.addressId, addresses.id))
    .where(
      and(
        eq(pickupAddresses.userId, userId),
        eq(pickupAddresses.id, normalizedId),
        eq(pickupAddresses.isPickupEnabled, true),
      ),
    )
    .limit(1)

  return warehouse ?? null
}

async function ensureUniqueMerchantOrderNumber(
  tx: PgTransaction<any, any, any>,
  userId: string,
  orderNumber?: string | null,
) {
  const normalizedOrderNumber = typeof orderNumber === 'string' ? orderNumber.trim() : ''
  const normalizedOrderNumberKey = normalizedOrderNumber.toLowerCase()

  if (!normalizedOrderNumber) {
    throw new HttpError(400, 'Order ID is required.')
  }

  const [existingB2C, existingB2B] = await Promise.all([
    tx
      .select({ id: b2c_orders.id })
      .from(b2c_orders)
      .where(
        and(
          eq(b2c_orders.user_id, userId),
          sql`lower(trim(${b2c_orders.order_number})) = ${normalizedOrderNumberKey}`,
        ),
      )
      .limit(1),
    tx
      .select({ id: b2b_orders.id })
      .from(b2b_orders)
      .where(
        and(
          eq(b2b_orders.user_id, userId),
          sql`lower(trim(${b2b_orders.order_number})) = ${normalizedOrderNumberKey}`,
        ),
      )
      .limit(1),
  ])

  if (existingB2C[0] || existingB2B[0]) {
    throw new HttpError(
      409,
      `Order ID "${normalizedOrderNumber}" already exists for this merchant. Please use a unique Order ID.`,
    )
  }

  return normalizedOrderNumber
}

export async function checkMerchantOrderNumberAvailability(userId: string, orderNumber?: string | null) {
  const normalizedOrderNumber = typeof orderNumber === 'string' ? orderNumber.trim() : ''
  const normalizedOrderNumberKey = normalizedOrderNumber.toLowerCase()

  if (!normalizedOrderNumber) {
    throw new HttpError(400, 'Order ID is required.')
  }

  const [existingB2C, existingB2B] = await Promise.all([
    db
      .select({ id: b2c_orders.id })
      .from(b2c_orders)
      .where(
        and(
          eq(b2c_orders.user_id, userId),
          sql`lower(trim(${b2c_orders.order_number})) = ${normalizedOrderNumberKey}`,
        ),
      )
      .limit(1),
    db
      .select({ id: b2b_orders.id })
      .from(b2b_orders)
      .where(
        and(
          eq(b2b_orders.user_id, userId),
          sql`lower(trim(${b2b_orders.order_number})) = ${normalizedOrderNumberKey}`,
        ),
      )
      .limit(1),
  ])

  return {
    normalizedOrderNumber,
    available: !(existingB2C[0] || existingB2B[0]),
  }
}

function buildPickupFromWarehouse(
  warehouse: PickupWarehouseRecord,
  previousPickup?: ShipmentParams['pickup'],
  fallbackDate?: string,
  fallbackTime?: string,
): ShipmentParams['pickup'] {
  const addressSegments = [warehouse.addressLine1, warehouse.addressLine2].filter(
    (segment) => typeof segment === 'string' && segment.trim().length,
  )
  const formattedAddress =
    addressSegments.length > 0 ? addressSegments.join(', ') : warehouse.addressLine1

  return {
    warehouse_name: warehouse.addressNickname || warehouse.contactName || 'Warehouse',
    address: formattedAddress,
    address_2: warehouse.addressLine2 ?? undefined,
    city: warehouse.city,
    state: warehouse.state,
    pincode: warehouse.pincode,
    name: warehouse.contactName || 'DelExpress',
    phone: warehouse.contactPhone || '',
    gst_number: previousPickup?.gst_number ?? warehouse.gstNumber ?? '',
    pickup_date: previousPickup?.pickup_date ?? fallbackDate,
    pickup_time: previousPickup?.pickup_time ?? fallbackTime,
  }
}

const getDefaultPickupDate = () => {
  const now = new Date()
  return now.toISOString().split('T')[0]
}

const getTomorrowPickupDate = () => {
  const nextDay = new Date()
  nextDay.setDate(nextDay.getDate() + 1)
  return nextDay.toISOString().split('T')[0]
}

const normalizePickupDateForRetry = (pickupDateRaw: unknown, isManifestRetry: boolean) => {
  const fallbackDate = isManifestRetry ? getTomorrowPickupDate() : getDefaultPickupDate()
  const normalizedInput = String(pickupDateRaw || '').trim().slice(0, 10)

  if (!normalizedInput) {
    return fallbackDate
  }

  if (!isManifestRetry) {
    return normalizedInput
  }

  return normalizedInput < fallbackDate ? fallbackDate : normalizedInput
}

const getDefaultPickupTime = () => {
  const now = new Date(Date.now() + 60 * 60 * 1000)
  return now.toTimeString().split(' ')[0]
}

interface NimbusServiceabilityParams {
  origin: number
  destination: number
  payment_type?: 'cod' | 'prepaid' | 'reverse'
  order_amount?: number
  orderAmount?: number
  weight?: number
  length?: number
  shipment_type?: 'b2b' | 'b2c'
  breadth?: number
  height?: number
  isReverse?: boolean
  preferred_carriers?: number[]
  delivery_type?: number
  extra_info?: boolean
  cost_info?: boolean
  source_pincode?: number
  destination_pincode?: number
  pickupId?: string
  // Hint that this call is coming from a rate calculator UI (we can skip heavy live checks)
  isCalculator?: boolean
}

// Delhivery-only serviceability.

// Assumes same imports / db / eq / tables are available as before.

type LocRow = {
  id: string
  pincode: string
  city?: string | null
  state?: string | null
  country?: string | null
  tags?: string[] | string | null
}

const normalizeTags = (raw: string[] | string | null | undefined): string[] => {
  if (!raw) return []
  if (Array.isArray(raw)) return raw.map((t) => String(t).toLowerCase())
  return String(raw)
    .split(/[;,]/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
}

const fetchLocationByPincode = async (pincode: string): Promise<LocRow | null> => {
  const rows = await db
    .select({
      id: locations.id,
      pincode: locations.pincode,
      city: locations.city,
      state: locations.state,
      country: locations.country,
      tags: locations.tags,
    })
    .from(locations)
    .where(eq(locations.pincode, pincode))
    .limit(1)

  const row = rows[0] as unknown as LocRow | undefined
  if (!row) return null
  return {
    ...row,
    tags: normalizeTags(row.tags),
  }
}

const hasTag = (loc: LocRow | null, tag: string) =>
  !!loc && Array.isArray(loc.tags) && loc.tags.includes(tag.toLowerCase())

/**
 * Determine B2C zone classification for a shipment
 *
 * Priority order (most specific → broadest):
 *  1. Special Zones
 *  2. Within City (city + state must both match)
 *  3. Within State (same state, different city)
 *  4. Metro to Metro (different metro cities, cross-state or same state)
 *  5. Within Region (north/south/east/west)
 *  6. ROI (Rest of India - fallback)
 */
const determineB2CZoneKey = (
  origin: LocRow | null,
  destination: LocRow | null,
): { key: string; reason: string } => {
  if (!origin || !destination) {
    return { key: 'ROI', reason: 'origin or destination missing' }
  }
  // 1. Special Zones (always override)
  if (
    hasTag(origin, 'special_zones') ||
    hasTag(origin, 'special_zone') ||
    hasTag(destination, 'special_zones') ||
    hasTag(destination, 'special_zone') ||
    hasTag(origin, 'special') ||
    hasTag(destination, 'special')
  ) {
    return { key: 'SPECIAL_ZONE', reason: 'special zone tag present' }
  }

  // 2. Within City (requires same city + same state)
  if (
    origin.city &&
    destination.city &&
    origin.state &&
    destination.state &&
    (origin.city ?? '').toLowerCase() === (destination.city ?? '').toLowerCase() &&
    (origin.state ?? '').toLowerCase() === (destination.state ?? '').toLowerCase()
  ) {
    return { key: 'WITHIN_CITY', reason: 'same city + same state' }
  }

  // 3. Within State (same state, but different cities)
  if (
    origin.state &&
    destination.state &&
    (origin.state ?? '').toLowerCase() === (destination.state ?? '').toLowerCase() &&
    (origin.city ?? '').toLowerCase() !== (destination.city ?? '').toLowerCase()
  ) {
    return { key: 'WITHIN_STATE', reason: 'same state (different city)' }
  }

  // 4. Metro to Metro (different metro cities — cross-state or within same state)
  if (
    hasTag(origin, 'metros') &&
    hasTag(destination, 'metros') &&
    (origin.city ?? '').toLowerCase() !== (destination.city ?? '').toLowerCase()
  ) {
    return { key: 'METRO_TO_METRO', reason: 'both metros (different cities, cross-state allowed)' }
  }

  // 5. Within Region (north/south/east/west)
  const regions = ['north', 'south', 'east', 'west']
  for (const r of regions) {
    if (hasTag(origin, r) && hasTag(destination, r)) {
      return { key: 'WITHIN_REGION', reason: `both in region ${r}` }
    }
  }

  // 6. Fallback ROI
  return { key: 'ROI', reason: 'fallback Rest of India' }
}

/**
 * Map internal zone key to the DB's zones.code string.
 * Adjust the right-hand values if your zones.code uses different wording.
 */
const ZONE_KEY_TO_DB_CODE: Record<string, string> = {
  METRO_TO_METRO: 'Metro to Metro',
  ROI: 'ROI',
  SPECIAL_ZONE: 'Special Zone',
  WITHIN_CITY: 'Within City',
  WITHIN_REGION: 'Within Region',
  WITHIN_STATE: 'Within State',
}

/**
 * Fetch zone row by zones.code; fallback to ROI if not found.
 */
const fetchZoneIdByKey = async (
  key: string,
): Promise<{ id: string; code: string; name?: string }> => {
  const dbCodeRaw = ZONE_KEY_TO_DB_CODE[key] ?? ZONE_KEY_TO_DB_CODE['ROI']
  const dbCode = dbCodeRaw?.trim()

  if (!dbCode) {
    throw new Error('fetchZoneIdByKey called with empty dbCode')
  }

  // console.log('Looking up zone for dbCode:', JSON.stringify(dbCode))

  // Debug: list b2c zones (already working for you)
  // const zonesB2C = await db
  //   .select({
  //     id: zones.id,
  //     code: zones.code,
  //     name: zones.name,
  //     type: zones.business_type,
  //   })
  //   .from(zones)
  //   .where(sql`lower(trim(${zones.business_type})) = 'b2c'`)
  //   .orderBy(zones.id)

  // console.log('--- Zones with type = b2c ---')
  // zonesB2C.forEach((z: any) => {
  //   console.log(
  //     `id=${z.id}, code=${JSON.stringify(z.code)}, name=${JSON.stringify(z.name)}, type=${z.type}`,
  //   )
  // })
  // console.log('--- End b2c zones list ---')

  // Use trimmed, case-insensitive comparisons on DB columns.
  // 1) Try trimmed exact match first (fast)
  const exactTrim = await db
    .select({ id: zones.id, code: zones.code, name: zones.name })
    .from(zones)
    .where(sql`trim(${zones.code}) = ${dbCode}`)
    .limit(1)

  if (exactTrim?.[0]?.id) {
    // console.log('Matched by exact trimmed code:', exactTrim[0].code)
    return { id: exactTrim[0].id, code: exactTrim[0].code, name: exactTrim[0].name }
  }

  // 2) Try case-insensitive match using LOWER(TRIM(...)) on the DB column
  const ci = await db
    .select({ id: zones.id, code: zones.code, name: zones.name })
    .from(zones)
    .where(sql`lower(trim(${zones.code})) = ${dbCode.toLowerCase()}`)
    .limit(1)

  if (ci?.[0]?.id) {
    // console.log('Matched by ci trimmed code:', ci[0].code)
    return { id: ci[0].id, code: ci[0].code, name: ci[0].name }
  }

  // 3) Try matching against the 'name' column (case-insensitive, trimmed)
  const nameMatch = await db
    .select({ id: zones.id, code: zones.code, name: zones.name })
    .from(zones)
    .where(sql`lower(trim(${zones.name})) = ${dbCode.toLowerCase()}`)
    .limit(1)

  if (nameMatch?.[0]?.id) {
    // console.log('Matched by ci trimmed name:', nameMatch[0].name)
    return { id: nameMatch[0].id, code: nameMatch[0].code, name: nameMatch[0].name }
  }

  // 4) Fallback to ROI row (try both code and name, trimmed & lower)
  const roiKeyLower = (ZONE_KEY_TO_DB_CODE['ROI'] ?? 'ROI').toLowerCase().trim()
  const fallback = await db
    .select({ id: zones.id, code: zones.code, name: zones.name })
    .from(zones)
    .where(
      sql`lower(trim(${zones.code})) = ${roiKeyLower} OR lower(trim(${zones.name})) = ${roiKeyLower}`,
    )
    .limit(1)

  if (fallback?.[0]?.id) {
    console.log('Falling back to ROI zone:', fallback[0].code)
    return { id: fallback[0].id, code: fallback[0].code, name: fallback[0].name }
  }

  throw new Error(
    'Zone lookup failed: no matching zone found and ROI fallback missing in zones table',
  )
}

/**
 * Compute slab-based B2C freight using rate card data.
 */
export const computeB2CFreightForOrder = async (params: {
  userId: string
  courierId: number | string
  serviceProvider?: string | null
  mode?: string | null
  selectedMaxSlabWeight?: number | null
  zoneIdOverride?: string | null
  destinationPincode: string
  originPincode: string
  weightG: number
  lengthCm: number
  breadthCm: number
  heightCm: number
  isReverse?: boolean
}) => {
  // Resolve active plan
  const [userPlan] = await db
    .select({ planId: userPlans.plan_id })
    .from(userPlans)
    .where(and(eq(userPlans.userId, params.userId), eq(userPlans.is_active, true)))
    .limit(1)

  if (!userPlan?.planId) {
    throw new HttpError(400, 'No active plan found for user to compute freight')
  }

  // Determine zone
  const zoneRow = params.zoneIdOverride
    ? (
        await db
          .select({ id: zones.id, code: zones.code, name: zones.name })
          .from(zones)
          .where(eq(zones.id, params.zoneIdOverride))
          .limit(1)
      )[0]
    : null

  const resolvedZoneRow =
    zoneRow ??
    (await (async () => {
      const [originLoc, destLoc] = await Promise.all([
        fetchLocationByPincode(params.originPincode),
        fetchLocationByPincode(params.destinationPincode),
      ])
      const { key: zoneKey } = determineB2CZoneKey(originLoc, destLoc)
      return fetchZoneIdByKey(zoneKey)
    })())

  const rateType = params.isReverse ? 'rto' : 'forward'
  const resolvedServiceProvider =
    params.serviceProvider?.trim() ||
    (params.courierId !== undefined && params.courierId !== null
      ? (
          await db
            .select({ serviceProvider: couriers.serviceProvider })
            .from(couriers)
            .where(eq(couriers.id, Number(params.courierId)))
            .limit(1)
        )[0]?.serviceProvider ?? null
      : null)

  const [rateCard] = await fetchResolvedB2CRateCards({
    planId: userPlan.planId,
    zoneId: resolvedZoneRow.id,
    courierId: Number(params.courierId),
    serviceProvider: resolvedServiceProvider,
    mode: params.mode?.trim() || null,
    type: rateType,
  })

  if (!rateCard) {
    throw new HttpError(400, 'No rate card found for selected courier/zone')
  }
  const freightCalc = computeB2CRateCardCharge({
    actual_weight_g: params.weightG,
    length_cm: params.lengthCm,
    width_cm: params.breadthCm,
    height_cm: params.heightCm,
    rateCard,
    selected_max_slab_weight: params.selectedMaxSlabWeight ?? null,
  })

  if (rateCard.slabs.length && freightCalc.freight <= 0) {
    throw new HttpError(400, 'No slab configured for selected courier/zone/weight')
  }

  return {
    ...freightCalc,
    slab_weight: freightCalc.slab_weight,
    base_price: freightCalc.base_price,
    zone_id: resolvedZoneRow.id,
    plan_id: userPlan.planId,
    selected_slab: freightCalc.selected_slab,
  }
}

const convertKgToGrams = (value: unknown) => {
  const numericValue = Number(value ?? 0)
  if (!Number.isFinite(numericValue) || numericValue <= 0) return 0
  return Math.round(numericValue * 1000)
}

const normalizeServiceabilityWeightToGrams = (value: unknown) => {
  const numericValue = Number(value ?? 0)
  if (!Number.isFinite(numericValue) || numericValue <= 0) return 0
  return numericValue > 50 ? Math.round(numericValue) : Math.round(numericValue * 1000)
}

//ADMIN CALCULATION
export const fetchAvailableCouriersWithRatesAdmin = async (
  params: NimbusServiceabilityParams,
  planId?: string,
) => {
  return fetchAvailableCouriersWithRates(params, {
    planIdOverride: planId ?? null,
  })
}

function parseEddToDays(edd: string | null | undefined): number {
  if (!edd) return Infinity

  // Case 1: valid date (e.g. "2025-09-15")
  const asDate = new Date(edd)
  if (!isNaN(asDate.getTime())) {
    const today = new Date()
    const diffMs = asDate.getTime() - today.getTime()
    return Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)))
  }

  // Case 2: "2-3 Days" or "4 Days"
  const match = edd.match(/(\d+)/)
  if (match) return parseInt(match[1], 10)

  return Infinity
}

/**
 * Filter couriers by business_type
 * Only returns couriers that have the specified business type in their business_type array
 * @param courierList - Array of courier objects with at least an `id` property
 * @param expectedBusinessType - 'b2c' or 'b2b'
 * @returns Filtered array of couriers that support the expected business type
 */
async function filterCouriersByBusinessType(
  courierList: any[],
  expectedBusinessType: 'b2c' | 'b2b',
): Promise<any[]> {
  if (!courierList || courierList.length === 0) {
    return []
  }

  const courierIds = courierList
    .map((c: any) => c.id)
    .filter((id: any) => id !== undefined && id !== null)

  if (courierIds.length === 0) {
    return []
  }

  // Fetch business_type for all couriers
  const courierBusinessTypes = await db
    .select({ id: couriers.id, businessType: couriers.businessType })
    .from(couriers)
    .where(inArray(couriers.id, courierIds))

  const businessTypeMap = new Map(
    courierBusinessTypes.map((c) => [c.id, c.businessType as ('b2c' | 'b2b')[]]),
  )

  // Filter couriers to only include those with the expected business type
  const filtered = courierList.filter((c: any) => {
    const types = businessTypeMap.get(c.id) || []
    const hasBusinessType = Array.isArray(types) && types.includes(expectedBusinessType)

    if (!hasBusinessType) {
      console.log('🚫 Removing courier - wrong business_type', {
        courierId: c.id,
        courierName: c.name,
        businessType: types,
        expected: expectedBusinessType,
      })
    }

    return hasBusinessType
  })

  return filtered
}

type FetchCouriersOptions =
  | string
  | {
      userId?: string
      planIdOverride?: string | null
      planFallbackName?: string | null
    }

export const fetchAvailableCouriersWithRates = async (
  params: NimbusServiceabilityParams & { pickupId?: string },
  userOrOptions?: FetchCouriersOptions,
) => {
  try {
    // ✅ B2C only - B2B should use fetchAvailableCouriersWithRatesB2B
    if (params.shipment_type && params.shipment_type !== 'b2c') {
      throw new Error(
        `fetchAvailableCouriersWithRates is for B2C only. Use fetchAvailableCouriersWithRatesB2B for ${params.shipment_type}`,
      )
    }

    const options =
      typeof userOrOptions === 'string'
        ? {
            userId: userOrOptions,
          }
        : (userOrOptions ?? {})

    const { userId, planIdOverride, planFallbackName } = options

    const isCalculator = params.isCalculator === true

    // 🔹 Cache key (per user + params)
    const normalizePincode = (value: unknown): number | undefined => {
      if (typeof value === 'number' && !Number.isNaN(value)) {
        return Number(value)
      }
      if (typeof value === 'string' && value.trim()) {
        const parsed = Number(value.trim())
        return Number.isNaN(parsed) ? undefined : parsed
      }
      return undefined
    }

    // const isReverseShipment = params.isReverse === true || params.payment_type === 'reverse'

    // Build registry of enabled couriers by service provider
    // Filter by business type: check if business_type JSONB array contains 'b2c'
    const SUPPORTED_PROVIDERS = ['delhivery', 'ekart', 'xpressbees']
    const systemCourierRows = await db
      .select({
        id: couriers.id,
        serviceProvider: couriers.serviceProvider,
        name: couriers.name,
        createdAt: couriers.createdAt,
      })
      .from(couriers)
      .where(and(eq(couriers.isEnabled, true), sql`${couriers.businessType} @> '["b2c"]'::jsonb`))

    const normalizeProviderKey = (value?: string | null) => {
      if (!value) return ''
      return value.trim().toLowerCase()
    }

    const makeCourierIdentityKey = (courier: {
      id: number | string
      integration_type?: string | null
      serviceProvider?: string | null
      max_slab_weight?: number | null
    }) =>
      `${String(courier.id)}__${normalizeProviderKey(courier.integration_type || courier.serviceProvider || null)}__${courier.max_slab_weight ?? 'base'}`

    const courierNameAlreadyHasWeight = (name?: string | null) =>
      /\b\d+(\.\d+)?\s*(k\.?\s*g\.?|kg)\b/i.test(String(name || ''))

    const formatCourierOptionName = (courierName: string, slabWeightTo: number | null) => {
      if (courierNameAlreadyHasWeight(courierName)) return courierName
      return formatCourierSlabDisplayName(courierName, slabWeightTo)
    }

    interface CourierRow {
      id: number
      serviceProvider: string | null
      name: string
      createdAt: Date | null
    }

    interface ProviderBucket {
      rows: CourierRow[]
      idSet: Set<number>
    }

    const providerCourierBuckets = new Map<string, ProviderBucket>()

    for (const row of systemCourierRows) {
      const providerKey = normalizeProviderKey(row.serviceProvider)
      if (!providerKey || !SUPPORTED_PROVIDERS.includes(providerKey)) continue
      if (providerKey === 'delhivery' && !DELHIVERY_ALLOWED_COURIER_IDS.includes(Number(row.id))) {
        continue
      }

      if (!providerCourierBuckets.has(providerKey)) {
        providerCourierBuckets.set(providerKey, { rows: [], idSet: new Set<number>() })
      }

      const bucket = providerCourierBuckets.get(providerKey)!
      bucket.rows.push(row)
      bucket.idSet.add(Number(row.id))
    }

    const systemCourierMap = Object.fromEntries(
      [...providerCourierBuckets.entries()].map(([providerKey, bucket]) => [providerKey, bucket.idSet]),
    ) as Record<string, Set<number>>

    interface ServiceableProviderMeta {
      providerKey: string
      providerId: string
      providerName?: string
      codAvailable: boolean
      prepaidAvailable: boolean
      edd: string
      raw: any
      matchedCourierIds: Set<number>
    }

    const serviceableProviders = new Map<string, ServiceableProviderMeta>()

    const registerServiceableProvider = (
      providerKeyCandidate: string,
      meta: Omit<ServiceableProviderMeta, 'providerKey' | 'matchedCourierIds'>,
    ) => {
      const normalizedKey = normalizeProviderKey(providerKeyCandidate)
      if (!normalizedKey) return
      serviceableProviders.set(normalizedKey, {
        ...meta,
        providerKey: normalizedKey,
        matchedCourierIds: new Set<number>(),
      })
    }

    const isCourierInSystem = (provider: string | undefined, id: any) => {
      if (!provider) return false
      const normalizedProvider = provider.toLowerCase()
      const set = systemCourierMap[normalizedProvider]
      if (!set) return false
      const numericId = Number(id)
      if (Number.isNaN(numericId)) return false
      return set.has(numericId)
    }

    // Registry of enabled providers (by serviceProvider string)
    const enabledProviders = new Set(Object.keys(systemCourierMap))

    // 🔹 Start with an empty list of candidate couriers
    let combinedCouriers: any[] = []

    // 🟢 Delhivery Serviceability (called for both calculator and non-calculator flows)
    let delhiveryAvailable = false
    let delhiveryOriginServiceable = false
    let delhiveryDestinationServiceable = false
    let delhiveryEDD = '3-5 Days'
    let delhiveryResp: any = null
    const normalizedPaymentType = String(params.payment_type || 'prepaid')
      .trim()
      .toLowerCase()
    const delhiveryRequiresCOD = normalizedPaymentType === 'cod'

    if (enabledProviders.has('delhivery')) {
      const delhivery = new DelhiveryService()
      const originPincode = normalizePincode(params.origin ?? params.source_pincode)?.toString()
      const destinationPincode = normalizePincode(
        params.destination ?? params.destination_pincode,
      )?.toString()

      console.log('[Serviceability] Delhivery pincode check start', {
        mode: isCalculator ? 'calculator' : 'standard',
        origin: originPincode,
        destination: destinationPincode,
      })

      if (originPincode && destinationPincode) {
        const [originResp, destinationResp] = await Promise.all([
          delhivery.checkServiceability(originPincode),
          delhivery.checkServiceability(destinationPincode),
        ])
        delhiveryResp = destinationResp

        const originService = originResp?.delivery_codes?.[0]?.postal_code
        const destinationService = destinationResp?.delivery_codes?.[0]?.postal_code

        delhiveryOriginServiceable =
          Boolean(originResp?.delivery_codes?.length) && originService?.pickup === 'Y'
        delhiveryDestinationServiceable =
          Boolean(destinationResp?.delivery_codes?.length) &&
          (delhiveryRequiresCOD
            ? destinationService?.cod === 'Y'
            : destinationService?.pre_paid === 'Y')

        console.log('[Serviceability] Delhivery pincode check result', {
          mode: isCalculator ? 'calculator' : 'standard',
          origin: originPincode,
          destination: destinationPincode,
          paymentType: normalizedPaymentType,
          requiresCOD: delhiveryRequiresCOD,
          originAvailableRecords: originResp?.delivery_codes?.length ?? 0,
          destinationAvailableRecords: destinationResp?.delivery_codes?.length ?? 0,
          originPickup: originService?.pickup,
          destinationPrePaid: destinationService?.pre_paid,
          destinationCod: destinationService?.cod,
          destinationRemark: destinationService?.remark ?? '',
        })

        delhiveryAvailable = delhiveryOriginServiceable && delhiveryDestinationServiceable

        // Keep calculator path lighter: serviceability is required, TAT is optional.
        if (delhiveryAvailable && !isCalculator) {
          const tatResp = await delhivery.getExpectedTAT(
            originPincode,
            destinationPincode,
            'S',
            'B2C',
          )
          if (tatResp && Number.isFinite(Number(tatResp)) && Number(tatResp) > 0) {
            delhiveryEDD = `${Number(tatResp)} Days`
          }
          console.log('[Serviceability] Delhivery TAT evaluated', {
            mode: 'standard',
            origin: originPincode,
            destination: destinationPincode,
            tat: tatResp,
            edd: delhiveryEDD,
          })
        }
      } else {
        console.log('[Serviceability] Delhivery pincode validation skipped (missing input)', {
          mode: isCalculator ? 'calculator' : 'standard',
          origin: originPincode,
          destination: destinationPincode,
        })
      }
    }

    if (delhiveryAvailable) {
      registerServiceableProvider('delhivery', {
        providerId: 'delhivery',
        providerName: 'Delhivery',
        codAvailable: delhiveryResp?.delivery_codes?.[0]?.postal_code?.cod === 'Y',
        prepaidAvailable: delhiveryResp?.delivery_codes?.[0]?.postal_code?.pre_paid === 'Y',
        edd: delhiveryEDD,
        raw: delhiveryResp,
      })
    }

    console.log('[Serviceability] Delhivery candidate couriers prepared', {
      mode: isCalculator ? 'calculator' : 'standard',
      destination: params.destination?.toString(),
      available: delhiveryAvailable,
      originServiceable: delhiveryOriginServiceable,
      destinationServiceable: delhiveryDestinationServiceable,
      candidates: providerCourierBuckets.get('delhivery')?.rows.length ?? 0,
    })

    // 🟢 Ekart Serviceability V3
    let ekartAvailable = false
    let ekartResp: any = null
    let ekartEDD = '3-5 Days'
    if (enabledProviders.has('ekart')) {
      const ekart = new EkartService()
      const originPincode = normalizePincode(params.origin ?? params.source_pincode)?.toString()
      const destinationPincode = normalizePincode(
        params.destination ?? params.destination_pincode,
      )?.toString()
      const orderAmountValue = Number(params.order_amount ?? params.orderAmount ?? 0)
      const invoiceAmountAvailable = orderAmountValue > 0

      if (!invoiceAmountAvailable) {
        console.warn('⚠️ Skipping Ekart serviceability: positive order_amount required', {
          originPincode,
          destinationPincode,
          order_amount: params.order_amount ?? params.orderAmount ?? null,
        })
      }

      if (originPincode && destinationPincode && invoiceAmountAvailable) {
        try {
          ekartResp = await ekart.checkServiceability({
            pickupPincode: originPincode,
            dropPincode: destinationPincode,
            length: String(params.length ?? 0),
            height: String(params.height ?? 0),
            width: String(params.breadth ?? 0),
            weight: String(Number(params.weight ?? 0) / 1000), // grams → kg
            paymentType: params.payment_type === 'cod' ? 'COD' : 'Prepaid',
            invoiceAmount: String(orderAmountValue),
            codAmount: params.payment_type === 'cod' ? String(orderAmountValue) : undefined,
          })
          ekartAvailable = ekartResp.serviceable === true
          console.log('[Serviceability] Ekart response', {
            serviceable: ekartResp.serviceable,
            records: ekartResp.records?.length ?? null,
            availability: ekartResp.availability,
          })
          if (ekartResp?.tat) {
            ekartEDD = `${ekartResp.tat} Days`
          }
        } catch (err: any) {
          console.error(
            '❌ Ekart serviceability error:',
            err?.response?.data || err?.message || err,
          )
        }
      }
    }

    const getFirstNonEmptyString = (...values: Array<string | undefined | null>) => {
      for (const value of values) {
        if (typeof value === 'string' && value.trim()) {
          return value.trim()
        }
      }
      return null
    }

    if (ekartAvailable) {
      const ekartProviderIdentifier =
        getFirstNonEmptyString(
          ekartResp?.availability?.service_type,
          ekartResp?.availability?.courier_id,
        ) ?? 'ekart'

      registerServiceableProvider(ekartProviderIdentifier, {
        providerId: ekartProviderIdentifier,
        providerName: 'Ekart Logistics',
        codAvailable: ekartResp?.codAvailable ?? true,
        prepaidAvailable: ekartResp?.prepaidAvailable ?? true,
        edd: ekartEDD,
        raw: ekartResp,
      })

      console.log('[Serviceability] Ekart candidate couriers prepared', {
        mode: isCalculator ? 'calculator' : 'standard',
        destination: params.destination?.toString(),
        available: ekartAvailable,
        records: ekartResp?.records?.length ?? 0,
        candidates: providerCourierBuckets.get('ekart')?.rows.length ?? 0,
      })
    }

    let xpressbeesAvailable = false
    let xpressbeesResp: any = null
    if (enabledProviders.has('xpressbees')) {
      const xpressbees = new XpressbeesService()
      const originPincode = normalizePincode(params.origin ?? params.source_pincode)?.toString()
      const destinationPincode = normalizePincode(
        params.destination ?? params.destination_pincode,
      )?.toString()
      const orderAmountValue = Number(params.order_amount ?? params.orderAmount ?? 0)

      if (originPincode && destinationPincode && orderAmountValue > 0) {
        try {
          xpressbeesResp = await xpressbees.checkServiceability({
            origin: originPincode,
            destination: destinationPincode,
            payment_type: params.payment_type === 'cod' ? 'cod' : 'prepaid',
            order_amount: String(orderAmountValue),
            weight: String(Number(params.weight ?? 0)),
            length: String(Number(params.length ?? 0)),
            breadth: String(Number(params.breadth ?? 0)),
            height: String(Number(params.height ?? 0)),
          })
          xpressbeesAvailable = xpressbeesResp.serviceable === true
          console.log('[Serviceability] Xpressbees response', {
            serviceable: xpressbeesResp.serviceable,
            records: xpressbeesResp.records?.length ?? 0,
          })
        } catch (err: any) {
          console.error(
            '❌ Xpressbees serviceability error:',
            err?.response?.data || err?.message || err,
          )
        }
      }
    }

    if (xpressbeesAvailable) {
      registerServiceableProvider('xpressbees', {
        providerId: 'xpressbees',
        providerName: 'Xpressbees',
        codAvailable: xpressbeesResp?.codAvailable ?? true,
        prepaidAvailable: xpressbeesResp?.prepaidAvailable ?? true,
        edd: '3-5 Days',
        raw: xpressbeesResp,
      })

      console.log('[Serviceability] Xpressbees candidate couriers prepared', {
        mode: isCalculator ? 'calculator' : 'standard',
        destination: params.destination?.toString(),
        available: xpressbeesAvailable,
        records: xpressbeesResp?.records?.length ?? 0,
        candidates: providerCourierBuckets.get('xpressbees')?.rows.length ?? 0,
      })
    }

    for (const [providerKey, bucket] of providerCourierBuckets.entries()) {
      const providerMeta = serviceableProviders.get(providerKey)
      if (!providerMeta) continue

      for (const courier of bucket.rows) {
        const xpressbeesRecord =
          providerKey === 'xpressbees'
            ? xpressbeesResp?.records?.find(
                (record: any) => String(record?.id || '').trim() === String(courier.id).trim(),
              )
            : null
        providerMeta.matchedCourierIds.add(Number(courier.id))
        combinedCouriers.push({
          id: courier.id,
          name: courier.name,
          integration_type: providerKey,
          serviceProvider: courier.serviceProvider ?? providerKey,
          cod: providerMeta.codAvailable,
          prepaid: providerMeta.prepaidAvailable,
          edd: providerMeta.edd,
          approxZone: null,
          createdAt: courier.createdAt,
          courier_cost_estimate:
            xpressbeesRecord?.total_charges ??
            xpressbeesRecord?.freight_charges ??
            null,
          freight_charges: xpressbeesRecord?.freight_charges ?? null,
          cod_charges: xpressbeesRecord?.cod_charges ?? null,
          total_charges: xpressbeesRecord?.total_charges ?? null,
          chargeable_weight: xpressbeesRecord?.chargeable_weight ?? null,
          provider_serviceability: xpressbeesRecord ?? null,
        })
      }
    }

    const providerMappings = Array.from(serviceableProviders.values()).map((meta) => ({
      providerId: meta.providerId,
      providerKey: meta.providerKey,
      matchedCourierIds: Array.from(meta.matchedCourierIds),
    }))
    if (providerMappings.length) {
      console.log('[Serviceability] Provider-to-courier mapping', { providerMappings })
      const unmatchedProviders = providerMappings.filter((mapping) => mapping.matchedCourierIds.length === 0)
      if (unmatchedProviders.length) {
        console.warn('[Serviceability] Serviceable providers missing DB configuration', { unmatchedProviders })
      }
    }

    // Delhivery-only mode: no non-Delhivery live serviceability checks.

    // ✅ Local rate & zone logic - Fetch for ALL service providers
    let localRates: any[] = []
    let approxZone: { id: string; code: string; name?: string } | null = null

    if (params.shipment_type === 'b2c') {
      const originPincode = params.origin?.toString()
      const destinationPincode = params.destination?.toString()

      const [originLoc, destLoc] = await Promise.all([
        originPincode ? fetchLocationByPincode(originPincode) : null,
        destinationPincode ? fetchLocationByPincode(destinationPincode) : null,
      ])

      const { key: zoneKey } = determineB2CZoneKey(originLoc, destLoc)
      const zoneRow = await fetchZoneIdByKey(zoneKey)
      approxZone = { id: zoneRow.id, code: zoneRow.code, name: zoneRow.name }

      let activePlanId: string | null | undefined = planIdOverride ?? null

      if (!activePlanId && userId) {
        const [returnedUser] = await db
          .select({ planId: userPlans.plan_id })
          .from(userPlans)
          .where(and(eq(userPlans.userId, userId), eq(userPlans.is_active, true)))
          .limit(1)
        activePlanId = returnedUser?.planId ?? null
      }

      if (!activePlanId && planFallbackName) {
        const normalizedFallback = planFallbackName.toLowerCase()
        const [fallbackPlan] = await db
          .select({ id: plans.id })
          .from(plans)
          .where(sql`lower(${plans.name}) = ${normalizedFallback}`)
          .limit(1)
        activePlanId = fallbackPlan?.id ?? null
      }

      if (activePlanId) {
        localRates = await fetchResolvedB2CRateCards({
          planId: activePlanId,
          zoneId: zoneRow.id,
        })
      }
    }

    // 🔹 Calculate chargeable weight if dimensions are provided
    const serviceabilityWeightG = normalizeServiceabilityWeightToGrams(params.weight)
    let chargeableWeight: number | null = null
    if (
      params.length &&
      params.breadth &&
      params.height &&
      params.length > 0 &&
      params.breadth > 0 &&
      params.height > 0
    ) {
      try {
        const weightCalc = calculateOrderWeights({
          actualWeight: serviceabilityWeightG > 0 ? serviceabilityWeightG / 1000 : undefined,
          dimensions: {
            length: params.length,
            breadth: params.breadth,
            height: params.height,
          },
        })
        chargeableWeight = Math.round(weightCalc.chargedWeight * 1000) // Convert back to grams and round
        console.log('✅ Calculated chargeable weight:', {
          actualWeight: serviceabilityWeightG,
          dimensions: { length: params.length, breadth: params.breadth, height: params.height },
          chargeableWeight,
          volumetricWeight: weightCalc.volumetricWeight * 1000,
        })
      } catch (error) {
        console.error('❌ Error calculating chargeable weight:', error)
      }
    } else {
      console.log('⚠️ Skipping chargeable weight calculation - missing dimensions:', {
        length: params.length,
        breadth: params.breadth,
        height: params.height,
      })
    }

    // 🔹 Merge local rates with couriers
    // Match couriers with local rates by courier_id
    // Include ALL couriers (even if they don't have local rates) - they have service provider response data
    const isReverseShipment = params.isReverse === true || params.payment_type === 'reverse'

    const buildServiceabilityRateOptions = (rateCard: any) => {
      const computed = computeB2CRateCardCharge({
        actual_weight_g: serviceabilityWeightG,
        length_cm: Number(params.length ?? 0),
        width_cm: Number(params.breadth ?? 0),
        height_cm: Number(params.height ?? 0),
        rateCard,
      })

      if (!rateCard?.slabs?.length) {
        return computed.freight > 0
          ? [
              {
                rate: computed.freight,
                cod_charges: rateCard.cod_charges,
                cod_percent: rateCard.cod_percent,
                other_charges: rateCard.other_charges,
                mode: rateCard.mode,
                min_weight: rateCard.min_weight,
                slabs: rateCard.slabs,
                selected_slab: computed.selected_slab,
                slab_weight: computed.slab_weight,
                chargeable_weight: computed.chargeable_weight,
                volumetric_weight: computed.volumetric_weight,
                slab_count: computed.slabs,
                max_slab_weight: computed.max_slab_weight,
                matched_by: computed.matched_by,
              },
            ]
          : []
      }

      const chargeableWeightKg = computed.chargeable_weight / 1000
      const matchedIndex = findMatchingSlabIndex(computed.chargeable_weight, rateCard.slabs)

      if (matchedIndex >= 0) {
        return rateCard.slabs.slice(matchedIndex).map((slab: any) => ({
          rate: Number(slab.rate),
          cod_charges: rateCard.cod_charges,
          cod_percent: rateCard.cod_percent,
          other_charges: rateCard.other_charges,
          mode: rateCard.mode,
          min_weight: rateCard.min_weight,
          slabs: rateCard.slabs,
          selected_slab: slab,
          slab_weight: null,
          chargeable_weight: computed.chargeable_weight,
          volumetric_weight: computed.volumetric_weight,
          slab_count: null,
          max_slab_weight: slab.weight_to,
          matched_by: 'slab',
        }))
      }

      const lastFiniteSlab = [...rateCard.slabs].reverse().find((slab: any) => slab.weight_to !== null) || null
      if (
        lastFiniteSlab &&
        chargeableWeightKg > lastFiniteSlab.weight_to &&
        lastFiniteSlab.extra_rate !== null &&
        lastFiniteSlab.extra_weight_unit !== null
      ) {
        const extraUnits = Math.ceil(
          (chargeableWeightKg - lastFiniteSlab.weight_to) / lastFiniteSlab.extra_weight_unit,
        )
        return [
          {
            rate: Number(lastFiniteSlab.rate) + extraUnits * Number(lastFiniteSlab.extra_rate),
            cod_charges: rateCard.cod_charges,
            cod_percent: rateCard.cod_percent,
            other_charges: rateCard.other_charges,
            mode: rateCard.mode,
            min_weight: rateCard.min_weight,
            slabs: rateCard.slabs,
            selected_slab: lastFiniteSlab,
            slab_weight: lastFiniteSlab.extra_weight_unit * 1000,
            chargeable_weight: computed.chargeable_weight,
            volumetric_weight: computed.volumetric_weight,
            slab_count: null,
            max_slab_weight: lastFiniteSlab.weight_to,
            matched_by: 'last_slab_extra',
          },
        ]
      }

      return []
    }

    let combined = combinedCouriers
      ?.flatMap((courier: any) => {
        const providerKey = String(courier.integration_type || courier.service_provider || '')
          .toLowerCase()
          .trim()
        const providerMode =
          normalizeB2CShippingMode(
            courier?.shipping_mode ??
              courier?.service_mode ??
              courier?.provider_serviceability?.shipping_mode ??
              courier?.provider_serviceability?.service_mode ??
              courier?.provider_serviceability?.mode ??
              courier?.mode,
          ) ||
          (providerKey === 'delhivery'
            ? normalizeB2CShippingMode(getDelhiveryShippingModeByCourierId(courier?.id))
            : '')
        // Find local rates for this courier
        const courierRates = localRates.filter(
          (r) =>
            r.courier_id.toString() === courier.id.toString() &&
            (!providerKey ||
              !r.service_provider ||
              String(r.service_provider).toLowerCase().trim() === providerKey),
        )

        const matchedCourierRates = providerMode
          ? courierRates.filter((r) => normalizeB2CShippingMode(r.mode) === providerMode)
          : courierRates
        const blankModeCourierRates = courierRates.filter((r) => !normalizeB2CShippingMode(r.mode))
        const effectiveCourierRates = providerMode
          ? matchedCourierRates.length
            ? matchedCourierRates
            : blankModeCourierRates
          : courierRates

        // Build localRates object from matching rates
        // Compute slabbed freight if we have a matching rate
        const rateType = isReverseShipment ? 'rto' : 'forward'
        const applicableRateCards = effectiveCourierRates.filter((r) => r.type === rateType)
        const applicableRateOptions = applicableRateCards.flatMap((r) => buildServiceabilityRateOptions(r))

        if (!applicableRateOptions.length) {
          return [
            {
              ...courier,
              displayName: courier.name,
              localRates: {},
              approxZone,
              courier_cost_estimate:
                courier?.courier_cost_estimate ||
                courier?.rateEstimate ||
                courier?.freight_charges ||
                courier?.charge ||
                courier?.cost ||
                null,
              chargeable_weight: chargeableWeight,
              volumetric_weight: null,
              slabs: null,
              rate: courier.rate,
              max_slab_weight: null,
            },
          ]
        }

        return applicableRateOptions.map((applicableRate: any) => ({
          ...courier,
          courier_option_key: makeCourierIdentityKey({
            id: courier.id,
            integration_type: courier.integration_type || courier.service_provider || null,
            serviceProvider: courier.serviceProvider || null,
            max_slab_weight: applicableRate.max_slab_weight ?? null,
          }),
          name:
            applicableRate.matched_by !== 'legacy'
              ? formatCourierOptionName(courier.name, applicableRate.max_slab_weight)
              : courier.name,
          displayName:
            applicableRate.matched_by !== 'legacy'
              ? formatCourierOptionName(courier.name, applicableRate.max_slab_weight)
              : courier.name,
          localRates: { [rateType]: applicableRate },
          approxZone,
          courier_cost_estimate:
            courier?.courier_cost_estimate ||
            courier?.rateEstimate ||
            courier?.freight_charges ||
            courier?.charge ||
            courier?.cost ||
            null,
          chargeable_weight: applicableRate.chargeable_weight ?? chargeableWeight,
          volumetric_weight: applicableRate.volumetric_weight,
          slabs: applicableRate.slab_count,
          rate: applicableRate.rate,
          max_slab_weight: applicableRate.max_slab_weight ?? null,
        }))
      })
      // Only filter out null/undefined, not couriers without local rates
      .filter((c) => c !== null && c !== undefined)

    const requireLocalRates = params.shipment_type === 'b2c'
    combined = combined.filter((c: any) => {
      const providerKey = (c.integration_type || '').toLowerCase()
      const inSystem = isCourierInSystem(providerKey, c.id)
      const requiredRateType = isReverseShipment ? 'rto' : 'forward'
      const localRatesAvailable = !requireLocalRates || Boolean(c.localRates?.[requiredRateType])

      if (!inSystem || !localRatesAvailable) {
        console.log('🚫 Removing courier from final list', {
          courierId: c.id,
          providerKey,
          inSystem,
          localRatesAvailable,
        })
      }

      return inSystem && localRatesAvailable
    })

    // ✅ Final filter: Ensure all couriers have correct business_type
    combined = await filterCouriersByBusinessType(combined, 'b2c')

    // 🔹 Sorting and tagging
    if (userId && combined?.length) {
      const [profile] = await db
        .select()
        .from(courierPriorityProfiles)
        .where(eq(courierPriorityProfiles.user_id, userId))

      if (profile) {
        if (profile.name === 'personalised' && profile.personalised_order) {
          const courierMap: Record<string, any> = {}
          combined.forEach((c: any) => {
            courierMap[makeCourierIdentityKey(c)] = c
          })

          const ordered: any[] = []
          profile.personalised_order.forEach((p) => {
            const personalisedKey = `${String(p.courierId)}__${normalizeProviderKey((p as any).serviceProvider || (p as any).integration_type || null)}`
            const fallbackMatches = combined.filter((c: any) => String(c.id) === String(p.courierId))
            const matchedCourier =
              courierMap[personalisedKey] ||
              (fallbackMatches.length === 1 ? fallbackMatches[0] : null)
            if (matchedCourier) {
              const personalisedDisplayName =
                matchedCourier.max_slab_weight != null
                  ? formatCourierSlabDisplayName(p.name, matchedCourier.max_slab_weight)
                  : p.name
              ordered.push({
                ...matchedCourier,
                displayName: personalisedDisplayName,
              })
            }
          })
          combined.forEach((c: any) => {
            const alreadyIncluded = ordered.some(
              (existing) => makeCourierIdentityKey(existing) === makeCourierIdentityKey(c),
            )
            if (!alreadyIncluded) ordered.push(c)
          })
          combined = ordered
        } else if (profile.name === 'fastest') {
          combined = combined.sort(
            (a: any, b: any) => parseEddToDays(a.edd) - parseEddToDays(b.edd),
          )
        } else if (profile.name === 'economy') {
          combined = combined.sort(
            (a: any, b: any) =>
              (a.localRates.forward?.rate ?? Infinity) - (b.localRates.forward?.rate ?? Infinity),
          )
        } else {
          combined = combined.sort(
            (a: any, b: any) =>
              (a.localRates.forward?.rate ?? Infinity) - (b.localRates.forward?.rate ?? Infinity),
          )
        }
      }

      // Tag fastest and cheapest
      let fastestCourierId: string | null = null
      let cheapestCourierId: string | null = null

      const sortedByEdd = [...combined].sort(
        (a, b) => parseEddToDays(a.edd) - parseEddToDays(b.edd),
      )
      if (sortedByEdd.length) fastestCourierId = makeCourierIdentityKey(sortedByEdd[0])

      const sortedByRate = [...combined].sort(
        (a, b) =>
          (a.localRates.forward?.rate ?? Infinity) - (b.localRates.forward?.rate ?? Infinity),
      )
      if (sortedByRate.length) cheapestCourierId = makeCourierIdentityKey(sortedByRate[0])

      combined = combined.map((c: any) => {
        let tag = ''
        const identityKey = makeCourierIdentityKey(c)
        if (identityKey === fastestCourierId) tag = 'fastest'
        else if (identityKey === cheapestCourierId) tag = 'economy'
        return { ...c, tag }
      })
    }

    // Cache the final combined list before returning
    return combined
  } catch (error: any) {
    console.error('Error fetching combined courier rates:', error.message)
    throw new Error('Failed to fetch combined courier rates')
  }
}
export const fetchAvailableCouriersForGuest = async (params: NimbusServiceabilityParams) => {
  return fetchAvailableCouriersWithRates(params, {
    planFallbackName: 'Basic',
  })
}

// =================== B2B Courier Fetching ===================

export const fetchAvailableCouriersWithRatesB2B = async (
  params: NimbusServiceabilityParams & { pickupId?: string },
  userOrOptions?: FetchCouriersOptions,
) => {
  try {
    // ✅ B2B only
    if (params.shipment_type && params.shipment_type !== 'b2b') {
      throw new Error(
        `fetchAvailableCouriersWithRatesB2B is for B2B only. Use fetchAvailableCouriersWithRates for ${params.shipment_type}`,
      )
    }

    const options =
      typeof userOrOptions === 'string'
        ? {
            userId: userOrOptions,
          }
        : (userOrOptions ?? {})

    const { userId, planIdOverride, planFallbackName } = options

    const normalizePincode = (value: unknown): string | undefined => {
      if (typeof value === 'number' && !Number.isNaN(value)) {
        return String(value)
      }
      if (typeof value === 'string' && value.trim()) {
        return value.trim()
      }
      return undefined
    }

    // Step 1: Get origin zone from pickupId
    let originPincode: string | undefined = undefined
    let originZoneId: string | null = null

    if (params.pickupId) {
      const [pickupRow] = await db
        .select({ pincode: addresses.pincode })
        .from(pickupAddresses)
        .innerJoin(addresses, eq(pickupAddresses.addressId, addresses.id))
        .where(eq(pickupAddresses.id, params.pickupId))
        .limit(1)

      if (pickupRow?.pincode) {
        originPincode = pickupRow.pincode

        // Lookup zone from b2bPincodes
        const [originZoneRow] = await db
          .select({ zoneId: b2bPincodes.zone_id })
          .from(b2bPincodes)
          .where(eq(b2bPincodes.pincode, originPincode))
          .limit(1)

        originZoneId = originZoneRow?.zoneId ?? null
      }
    } else {
      // Fallback: use origin pincode directly if pickupId not provided
      originPincode = normalizePincode(params.source_pincode) ?? normalizePincode(params.origin)

      if (originPincode) {
        const [originZoneRow] = await db
          .select({ zoneId: b2bPincodes.zone_id })
          .from(b2bPincodes)
          .where(eq(b2bPincodes.pincode, originPincode))
          .limit(1)

        originZoneId = originZoneRow?.zoneId ?? null
      }
    }

    // Step 2: Get destination zone from destination pincode
    const destinationPincode =
      normalizePincode(params.destination_pincode) ?? normalizePincode(params.destination)

    let destinationZoneId: string | null = null

    if (destinationPincode) {
      const [destZoneRow] = await db
        .select({ zoneId: b2bPincodes.zone_id })
        .from(b2bPincodes)
        .where(eq(b2bPincodes.pincode, destinationPincode))
        .limit(1)

      destinationZoneId = destZoneRow?.zoneId ?? null
    }

    // Step 3: Validate we have both zones
    if (!originZoneId || !destinationZoneId) {
      console.error('B2B Zone lookup failed:', {
        originPincode,
        originZoneId,
        destinationPincode,
        destinationZoneId,
      })
      throw new Error(
        `B2B zone lookup failed. Origin zone: ${
          originZoneId ? 'found' : 'not found'
        }, Destination zone: ${destinationZoneId ? 'found' : 'not found'}`,
      )
    }

    console.log('✅ B2B Zone lookup successful:', {
      originPincode,
      originZoneId,
      destinationPincode,
      destinationZoneId,
    })

    // Step 4: Get active plan (similar to B2C flow)
    let activePlanId: string | null | undefined = planIdOverride ?? null

    if (!activePlanId && userId) {
      const [returnedUser] = await db
        .select({ planId: userPlans.plan_id })
        .from(userPlans)
        .where(eq(userPlans.userId, userId))
      activePlanId = returnedUser?.planId ?? null
    }

    if (!activePlanId && planFallbackName) {
      const normalizedFallback = planFallbackName.toLowerCase()
      const [fallbackPlan] = await db
        .select({ id: plans.id })
        .from(plans)
        .where(sql`lower(${plans.name}) = ${normalizedFallback}`)
        .limit(1)
      activePlanId = fallbackPlan?.id ?? null
    }

    // Step 5: Fetch B2B zone-to-zone rates
    // Get enabled couriers first - filter by business type for B2B
    const systemCourierRows = await db
      .select({ id: couriers.id, serviceProvider: couriers.serviceProvider })
      .from(couriers)
      .where(and(eq(couriers.isEnabled, true), sql`${couriers.businessType} @> '["b2b"]'::jsonb`))

    const systemCourierMap = systemCourierRows.reduce<Record<string, Set<number>>>((acc, row) => {
      const providerKey = (row.serviceProvider || '').toLowerCase()
      if (!providerKey) return acc
      if (!acc[providerKey]) acc[providerKey] = new Set<number>()
      acc[providerKey].add(Number(row.id))
      return acc
    }, {})

    // Fetch zone-to-zone rates for all enabled couriers
    const effectiveDate = new Date()
    const rateConditions: any[] = [
      eq(b2bZoneToZoneRates.origin_zone_id, originZoneId),
      eq(b2bZoneToZoneRates.destination_zone_id, destinationZoneId),
      eq(b2bZoneToZoneRates.is_active, true),
      or(
        isNull(b2bZoneToZoneRates.effective_from),
        lte(b2bZoneToZoneRates.effective_from, effectiveDate),
      ),
      or(
        isNull(b2bZoneToZoneRates.effective_to),
        gte(b2bZoneToZoneRates.effective_to, effectiveDate),
      ),
    ]

    // Filter by plan if available
    if (activePlanId) {
      rateConditions.push(
        or(eq(b2bZoneToZoneRates.plan_id, activePlanId), isNull(b2bZoneToZoneRates.plan_id)),
      )
    } else {
      rateConditions.push(isNull(b2bZoneToZoneRates.plan_id))
    }

    const zoneToZoneRates = await db
      .select({
        id: b2bZoneToZoneRates.id,
        courierId: b2bZoneToZoneRates.courier_id,
        serviceProvider: b2bZoneToZoneRates.service_provider,
        ratePerKg: b2bZoneToZoneRates.rate_per_kg,
        volumetricFactor: b2bZoneToZoneRates.volumetric_factor,
      })
      .from(b2bZoneToZoneRates)
      .where(and(...rateConditions))
      .orderBy(desc(b2bZoneToZoneRates.effective_from))

    // Step 6: Build courier list with rates
    const courierMap = new Map<number, any>()

    for (const rate of zoneToZoneRates) {
      if (!rate.courierId) continue

      // Check if courier is enabled
      const providerKey = (rate.serviceProvider || '').toLowerCase()
      const isEnabled = providerKey && systemCourierMap[providerKey]?.has(Number(rate.courierId))

      if (!isEnabled) continue

      // Get or create courier entry
      if (!courierMap.has(rate.courierId)) {
        const [courierRow] = await db
          .select()
          .from(couriers)
          .where(eq(couriers.id, rate.courierId))
          .limit(1)

        if (!courierRow) continue

        courierMap.set(rate.courierId, {
          id: courierRow.id,
          name: courierRow.name,
          integration_type: rate.serviceProvider?.toLowerCase() || 'unknown',
          serviceProvider: rate.serviceProvider?.toLowerCase(),
          localRates: {},
          approxZone: {
            originZoneId,
            destinationZoneId,
          },
          createdAt: courierRow.createdAt,
        })
      }

      // Add rate to courier
      const courier = courierMap.get(rate.courierId)!
      courier.localRates.forward = {
        ratePerKg: rate.ratePerKg,
        volumetricFactor: rate.volumetricFactor,
      }
    }

    // Step 7: Convert map to array and filter couriers with rates
    let combined = Array.from(courierMap.values()).filter(
      (c) => c.localRates && Object.keys(c.localRates).length > 0,
    )

    // ✅ Final filter: Ensure all couriers have correct business_type for B2B
    combined = await filterCouriersByBusinessType(combined, 'b2b')

    // Step 8: Apply sorting and tagging (similar to B2C)
    if (userId && combined?.length) {
      const [profile] = await db
        .select()
        .from(courierPriorityProfiles)
        .where(eq(courierPriorityProfiles.user_id, userId))

      if (profile) {
        if (profile.name === 'personalised' && profile.personalised_order) {
          const personalisedIds = profile.personalised_order.map((p) => p.courierId)
          const courierMapObj: Record<string, any> = {}
          combined.forEach((c: any) => {
            courierMapObj[c.id] = c
          })

          const ordered: any[] = []
          profile.personalised_order.forEach((p) => {
            if (courierMapObj[p.courierId]) {
              ordered.push({
                ...courierMapObj[p.courierId],
                displayName: p.name,
              })
            }
          })
          combined.forEach((c: any) => {
            if (!personalisedIds.includes(c.id)) ordered.push(c)
          })
          combined = ordered
        } else if (profile.name === 'fastest') {
          // For B2B, we might not have EDD, so skip fastest sorting
          combined = combined.sort((a: any, b: any) => (a.name || '').localeCompare(b.name || ''))
        } else if (profile.name === 'economy') {
          combined = combined.sort((a: any, b: any) => {
            const aRate = a.localRates.forward?.ratePerKg ?? Infinity
            const bRate = b.localRates.forward?.ratePerKg ?? Infinity
            return aRate - bRate
          })
        }
      }
    }

    return combined
  } catch (error: any) {
    console.error('Error fetching combined courier rates (B2B):', error.message)
    throw error
  }
}

// =================== Create Shipment & Update Order ===================

export interface ShipmentParams {
  order_number: string // corresponds to b2c_orders.id
  payment_type?: 'cod' | 'prepaid' | 'reverse' | 'replacement'
  package_weight?: number
  package_length?: number
  package_breadth?: number
  package_height?: number
  integration_type?: 'delhivery' | 'ekart' | string
  provider_code?: string // Opaque provider code (alternative to integration_type)
  request_auto_pickup?: 'yes' | 'no'
  shipping_charges?: number
  other_charges?: number // Other charges from courier serviceability API (e.g. fuel surcharge, handling, etc.)
  freight_charges?: number // What platform charges seller (based on rate card)
  courier_cost?: number // Estimated courier cost from serviceability response (can be updated later via webhook)
  boxes?: any
  prepaid_amount?: string
  transaction_fee?: number
  order_date: Date
  pickup_date?: string
  pickup_time?: string
  delivery_location?: string
  zone?: string
  zone_id?: string
  selected_max_slab_weight?: number
  courier_option_key?: string

  cod_charges?: number
  discount?: number
  order_amount?: number
  // Additional optional fields used across flows
  pickup_details?: any
  pickup_location_id?: string
  origin?: number | string
  destination?: number | string
  pickup_pincode?: number | string
  destination_pincode?: number | string
  source_pincode?: number | string
  weight?: number
  length?: number
  breadth?: number
  height?: number
  isReverse?: boolean
  transport_speed?: string
  address_type?: string
  ewbn?: string
  ewb?: string
  ewbn_number?: string
  ewaybill_number?: string
  dangerous_good?: boolean | string | number
  fragile_shipment?: boolean | string | number
  plastic_packaging?: boolean | string | number
  quantity?: string | number
  country?: string
  consignee: {
    name: string
    company_name?: string
    address: string
    address_2?: string
    city: string
    state: string
    country?: string
    pincode: string
    phone: string
    gstin?: string
    email?: string
  }
  pickup: {
    warehouse_name: string
    name: string
    address: string
    address_2?: string
    city: string
    state: string
    country?: string
    pincode: string
    phone: string
    gst_number?: string
    pickup_date?: string
    pickup_time?: string
    addressNickname?: string
  }
  is_rto_different?: 'yes' | 'no'
  rto?: {
    warehouse_name: string
    name: string
    address: string
    address_2?: string
    city: string
    state: string
    country?: string
    pincode: string
    phone: string
    addressNickname?: string
  }
  company: { name?: string; gst?: string }
  pickup_location_alias?: string
  return_location_alias?: string
  templateName?: string
  preferred_dispatch_date?: string
  delayed_dispatch?: boolean
  mps?: boolean
  obd_shipment?: boolean
  qc_details?: any
  category_of_goods?: string
  order_items?: {
    name: string
    sku: string
    qty: number
    quantity?: number
    price: number
    hsn: string
    hsnCode?: string
    discount: number
    tax_rate: number
  }[]
  courier_id?: number
  courier_partner?: string
  invoice_number?: string
  invoice_date?: string
  invoice_amount?: string | number
  is_insurance?: 0 | 1
  gift_wrap?: string
  tags?: string
  original_order_id?: string
  order_id?: string
}

export interface InsertB2COrderParams {
  tx: PgTransaction<any, any, any>
  params: any
  shipmentData?: any
  userId: string
  shippingCharges?: number // What seller charges customer (total shipping including other_charges)
  otherCharges?: number // Other charges from courier serviceability API
  freightCharges?: number // What platform charges seller (based on rate card)
  courierCost?: number | null // What platform pays courier (actual courier cost)
  transactionFee?: number
  giftWrap?: number
  discount?: number
  status?: string
  integration_type: 'delhivery' | 'ekart' | string
  is_external_api?: boolean // true if created via external API, false if created locally
  volumetricWeight?: number
  chargedWeight?: number
  chargedSlabs?: number
  shippingMode?: string | null
  selectedMaxSlabWeight?: number | null
  manifestError?: string | null
}

export async function createB2COrder({
  tx,
  params,
  shipmentData,
  userId,
  shippingCharges = 0,
  otherCharges = 0,
  freightCharges = 0,
  courierCost,
  transactionFee = 0,
  status,
  giftWrap = 0,
  discount = 0,
  integration_type,
  is_external_api = false,
  shippingMode,
  selectedMaxSlabWeight,
  manifestError,
}: InsertB2COrderParams) {
  const orderAmount = Number(params.order_amount ?? 0)
  const normalizedOrderNumber = await ensureUniqueMerchantOrderNumber(tx, userId, params.order_number)
  const normalizeJsonValue = (value: unknown) => {
    if (!value) return null

    if (typeof value === 'string') {
      const trimmed = value.trim()
      if (!trimmed) return null
      try {
        return JSON.parse(trimmed)
      } catch (err) {
        console.warn('⚠️ Unable to parse JSON string in createB2COrder:', trimmed)
        return null
      }
    }

    if (typeof value === 'object') {
      const keys = Object.keys(value as Record<string, unknown>).filter((key) => {
        const v = (value as Record<string, unknown>)[key]
        if (v === undefined || v === null) return false
        if (typeof v === 'string') return v.trim().length > 0
        return true
      })

      return keys.length ? value : null
    }

    return null
  }

  const pickupDetails = normalizeJsonValue(params.pickup) ?? {}
  const rtoDetails = normalizeJsonValue(params.rto)
  const isCodOrder = params.payment_type === 'cod'
  const storedCodCharges = isCodOrder ? Number(params?.cod_charges ?? 0) : 0

  try {
    const [newOrder] = await tx
      .insert(b2c_orders)
      .values({
        user_id: userId,

        // Order info
        order_number: normalizedOrderNumber,
        order_id: shipmentData?.data?.order_id ?? null,
        order_date: params.order_date ?? new Date().toISOString().slice(0, 10), // 'YYYY-MM-DD'
        order_amount: orderAmount,
        cod_charges: storedCodCharges,
        integration_type: params?.integration_type,

        // Buyer info
        buyer_name: params.consignee?.name ?? '',
        buyer_phone: params.consignee?.phone ?? '',
        buyer_email: params.consignee?.email || null,
        address: params.consignee?.address ?? '',
        city: params.consignee?.city ?? '',
        state: params.consignee?.state ?? '',
        country: 'India',
        pincode: params.consignee?.pincode ?? '',

        // Product info
        products: Array.isArray(params.order_items) ? params.order_items : [],
        weight: Number(params.package_weight ?? 0),
        length: Number(params.package_length ?? 0),
        breadth: Number(params.package_breadth ?? 0),
        height: Number(params.package_height ?? 0),

        // Charges
        order_type: params.payment_type,
        prepaid_amount: Number(params.prepaid_amount ?? 0),
        shipping_charges: shippingCharges, // What seller charges customer (total shipping including other_charges)
        other_charges: otherCharges, // Other charges from courier serviceability API
        freight_charges: freightCharges || shippingCharges, // What platform charges seller (based on rate card)
        courier_cost: courierCost ?? null, // What platform pays courier (actual courier cost - can be null initially, updated via webhook)
        transaction_fee: transactionFee,
        gift_wrap: giftWrap,
        discount: discount,
        volumetric_weight: params.volumetricWeight ?? null,
        charged_weight: params.chargedWeight ?? null,
        weight_discrepancy: false,
        charged_slabs: params.chargedSlabs ?? null,

        order_status: status ?? 'booked',

        is_rto_different: params.is_rto_different === 'yes',

        // Courier info
        courier_partner: shipmentData?.courier_name ?? null,
        delivery_location: params.delivery_location ?? params.zone ?? null,
        courier_id: params.courier_id ? Number(params.courier_id) : null,
        shipping_mode: shippingMode ?? null,
        selected_max_slab_weight: selectedMaxSlabWeight ?? null,
        shipment_id: shipmentData?.shipment_id?.toString() ?? null,
        awb_number: shipmentData?.awb_number ?? null,
        // Store courier-provided label key/identifier if available
        label: typeof shipmentData?.label === 'string' ? shipmentData.label : null,
        manifest:
          typeof shipmentData?.manifest === 'string' && shipmentData?.manifest.length <= 100
            ? shipmentData.manifest
            : null,

        manifest_error: manifestError ?? null,

        // Routing / sort code from courier label
        sort_code: (shipmentData as any)?.sort_code || (shipmentData as any)?.sortCode || null,

        // Pickup & RTO info
        pickup_location_id: params.pickup_location_id ?? params.pickup?.warehouse_name ?? null,
        pickup_details: pickupDetails,
        rto_details: rtoDetails,

        // Order source flag
        is_external_api: is_external_api ?? false,

        // Tags / meta
        tags: params.tags ?? null,
        invoice_link: shipmentData?.invoice_link ?? null,
        created_at: new Date(),
        updated_at: new Date(),
      })
      .returning({ id: b2c_orders.id })

    return newOrder
  } catch (err: any) {
    console.error('❌ Failed to insert B2C order:', err)
    console.error('❌ Failed to insert B2C order (details):', {
      message: err?.message,
      detail: err?.detail,
      code: err?.code,
      stack: err?.stack,
    })
    throw err
  }
}
// Main service function
export const createB2CShipmentService = async (
  params: ShipmentParams,
  userId: string,
  is_external_api: boolean = false,
) => {
  await requireMerchantOrderReadiness(userId)

  // 🔹 Handle provider_code: Convert provider_code to integration_type if provided
  // Users can send either integration_type (direct) or provider_code (opaque code from serviceability API)
  if (!params.integration_type && params.provider_code) {
    // Dynamic import to avoid circular dependencies
    const { getIntegrationTypeFromProviderCode } = await import('../../utils/externalApiHelpers')
    const integrationTypeFromCode = getIntegrationTypeFromProviderCode(params.provider_code)

    if (integrationTypeFromCode) {
      params.integration_type = integrationTypeFromCode
      console.log(
        `✅ Converted provider_code: ${params.provider_code} to integration_type: ${params.integration_type}`,
      )
    } else {
      throw new HttpError(
        400,
        `Invalid provider_code: ${params.provider_code}. Please provide a valid provider_code from the serviceability API response (XC7K9).`,
      )
    }
  }

  console.log('🚀 Creating shipment for integration_type:', params.integration_type)

  const normalizePincode = (value: unknown): string | undefined => {
    if (typeof value === 'number' && !Number.isNaN(value)) {
      return String(value).trim()
    }
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
    return undefined
  }

  let delhiveryService: DelhiveryService | null = null

  const ensureDelhiveryServiceable = async ({
    delhivery,
    originPin,
    destinationPin,
    paymentType,
    orderNumber,
  }: {
    delhivery: DelhiveryService
    originPin: string
    destinationPin: string
    paymentType?: ShipmentParams['payment_type']
    orderNumber?: string
  }) => {
    const requiresCOD = (paymentType || 'prepaid').toLowerCase() === 'cod'
    try {
      const [originResp, destinationResp] = await Promise.all([
        delhivery.checkServiceability(originPin),
        delhivery.checkServiceability(destinationPin),
      ])

      const originPostalCode = originResp?.delivery_codes?.[0]?.postal_code
      if (!originPostalCode?.pickup || originPostalCode.pickup !== 'Y') {
        throw new HttpError(
          400,
          `Delhivery pickup pincode ${originPin} is not serviceable for order ${orderNumber ?? 'unknown'}. Please update the pickup location.`,
        )
      }

      const destinationPostalCode = destinationResp?.delivery_codes?.[0]?.postal_code
      const isDestinationReady =
        requiresCOD === true
          ? destinationPostalCode?.cod === 'Y'
          : destinationPostalCode?.pre_paid === 'Y'
      if (!isDestinationReady) {
        throw new HttpError(
          400,
          `Delhivery destination pincode ${destinationPin} is not serviceable for ${
            requiresCOD ? 'COD' : 'Prepaid'
          } orders. Please confirm availability before booking.`,
        )
      }

      console.log('[Delhivery] Serviceability pre-check passed', {
        order_number: orderNumber,
        origin_pin: originPin,
        destination_pin: destinationPin,
        requires_cod: requiresCOD,
        origin_pickup_flag: originPostalCode.pickup,
        destination_cod_flag: destinationPostalCode.cod,
        destination_prepaid_flag: destinationPostalCode.pre_paid,
      })

      return { originResp, destinationResp }
    } catch (error: any) {
      if (error instanceof HttpError) {
        throw error
      }
      console.error('❌ Delhivery serviceability validation failed:', error?.message || error)
      throw new HttpError(
        502,
        `Delhivery serviceability validation failed. ${error?.message || 'Please try again later.'}`,
      )
    }
  }

  let selectedDelhiveryCourierId: number | null = null
  let selectedDelhiveryShippingMode: 'Express' | 'Surface' | null = null
  const parseSelectedMaxSlabWeight = (value: unknown, courierOptionKey: unknown) => {
    const directValue = Number(value)
    if (Number.isFinite(directValue) && directValue > 0) {
      return directValue
    }

    const rawOptionKey = String(courierOptionKey || '')
    if (!rawOptionKey) return null

    const parts = rawOptionKey.split('__')
    const lastPart = parts[parts.length - 1]
    if (!lastPart || lastPart === 'base') return null

    const parsedValue = Number(lastPart)
    return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : null
  }

  // 🔹 Derive integration_type from courier_id if not provided
  // IMPORTANT: courier_id and courier_name are NOT unique across service providers
  // The composite key in the database is (courier_id, serviceProvider)
  // Since both can be duplicated, we cannot accurately identify a courier without integration_type
  // The serviceability API returns integration_type with each courier - it should be included in the request
  if (!params.integration_type && params.courier_id) {
    try {
      console.log(
        `⚠️ integration_type not provided, attempting to derive from courier_id: ${
          params.courier_id
        }${params.courier_partner ? `, courier_partner: ${params.courier_partner}` : ''}`,
      )

      // First, get all couriers matching the courier_id
      const matchingCouriers = await db
        .select({
          serviceProvider: couriers.serviceProvider,
          name: couriers.name,
          id: couriers.id,
        })
        .from(couriers)
        .where(and(eq(couriers.id, Number(params.courier_id)), eq(couriers.isEnabled, true)))

      if (matchingCouriers.length === 0) {
        // No courier found - require integration_type to be explicitly provided
        throw new HttpError(
          400,
          `Courier with id ${params.courier_id} not found. Please provide integration_type or provider_code along with courier_id for accurate matching.`,
        )
      } else if (matchingCouriers.length === 1) {
        // Only one courier with this ID - use it directly
        const matchedCourier = matchingCouriers[0]
        const serviceProvider = matchedCourier.serviceProvider?.toLowerCase().trim()
        if (serviceProvider === 'delhivery') {
          params.integration_type = 'delhivery'
          console.log(
            `✅ Derived integration_type: ${params.integration_type} from courier_id: ${params.courier_id} (courier: ${matchedCourier.name})`,
          )
        } else if (serviceProvider === 'ekart') {
          params.integration_type = 'ekart'
          console.log(
            `✅ Derived integration_type: ${params.integration_type} from courier_id: ${params.courier_id} (courier: ${matchedCourier.name})`,
          )
        } else {
          throw new HttpError(
            400,
            `Unsupported serviceProvider: ${serviceProvider}. Supported providers: delhivery, ekart.`,
          )
        }
      } else {
        // Multiple couriers with same ID (different service providers)
        // Since courier names can also be duplicated across providers, we cannot accurately match
        // without integration_type. The composite key is (courier_id, serviceProvider).
        const availableProviders = matchingCouriers.map((c) => c.serviceProvider).join(', ')
        const uniqueCourierNames = [...new Set(matchingCouriers.map((c) => c.name))].join(', ')

        throw new HttpError(
          400,
          `Multiple couriers found with id ${params.courier_id} across different service providers: [${availableProviders}]. ` +
            `Since courier IDs and names can both be duplicated across service providers, ` +
            `integration_type or provider_code is REQUIRED for accurate matching. ` +
            `Please include either integration_type or provider_code from the serviceability API response. ` +
            `Found courier names: ${uniqueCourierNames}`,
        )
      }
    } catch (error: any) {
      // If it's already an HttpError, re-throw it
      if (error instanceof HttpError) {
        throw error
      }
      // Otherwise, log and throw a generic error requiring integration_type
      console.error(`❌ Error looking up courier_id ${params.courier_id}:`, error.message)
      throw new HttpError(
        500,
        `Error looking up courier: ${error.message}. Please provide integration_type or provider_code along with courier_id.`,
      )
    }
  }

  // If still no integration_type (and no courier_id was provided to derive it), default to 'delhivery'
  // Note: This fallback is only for backward compatibility when neither integration_type nor courier_id is provided
  // When courier_id is provided without integration_type, an error is thrown above if it cannot be determined
  if (!params.integration_type) {
    console.warn(
      `⚠️ integration_type not provided and courier_id not available, defaulting to 'delhivery'`,
    )
    params.integration_type = 'delhivery'
  }

  if (String(params.integration_type || '').toLowerCase() === 'delhivery') {
    selectedDelhiveryCourierId = normalizeCourierId(params.courier_id)
    if (selectedDelhiveryCourierId === null) {
      throw new HttpError(
        400,
        'Delhivery courier_id is required to lock the selected Surface/Express service (use 99 for Surface or 100 for Express).',
      )
    }
    if (!isSupportedDelhiveryCourierId(selectedDelhiveryCourierId)) {
      throw new HttpError(
        400,
        `Invalid Delhivery courier_id: ${selectedDelhiveryCourierId}. Allowed IDs are 100 (Express) and 99 (Surface).`,
      )
    }
    const shippingMode = getDelhiveryShippingModeByCourierId(selectedDelhiveryCourierId)
    if (!shippingMode) {
      throw new HttpError(
        500,
        `Unable to resolve Delhivery shipping mode for courier_id: ${selectedDelhiveryCourierId}.`,
      )
    }
    selectedDelhiveryShippingMode = shippingMode
    console.log('🧭 Delhivery service selected (panel)', {
      order_number: params.order_number,
      courier_id: selectedDelhiveryCourierId,
      shipping_mode: selectedDelhiveryShippingMode,
    })
  }

  const selectedMaxSlabWeight = parseSelectedMaxSlabWeight(
    params.selected_max_slab_weight,
    params.courier_option_key,
  )

  let resolvedPickupWarehouse: PickupWarehouseRecord | null = null
  if (params.pickup_location_id) {
    resolvedPickupWarehouse = await fetchPickupWarehouseRecord(userId, params.pickup_location_id)
    if (!resolvedPickupWarehouse) {
      throw new HttpError(
        400,
        'Pickup warehouse not found or not enabled. Please select a valid pickup location.',
      )
    }

    params.pickup = buildPickupFromWarehouse(
      resolvedPickupWarehouse,
      params.pickup,
      params.pickup_date,
      params.pickup_time,
    )

    const resolvedPincode = resolvedPickupWarehouse.pincode?.trim()
    if (resolvedPincode) {
      params.origin = resolvedPincode
      params.source_pincode = resolvedPincode
      params.pickup_pincode = resolvedPincode as any
    }

    console.log('📍 Resolved pickup warehouse for Delhivery order', {
      order_number: params.order_number,
      pickup_location_id: params.pickup_location_id,
      pickup_id: resolvedPickupWarehouse.pickupId,
      warehouse_name: params.pickup?.warehouse_name,
      city: resolvedPickupWarehouse.city,
      state: resolvedPickupWarehouse.state,
      pincode: resolvedPickupWarehouse.pincode,
    })
  }

  // ✅ Ensure pickup details are present (especially for Delhivery)
  const isMissingPickupField = (val?: string) => !val || val.toString().trim().length === 0
  const pickup = params.pickup || ({} as ShipmentParams['pickup'])
  const pickupIncomplete =
    !pickup ||
    isMissingPickupField(pickup.warehouse_name) ||
    isMissingPickupField(pickup.address) ||
    isMissingPickupField(pickup.city) ||
    isMissingPickupField(pickup.state) ||
    isMissingPickupField(pickup.pincode) ||
    isMissingPickupField(pickup.phone)

  if (pickupIncomplete) {
    try {
      const searchTerm = pickup?.warehouse_name?.trim()
      const conditions: any[] = [eq(pickupAddresses.userId, userId)]
      if (searchTerm) {
        conditions.push(
          or(
            ilike(addresses.addressNickname, `%${searchTerm}%`),
            ilike(addresses.contactName, `%${searchTerm}%`),
          ),
        )
      }

      const [pickupRow] = await db
        .select({
          addressNickname: addresses.addressNickname,
          addressLine1: addresses.addressLine1,
          addressLine2: addresses.addressLine2,
          city: addresses.city,
          state: addresses.state,
          pincode: addresses.pincode,
          contactName: addresses.contactName,
          contactPhone: addresses.contactPhone,
          gstNumber: addresses.gstNumber,
        })
        .from(pickupAddresses)
        .innerJoin(addresses, eq(pickupAddresses.addressId, addresses.id))
        .where(and(...conditions))
        .orderBy(desc(pickupAddresses.isPrimary))
        .limit(1)

      if (pickupRow) {
        params.pickup = {
          warehouse_name: pickup.warehouse_name || pickupRow.addressNickname || '',
          address: pickup.address || pickupRow.addressLine1 || '',
          address_2: pickup.address_2 || pickupRow.addressLine2 || undefined,
          city: pickup.city || pickupRow.city || '',
          state: pickup.state || pickupRow.state || '',
          pincode: pickup.pincode || pickupRow.pincode || '',
          phone: pickup.phone || pickupRow.contactPhone || '',
          name: pickup.name || pickupRow.contactName || '',
          gst_number: pickup.gst_number || pickupRow.gstNumber || undefined,
          pickup_date: pickup.pickup_date,
          pickup_time: pickup.pickup_time,
        }
      }
    } catch (err: any) {
      console.warn('⚠️ Failed to resolve pickup address from DB:', err?.message || err)
    }
  }

  const requiredConsigneeFields = ['name', 'address', 'city', 'state', 'pincode', 'phone'] as const
  const consignee = params.consignee || ({} as ShipmentParams['consignee'])
  const missingConsigneeFields = requiredConsigneeFields.filter(
    (field) => !consignee[field] || String(consignee[field]).trim().length === 0,
  )
  if (missingConsigneeFields.length > 0) {
    throw new HttpError(
      400,
      `Consignee details incomplete. Missing fields: ${missingConsigneeFields.join(
        ', ',
      )}. Please provide full buyer information before booking.`,
    )
  }

  const normalizedPaymentType = params.payment_type?.trim().toLowerCase()
  if (!normalizedPaymentType || !['cod', 'prepaid', 'reverse'].includes(normalizedPaymentType)) {
    throw new HttpError(
      400,
      'payment_type is required and must be either cod, prepaid, or reverse when booking with Delhivery.',
    )
  }
  params.payment_type = normalizedPaymentType as ShipmentParams['payment_type']

  const orderAmount = Number(params.order_amount ?? 0)
  if (!orderAmount || Number.isNaN(orderAmount)) {
    throw new HttpError(
      400,
      'order_amount is required and must be greater than 0 for Delhivery bookings.',
    )
  }

  const invoiceNumber = String(params.invoice_number ?? '').trim()
  // if (!invoiceNumber) {
  //   throw new HttpError(
  //     400,
  //     'invoice_number is mandatory for Delhivery B2C manifests. Provide the seller invoice number before booking.',
  //   )
  // }
  params.invoice_number = invoiceNumber

  const orderItems = Array.isArray(params.order_items) ? params.order_items : []
  const hsnCodes = orderItems
    .map((item) => (item?.hsn || item?.hsnCode || '').toString().trim())
    .filter((code) => code.length > 0)
  // if (hsnCodes.length === 0) {
  //   throw new HttpError(
  //     400,
  //     'At least one HSN code is required for Delhivery shipments (per official API requirements). Please include HSN/SAC for your products.',
  //   )
  // }

  // Fill seller/company metadata from user profile (if not explicitly provided).
  // Delhivery UI uses this for "Seller Details" and GST visibility.
  try {
    const [profile] = await db
      .select({
        brandName: sql<string>`(${userProfiles.companyInfo} ->> 'brandName')`,
        businessName: sql<string>`(${userProfiles.companyInfo} ->> 'businessName')`,
        companyGst: sql<string>`COALESCE((${userProfiles.companyInfo} ->> 'companyGst'), (${userProfiles.companyInfo} ->> 'companyGST'), '')`,
        gstin: sql<string>`COALESCE((${userProfiles.companyInfo} ->> 'gstin'), (${userProfiles.companyInfo} ->> 'GSTIN'), '')`,
      })
      .from(userProfiles)
      .where(eq(userProfiles.userId, userId))
      .limit(1)

    const resolvedCompanyName =
      params.company?.name ||
      profile?.businessName ||
      profile?.brandName ||
      params.pickup?.name ||
      ''
    const resolvedCompanyGst =
      params.company?.gst ||
      profile?.companyGst ||
      profile?.gstin ||
      params.pickup?.gst_number ||
      ''

    params.company = {
      ...(params.company || {}),
      name: resolvedCompanyName || 'DelExpress',
      gst: resolvedCompanyGst || '',
    }

    if (!params.pickup?.name && resolvedCompanyName) {
      params.pickup = {
        ...(params.pickup || ({} as ShipmentParams['pickup'])),
        name: resolvedCompanyName,
      }
    }
  } catch (profileErr: any) {
    console.warn(
      '⚠️ Failed to resolve company metadata for shipment:',
      profileErr?.message || profileErr,
    )
  }

  // Hard validation: do not call Delhivery with incomplete pickup details.
  // Otherwise Delhivery may accept booking but show null pickup address/seller fields.
  const requiredPickupFields: Array<keyof ShipmentParams['pickup']> = [
    'warehouse_name',
    'address',
    'city',
    'state',
    'pincode',
    'phone',
  ]
  const missingPickupFields = requiredPickupFields.filter((key) =>
    isMissingPickupField(params.pickup?.[key] as string | undefined),
  )
  if (missingPickupFields.length > 0) {
    throw new HttpError(
      400,
      `Pickup details incomplete. Missing fields: ${missingPickupFields.join(', ')}. Please select a valid pickup address and retry.`,
    )
  }
  // 💰 PRE-CHECK: Validate wallet balance BEFORE creating shipments with service providers
  const bookingPickupPincode = normalizePincode(
    params.origin ??
      params.pickup?.pincode ??
      params.pickup_pincode ??
      params.source_pincode ??
      undefined,
  )
  const bookingDestinationPincode = normalizePincode(
    params.destination ?? params.consignee?.pincode ?? params.destination_pincode,
  )

  if (!bookingPickupPincode || !bookingDestinationPincode) {
    throw new HttpError(400, 'Pickup and destination pincodes are required to book with Delhivery.')
  }

  const otherCharges = Number(params?.other_charges ?? 0)
  const shippingCharges = Number(params?.shipping_charges ?? 0)
  const totalShippingCharges = shippingCharges + otherCharges
  let freightCharges = Number(params?.freight_charges ?? totalShippingCharges)
  const isCodOrder = params.payment_type === 'cod'
  const codCharges = isCodOrder ? Number(params?.cod_charges ?? 0) : 0
  const discount = Number(params?.discount ?? 0)
  const giftWrap = Number(params?.gift_wrap ?? 0)
  const transactionFee = Number(params?.transaction_fee ?? 0)
  const prepaidAmt = Number(params?.prepaid_amount ?? 0)
  const isReverseShipment = params.isReverse === true || params.payment_type === 'reverse'

  const courierIdForRate =
    selectedDelhiveryCourierId ?? (params.courier_id ? Number(params.courier_id) : null)

  let slabbedFreight: {
    freight: number
    volumetric_weight: number | null
    chargeable_weight: number | null
    slabs: number | null
  } = {
    freight: freightCharges,
    volumetric_weight: null,
    chargeable_weight: null,
    slabs: null,
  }

  if (courierIdForRate && bookingPickupPincode && bookingDestinationPincode) {
    try {
      const computedFreight = await computeB2CFreightForOrder({
        userId,
        courierId: courierIdForRate,
        serviceProvider: params.integration_type ?? null,
        mode: selectedDelhiveryShippingMode ?? null,
        selectedMaxSlabWeight,
        zoneIdOverride: params.zone_id ?? null,
        destinationPincode: bookingDestinationPincode,
        originPincode: bookingPickupPincode,
        weightG: normalizeServiceabilityWeightToGrams(params.package_weight ?? params.weight ?? 0),
        lengthCm: Number(params.package_length ?? params.length ?? 0),
        breadthCm: Number(params.package_breadth ?? params.breadth ?? 0),
        heightCm: Number(params.package_height ?? params.height ?? 0),
        isReverse: isReverseShipment,
      })
      if (computedFreight?.freight !== undefined) {
        slabbedFreight = computedFreight
        freightCharges = Number(computedFreight.freight)
      }
    } catch (freightErr: any) {
      console.error('❌ Failed to compute slab-based freight; aborting shipment creation', {
        order_number: params.order_number,
        error: freightErr?.message || freightErr,
        pickup_pincode: bookingPickupPincode,
        destination_pincode: bookingDestinationPincode,
        courier_id: courierIdForRate,
      })
      if (freightErr instanceof HttpError) {
        throw freightErr
      }
      throw new HttpError(
        400,
        freightErr?.message || 'Unable to compute freight for selected courier/zone',
      )
    }
  }

  let estimatedWalletDebit = 0
  if (!isReverseShipment) {
    if (params.payment_type === 'prepaid') {
      estimatedWalletDebit = freightCharges + otherCharges
    } else if (params.payment_type === 'cod') {
      estimatedWalletDebit = freightCharges + otherCharges + codCharges
    }

    if (estimatedWalletDebit > 0) {
      const [userWallet] = await db
        .select()
        .from(wallets)
        .where(eq(wallets.userId, userId))
        .limit(1)
      if (!userWallet) {
        throw new Error('Wallet not found')
      }
      const walletBalance = Number(userWallet?.balance ?? 0)

      console.log('💳 Pre-checking wallet balance before shipment creation:', {
        order_number: params.order_number,
        payment_type: params.payment_type,
        wallet_balance: walletBalance,
        estimated_wallet_debit: estimatedWalletDebit,
        freight_charges: freightCharges,
        other_charges: otherCharges,
        cod_charges: isCodOrder ? codCharges : 0,
      })

      if (walletBalance < estimatedWalletDebit) {
        const errorMessage =
          params.payment_type === 'prepaid'
            ? 'Insufficient wallet balance for prepaid order'
            : 'Insufficient wallet balance for COD service charges'
        console.error('❌ Wallet balance check failed:', {
          wallet_balance: walletBalance,
          required_amount: estimatedWalletDebit,
          shortfall: estimatedWalletDebit - walletBalance,
        })
        throw new Error(errorMessage)
      }
    }
  }

  const persistManifestFailureOrder = async (failure: DelhiveryManifestError) => {
    try {
      await db.transaction(async (tx) => {
        const failureDetails = failure.details || {}
        const failureShipmentData = {
          courier_name: 'Delhivery',
          courier_id: params.courier_id ? Number(params.courier_id) : null,
          manifest: failureDetails.upload_wbn ?? failureDetails.shipment_id ?? null,
          shipment_id: failureDetails.shipment_id ?? failureDetails.upload_wbn ?? null,
          sort_code: failureDetails.sort_code ?? null,
        }

        const failureOrder = await createB2COrder({
          tx,
          params,
          shipmentData: failureShipmentData,
          userId,
          shippingCharges: totalShippingCharges,
          otherCharges,
          freightCharges,
          courierCost: null,
          transactionFee,
          giftWrap,
          discount,
          status: 'manifest_failed',
          manifestError: failure.message,
          integration_type: params?.integration_type!,
          is_external_api,
          volumetricWeight: slabbedFreight.volumetric_weight ?? undefined,
          chargedWeight: slabbedFreight.chargeable_weight ?? undefined,
          chargedSlabs: slabbedFreight.slabs ?? undefined,
          shippingMode: selectedDelhiveryShippingMode ?? null,
          selectedMaxSlabWeight,
        })
        console.log('⚠️ Delhivery manifest failure stored as order', {
          order_id: failureOrder?.id,
        })
      })
    } catch (err: any) {
      console.error('❌ Failed to persist manifest failure order:', err?.message || err)
    }
  }

  let shipmentData: any = null
  let shipmentMeta: {
    shipment_id?: string
    awb_number?: string
    courier_name?: string
    courier_id?: string | number | null
    label?: string
    manifest?: string
    courier_cost?: number | null // Actual courier cost from API response
    sort_code?: string | null
  } = {}

  const rollbackActions: Array<() => Promise<void>> = []

  // Check if this is a reverse shipment
  const originalOrderId = params.original_order_id || params.order_id

  try {
    // 1️⃣ CREATE SHIPMENT
    const requestedIntegrationType = String(params.integration_type || '').toLowerCase()
    const allowedIntegrationTypes = ['delhivery', 'ekart', 'xpressbees']
    if (!requestedIntegrationType || !allowedIntegrationTypes.includes(requestedIntegrationType)) {
      throw new Error(
        `Invalid integration_type: ${params.integration_type}. Supported values: delhivery, ekart, xpressbees.`,
      )
    }

    const integrationType = requestedIntegrationType as 'delhivery' | 'ekart' | 'xpressbees'
    const providerName =
      integrationType === 'delhivery'
        ? 'Delhivery'
        : integrationType === 'ekart'
          ? 'Ekart Logistics'
          : 'Xpressbees'

    let manifestFailure: DelhiveryManifestError | null = null
    let shipmentSuccessPackage: any = null
    let providerCourierCost: number | null = null
    let providerSortCode: string | null = null

    if (integrationType === 'delhivery') {
      console.log(
        isReverseShipment
          ? '→ Using Delhivery Reverse Shipment API...'
          : '→ Using Delhivery API...',
      )
      const delhivery = new DelhiveryService()
      delhiveryService = delhivery

      if (isReverseShipment) {
        if (!originalOrderId) {
          throw new Error('Original order ID is required for reverse shipment')
        }

        const [originalOrder] = await db
          .select()
          .from(b2c_orders)
          .where(eq(b2c_orders.id, originalOrderId))
          .limit(1)

        if (!originalOrder) {
          throw new Error('Original order not found for reverse shipment')
        }

        shipmentData = await delhivery.createReverseShipment({
          originalAwb: originalOrder.awb_number || '',
          originalOrderId: originalOrder.order_number || undefined,
          consignee: params.consignee,
          pickup: params.pickup,
          rto: params.rto,
          order_amount: params.order_amount,
          package_weight: params.package_weight,
          package_length: params.package_length,
          package_breadth: params.package_breadth,
          package_height: params.package_height,
          order_items: params.order_items,
        })
      } else {
        const originPin = bookingPickupPincode
        const destinationPin = bookingDestinationPincode

        await ensureDelhiveryServiceable({
          delhivery,
          originPin,
          destinationPin,
          paymentType: params.payment_type,
          orderNumber: params.order_number,
        })

        shipmentData = {
          success: true,
          deferred_manifest: true,
          shipping_mode: selectedDelhiveryShippingMode ?? null,
          packages: [],
        }
      }

      if (isReverseShipment) {
        if (!shipmentData?.awb_number && !shipmentData?.packages?.length) {
          console.error('❌ Invalid Delhivery reverse shipment:', shipmentData)
          throw new HttpError(500, 'Delhivery reverse shipment creation failed')
        }
      } else {
        if (!shipmentData?.success) {
          console.error('❌ Invalid Delhivery shipment:', shipmentData)
          throw new HttpError(500, 'Delhivery shipment creation failed')
        }
      }

      shipmentSuccessPackage = isReverseShipment
        ? shipmentData.packages?.[0] || { waybill: shipmentData.awb_number }
        : shipmentData.packages[0]

      providerCourierCost =
        shipmentSuccessPackage?.charge ||
        shipmentSuccessPackage?.amount ||
        shipmentData?.charge ||
        shipmentData?.amount ||
        params?.courier_cost ||
        null

      providerSortCode =
        shipmentSuccessPackage?.sort_code ??
        shipmentSuccessPackage?.sortCode ??
        shipmentData?.packages?.[0]?.sort_code ??
        null

      shipmentMeta = {
        shipment_id: shipmentData.upload_wbn ?? shipmentData.shipment_id ?? undefined,
        awb_number: shipmentSuccessPackage?.waybill ?? shipmentData.awb_number ?? undefined,
        courier_name: 'Delhivery',
        courier_id: params.courier_id ? Number(params.courier_id) : null,
        label: undefined,
        manifest: shipmentData?.upload_wbn ?? shipmentData?.manifest ?? undefined,
        courier_cost: providerCourierCost,
        sort_code: providerSortCode,
      }
    } else if (integrationType === 'ekart') {
      if (isReverseShipment) {
        throw new HttpError(400, 'Ekart reverse shipments are not supported')
      }

      console.log('→ Using Ekart API...')
      const ekart = new EkartService()
      shipmentData = await ekart.createShipment(params)

      const ekartWaybill =
        shipmentData?.awb_number ??
        shipmentData?.tracking_id ??
        shipmentData?.vendor_waybill ??
        null

      if (!ekartWaybill) {
        console.error('❌ Invalid Ekart shipment:', shipmentData)
        throw new HttpError(500, 'Ekart shipment creation failed')
      }

      shipmentSuccessPackage = {
        waybill: ekartWaybill,
        charge: shipmentData?.courier_cost ?? null,
        amount: shipmentData?.amount ?? null,
        shipping_mode: shipmentData?.shipping_mode ?? null,
        service_mode: shipmentData?.service_mode ?? null,
        service_type: shipmentData?.service_type ?? null,
        mode: shipmentData?.mode ?? null,
      }

      providerCourierCost = shipmentData?.courier_cost ?? params?.courier_cost ?? null
      providerSortCode = null

      shipmentMeta = {
        shipment_id:
          shipmentData?.shipment_id ??
          shipmentData?.tracking_id ??
          shipmentData?.awb_number ??
          shipmentData?.vendor_waybill ??
          undefined,
        awb_number: ekartWaybill,
        courier_name: 'Ekart Logistics',
        courier_id: params.courier_id ? Number(params.courier_id) : null,
        label: undefined,
        manifest: shipmentData?.manifest ?? undefined,
        courier_cost: providerCourierCost,
        sort_code: providerSortCode,
      }
    } else if (integrationType === 'xpressbees') {
      console.log(
        isReverseShipment
          ? '→ Using Xpressbees Reverse Shipment API...'
          : '→ Using Xpressbees API...',
      )

      const xpressbees = new XpressbeesService()
      const xpressParams = params as ShipmentParams & {
        collectable_amount?: number
        categories?: string
        qccheck?: string | number
        uploadedimage?: string
        uploadedimage_2?: string
        uploadedimage_3?: string
        uploadedimage_4?: string
        product_usage?: string | number
        product_damage?: string | number
        brandname?: string | number
        brandnametype?: string
        productsize?: string | number
        productsizetype?: string
        productcolor?: string | number
        productcolourtype?: string
        consignee?: ShipmentParams['consignee'] & { alternate_phone?: string }
      }

      if (isReverseShipment) {
        if (!originalOrderId) {
          throw new Error('Original order ID is required for reverse shipment')
        }

        const [originalOrder] = await db
          .select()
          .from(b2c_orders)
          .where(eq(b2c_orders.id, originalOrderId))
          .limit(1)

        if (!originalOrder) {
          throw new Error('Original order not found for reverse shipment')
        }

        shipmentData = await xpressbees.createReverseShipment({
          order_id: originalOrder.order_number || params.order_number,
          request_auto_pickup: params.request_auto_pickup || 'yes',
          consignee: {
            name: xpressParams?.consignee?.name,
            address: xpressParams?.consignee?.address,
            address_2: xpressParams?.consignee?.address_2,
            city: xpressParams?.consignee?.city,
            state: xpressParams?.consignee?.state,
            pincode: xpressParams?.consignee?.pincode,
            phone: xpressParams?.consignee?.phone,
            alternate_phone: xpressParams?.consignee?.alternate_phone,
          },
          pickup: params.pickup,
          categories: xpressParams?.categories || 'General',
          product_name: xpressParams?.order_items?.[0]?.name || 'Return Item',
          product_qty: xpressParams?.order_items?.[0]?.qty || 1,
          product_amount: xpressParams?.order_items?.[0]?.price || xpressParams?.order_amount || 0,
          package_weight: params.package_weight,
          package_length: params.package_length,
          package_breadth: params.package_breadth,
          package_height: params.package_height,
          qccheck: xpressParams?.qccheck || '0',
          uploadedimage: xpressParams?.uploadedimage || '',
          uploadedimage_2: xpressParams?.uploadedimage_2 || '',
          uploadedimage_3: xpressParams?.uploadedimage_3 || '',
          uploadedimage_4: xpressParams?.uploadedimage_4 || '',
          product_usage: xpressParams?.product_usage || '0',
          product_damage: xpressParams?.product_damage || '0',
          brandname: xpressParams?.brandname || '0',
          brandnametype: xpressParams?.brandnametype || '',
          productsize: xpressParams?.productsize || '0',
          productsizetype: xpressParams?.productsizetype || '',
          productcolor: xpressParams?.productcolor || '0',
          productcolourtype: xpressParams?.productcolourtype || '',
        })
      } else {
        shipmentData = await xpressbees.createShipment({
          ...xpressParams,
          collectable_amount:
            params.payment_type === 'cod'
              ? Number(xpressParams.collectable_amount ?? params.order_amount ?? 0)
              : 0,
        })
      }

      const xpressbeesPackage = shipmentData?.data || shipmentData
      const xpressbeesWaybill = xpressbeesPackage?.awb_number ?? null

      if (!xpressbeesPackage?.status && shipmentData?.status !== true) {
        console.error('❌ Invalid Xpressbees shipment:', shipmentData)
        throw new HttpError(500, 'Xpressbees shipment creation failed')
      }

      if (!xpressbeesWaybill) {
        console.error('❌ Missing Xpressbees AWB:', shipmentData)
        throw new HttpError(500, 'Xpressbees did not return an AWB number')
      }

      shipmentSuccessPackage = {
        waybill: xpressbeesWaybill,
        label: xpressbeesPackage?.label ?? null,
        manifest: xpressbeesPackage?.manifest ?? null,
        courier_name: xpressbeesPackage?.courier_name ?? 'Xpressbees',
        courier_id: xpressbeesPackage?.courier_id ?? params?.courier_id ?? null,
        status: xpressbeesPackage?.status ?? null,
        sort_code: xpressbeesPackage?.fwd_destination_code ?? null,
      }

      providerCourierCost = params?.courier_cost ?? null
      providerSortCode = xpressbeesPackage?.fwd_destination_code ?? null

      shipmentMeta = {
        shipment_id:
          xpressbeesPackage?.shipment_id ??
          xpressbeesPackage?.order_id ??
          xpressbeesWaybill ??
          undefined,
        awb_number: xpressbeesWaybill,
        courier_name: xpressbeesPackage?.courier_name ?? 'Xpressbees',
        courier_id: xpressbeesPackage?.courier_id
          ? Number(xpressbeesPackage.courier_id)
          : params.courier_id
            ? Number(params.courier_id)
            : null,
        label: xpressbeesPackage?.label ?? undefined,
        manifest: xpressbeesPackage?.manifest ?? undefined,
        courier_cost: providerCourierCost,
        sort_code: providerSortCode,
      }
    } else {
      throw new Error(`Unsupported integration_type: ${integrationType}`)
    }

    console.log(`📦 ${providerName} shipment response:`, shipmentData)

    if (integrationType === 'delhivery' && shipmentSuccessPackage) {
      const responseShippingMode =
        shipmentData?.shipping_mode ??
        shipmentSuccessPackage?.shipping_mode ??
        shipmentSuccessPackage?.service_mode ??
        shipmentSuccessPackage?.service_type ??
        shipmentSuccessPackage?.mode ??
        null

      console.log('📤 Delhivery API response service', {
        order: params.order_number,
        requested_shipping_mode: selectedDelhiveryShippingMode,
        response_shipping_mode: responseShippingMode,
        response_package_keys: Object.keys(shipmentSuccessPackage || {}),
      })

      console.log(`✅ Delhivery shipment created with AWB: ${shipmentSuccessPackage?.waybill}`)
      console.log(`💰 Delhivery courier cost captured:`, {
        awb: shipmentSuccessPackage?.waybill,
        cost: providerCourierCost,
        source: providerCourierCost
          ? shipmentSuccessPackage?.charge
            ? 'pkg.charge'
            : shipmentSuccessPackage?.amount
              ? 'pkg.amount'
              : shipmentData?.charge
                ? 'shipmentData.charge'
                : shipmentData?.amount
                  ? 'shipmentData.amount'
                  : 'params.courier_cost'
          : 'none',
        pkg_fields: Object.keys(shipmentSuccessPackage || {}),
        shipment_fields: Object.keys(shipmentData || {}),
      })
    }


    // 🔹 Recalculate freight using slab pricing (ignore incoming freight_charges)
    const pickupPincode =
      (params.pickup as any)?.pincode ||
      (params.pickup_details as any)?.pincode ||
      params.pickup_location_id ||
      params.origin ||
      params.pickup_pincode ||
      params.source_pincode

    const destinationPincode = params?.consignee?.pincode

    if (!pickupPincode || !destinationPincode) {
      throw new HttpError(400, 'Pickup and destination pincodes are required to compute freight')
    }

    const courierIdForRate = params.courier_id ?? shipmentMeta?.courier_id
    if (courierIdForRate === undefined || courierIdForRate === null) {
      throw new HttpError(400, 'Courier ID is required to compute freight')
    }

    const slabbedFreight = await computeB2CFreightForOrder({
      userId,
      courierId: courierIdForRate,
      serviceProvider: params.integration_type ?? null,
      mode: selectedDelhiveryShippingMode ?? null,
      selectedMaxSlabWeight,
      zoneIdOverride: params.zone_id ?? null,
      originPincode: String(pickupPincode),
      destinationPincode: String(destinationPincode),
      weightG: normalizeServiceabilityWeightToGrams(params.package_weight ?? params.weight ?? 0),
      lengthCm: Number(params.package_length ?? params.length ?? 0),
      breadthCm: Number(params.package_breadth ?? params.breadth ?? 0),
      heightCm: Number(params.package_height ?? params.height ?? 0),
      isReverse: params.isReverse === true || params.payment_type === 'reverse',
    })

    // 2️⃣ INSERT LOCAL ORDER + WALLET TRANSACTION
    const result = await db.transaction(async (tx) => {
      const userWallet = await walletOfUser(userId, tx)
      const walletBalance = Number(userWallet?.balance ?? 0)

      const orderAmount = Number(params?.order_amount ?? 0)
      const otherCharges = Number(params?.other_charges ?? 0) // Other charges from courier serviceability API
      const shippingCharges = Number(params?.shipping_charges ?? 0) // What seller charges customer (base shipping)
      // Total shipping charges = base shipping + other charges (from serviceability API)
      const totalShippingCharges = shippingCharges + otherCharges
      const freightCharges = Number(
        slabbedFreight?.freight ?? params?.freight_charges ?? totalShippingCharges,
      ) // What platform charges seller (based on rate card)
      // Extract courier_cost from shipment response or use estimated from params
      const courierCost =
        shipmentMeta?.courier_cost !== undefined && shipmentMeta?.courier_cost !== null
          ? Number(shipmentMeta.courier_cost)
          : params?.courier_cost
            ? Number(params.courier_cost)
            : null // Use estimated cost from serviceability if available

      console.log('💰 Courier Cost Summary:', {
        order_number: params.order_number,
        integration_type: params.integration_type,
        from_shipment_response: shipmentMeta?.courier_cost,
        from_params: params?.courier_cost,
        final_courier_cost: courierCost,
        freight_charges: freightCharges, // What platform charges seller
        shipping_charges: shippingCharges, // Base shipping (what seller charges customer)
        other_charges: otherCharges, // Other charges from serviceability API
        total_shipping_charges: totalShippingCharges, // Total shipping (base + other)
      })
      const discount = Number(params?.discount ?? 0)
      const giftWrap = Number(params?.gift_wrap ?? 0)
      const transactionFee = Number(params?.transaction_fee ?? 0)
      const prepaidAmt = Number(params?.prepaid_amount ?? 0)

      // Calculate total amount (customer-facing) - includes other_charges in shipping
      const totalAmount =
        orderAmount +
        totalShippingCharges + // Includes other_charges
        transactionFee +
        giftWrap +
        (isCodOrder ? codCharges : 0) -
        discount -
        prepaidAmt

      console.log('💰 Order Charges Summary:', {
        order_number: params.order_number,
        payment_type: params.payment_type,
        order_amount: orderAmount,
        shipping_charges: shippingCharges, // Base shipping
        other_charges: otherCharges, // Other charges from serviceability API
        total_shipping_charges: totalShippingCharges, // Base + other
        transaction_fee: transactionFee,
        gift_wrap: giftWrap,
        cod_charges: isCodOrder ? codCharges : 0,
        discount: discount,
        prepaid_amount: prepaidAmt,
        total_amount: totalAmount,
        freight_charges: freightCharges, // What platform charges seller
        courier_cost: courierCost, // What platform pays courier
      })

      let walletDebit = 0
      if (params.payment_type === 'prepaid') {
        // Prepaid: Seller wallet debited for freight charges + other charges (all courier costs)
        // Customer pays: order_amount + shipping + transaction_fee + gift_wrap - discount - prepaid
        // Seller wallet debited: freight_charges (courier shipping cost) + other_charges (fuel surcharge, handling, etc.)
        walletDebit = freightCharges + otherCharges

        // Validate that otherCharges are included
        if (otherCharges > 0) {
          console.log('✅ Other charges included in wallet debit:', otherCharges)
        } else if (otherCharges === 0 && params?.other_charges === undefined) {
          console.warn(
            '⚠️ other_charges not provided in params - defaulting to 0. Ensure other charges are included if applicable.',
          )
        }

        console.log('💳 Prepaid Wallet Deduction:', {
          order_number: params.order_number,
          wallet_balance: walletBalance,
          freight_charges: freightCharges,
          other_charges: otherCharges,
          wallet_debit: walletDebit,
          breakdown: `freight (${freightCharges}) + other (${otherCharges}) = ${walletDebit}`,
          reason: 'B2C Prepaid Order Payment',
        })

        if (walletBalance < walletDebit) {
          throw new Error('Insufficient wallet balance for prepaid order')
        }
      } else {
        // COD: Seller wallet debited for freight charges + other charges + COD charges
        // Customer pays: order_amount + shipping + COD + transaction_fee + gift_wrap - discount
        // Seller wallet debited: freight_charges (courier shipping) + other_charges (fuel surcharge, handling, etc.) + cod_charges (courier COD fee)
        walletDebit = freightCharges + otherCharges + codCharges

        // Validate that otherCharges are included
        if (otherCharges > 0) {
          console.log('✅ Other charges included in wallet debit:', otherCharges)
        } else if (otherCharges === 0 && params?.other_charges === undefined) {
          console.warn(
            '⚠️ other_charges not provided in params - defaulting to 0. Ensure other charges are included if applicable.',
          )
        }

        console.log('💳 COD Wallet Deduction:', {
          order_number: params.order_number,
          wallet_balance: walletBalance,
          freight_charges: freightCharges,
          other_charges: otherCharges,
          cod_charges: codCharges,
          wallet_debit: walletDebit,
          breakdown: `freight (${freightCharges}) + other (${otherCharges}) + cod (${codCharges}) = ${walletDebit}`,
          reason: 'B2C COD Service Charges',
        })

        if (walletBalance < walletDebit) {
          throw new Error('Insufficient wallet balance for COD service charges')
        }
      }

      // 3️⃣ CREATE LOCAL ORDER ENTRY (no seller insurance for B2C – platform liability only)
      const orderStatus = 'booked'
      const manifestErrorMessage = null

      const newOrder = await createB2COrder({
        tx,
        params,
        shipmentData: shipmentMeta,
        userId,
        shippingCharges: totalShippingCharges, // Total shipping (base + other charges)
        otherCharges, // Store other_charges separately
        freightCharges,
        courierCost: courierCost ?? undefined, // Save courier cost (actual from API or estimated from serviceability)
        transactionFee,
        giftWrap,
        discount,
        status: orderStatus,
        manifestError: manifestErrorMessage,
        integration_type: params?.integration_type!,
        is_external_api,
        volumetricWeight: slabbedFreight.volumetric_weight ?? undefined,
        chargedWeight: slabbedFreight.chargeable_weight ?? undefined,
        chargedSlabs: slabbedFreight.slabs ?? undefined,
        shippingMode: selectedDelhiveryShippingMode ?? null,
        selectedMaxSlabWeight,
      })

      if (selectedDelhiveryShippingMode && selectedDelhiveryCourierId !== null) {
        console.log('💾 Delhivery service persisted with order record', {
          order_number: params.order_number,
          order_id: newOrder.id,
          courier_id: selectedDelhiveryCourierId,
          shipping_mode: selectedDelhiveryShippingMode,
        })
      }

      // 4️⃣ WALLET TRANSACTION
      // Delhivery forward orders use deferred manifest generation, so charge only after manifest succeeds.
      const shouldDeferWalletDebit =
        integrationType === 'delhivery' && !isReverseShipment && shipmentData?.deferred_manifest === true
      const finalWalletDebit = walletDebit ?? 0
      if (shouldDeferWalletDebit) {
        console.log('ℹ️ Deferring wallet debit until manifest success for Delhivery order', {
          order_number: params.order_number,
          deferred_wallet_debit: finalWalletDebit,
        })
      } else if (finalWalletDebit <= 0) {
        console.warn('⚠️ Wallet debit is 0 or negative, skipping wallet transaction')
      } else {
        await createWalletTransaction({
          walletId: userWallet?.id,
          amount: finalWalletDebit,
          currency: 'INR',
          type: 'debit',
          reason:
            params.payment_type === 'prepaid'
              ? 'B2C Prepaid Order Payment'
              : 'B2C COD Service Charges',
          ref: newOrder?.id?.toString(),
          meta: {
            order_number: params.order_number,
            shipment_id: shipmentMeta.shipment_id,
            awb_number: shipmentMeta.awb_number,
            courier_name: shipmentMeta.courier_name,
            integration_type: params.integration_type,
            boxes: params.order_items,
            payment_type: params.payment_type,
            freight_charges: freightCharges,
            other_charges: otherCharges,
            cod_charges: isCodOrder ? codCharges : 0,
            charged_weight: slabbedFreight.chargeable_weight,
            volumetric_weight: slabbedFreight.volumetric_weight,
            charged_slabs: slabbedFreight.slabs,
            total_wallet_debit: finalWalletDebit,
          },
          tx: tx as any,
        })
        console.log('✅ Wallet transaction created:', {
          order_number: params.order_number,
          wallet_debit: finalWalletDebit,
          breakdown: {
            freight_charges: freightCharges,
            other_charges: otherCharges,
            cod_charges: isCodOrder ? codCharges : 0,
          },
          charged_weight: slabbedFreight.chargeable_weight,
          volumetric_weight: slabbedFreight.volumetric_weight,
          charged_slabs: slabbedFreight.slabs,
        })
      }

      // 🧾 Download CourierCart label URL and save to R2, or generate platform label
      if (params.integration_type === 'couriercart' || !params.integration_type) {
        try {
          const [freshOrder] = await tx
            .select()
            .from(b2c_orders)
            .where(eq(b2c_orders.id, newOrder.id))

          if (freshOrder) {
            // Try to download CourierCart label URL first if available
            const courierCartLabelUrl = shipmentMeta?.label

            if (
              courierCartLabelUrl &&
              typeof courierCartLabelUrl === 'string' &&
              courierCartLabelUrl.startsWith('http')
            ) {
              try {
                console.log(`📥 Downloading CourierCart label from URL: ${courierCartLabelUrl}`)

                // Download label PDF from CourierCart URL
                const labelResponse = await axios.get(courierCartLabelUrl, {
                  responseType: 'arraybuffer',
                  timeout: 30000,
                })

                const labelBuffer = Buffer.from(labelResponse.data)

                // Upload to R2
                const { uploadUrl, key } = await presignUpload({
                  filename: `label-${params.order_number}.pdf`,
                  contentType: 'application/pdf',
                  userId,
                  folderKey: 'labels',
                })

                const putUrl = Array.isArray(uploadUrl) ? uploadUrl[0] : uploadUrl
                await axios.put(putUrl, labelBuffer, {
                  headers: { 'Content-Type': 'application/pdf' },
                })

                const labelKey = Array.isArray(key) ? key[0] : key

                // Update order with R2 key
                await tx
                  .update(b2c_orders)
                  .set({
                    label: labelKey,
                    updated_at: new Date(),
                  })
                  .where(eq(b2c_orders.id, newOrder.id))

                console.log(`✅ CourierCart label downloaded and saved to R2: ${labelKey}`)
              } catch (downloadErr: any) {
                console.error(
                  `❌ Failed to download CourierCart label from URL: ${courierCartLabelUrl}`,
                  downloadErr?.message || downloadErr,
                )
                console.log(`🔄 Falling back to generating custom label for ${params.order_number}`)

                // Fallback to generating custom label
                const labelKey = await generateLabelForOrder(freshOrder, userId, tx)
                if (labelKey) {
                  await tx
                    .update(b2c_orders)
                    .set({
                      label: labelKey,
                      updated_at: new Date(),
                    })
                    .where(eq(b2c_orders.id, newOrder.id))
                  console.log(`✅ CourierCart custom label generated and saved: ${labelKey}`)
                }
              }
            } else {
              // No CourierCart label URL - generate custom label
              console.log(
                `🔄 No CourierCart label URL, generating custom label for ${params.order_number}`,
              )
              const labelKey = await generateLabelForOrder(freshOrder, userId, tx)
              if (labelKey) {
                await tx
                  .update(b2c_orders)
                  .set({
                    label: labelKey,
                    updated_at: new Date(),
                  })
                  .where(eq(b2c_orders.id, newOrder.id))
                console.log(`✅ CourierCart custom label generated and saved: ${labelKey}`)
              } else {
                console.warn(
                  `⚠️ CourierCart label generator returned empty result for ${params.order_number}`,
                )
              }
            }
          }
        } catch (labelErr: any) {
          console.error(
            `❌ Failed to process CourierCart label for ${params.order_number}:`,
            labelErr?.message || labelErr,
          )
        }
      }
      console.log(
        `✅ Local order ${newOrder.id} created via ${params.integration_type} (AWB: ${shipmentMeta.awb_number})`,
      )

      // 🔔 Send webhook event for order creation (async, don't wait)
      const webhookStatus = 'booked'

      sendWebhookEvent(userId, 'order.created', {
        order_id: newOrder.id,
        order_number: params.order_number,
        awb_number: shipmentMeta.awb_number,
        status: webhookStatus,
        courier_partner: shipmentMeta.courier_name,
        courier_id: shipmentMeta.courier_id,
        shipment_id: shipmentMeta.shipment_id,
        integration_type: params.integration_type,
        payment_type: params.payment_type,
        created_at: new Date().toISOString(),
      }).catch((err) => {
        console.error('Failed to send order.created webhook:', err)
        // Don't fail the main flow if webhook fails
      })

      return { order: newOrder, shipment: shipmentData }
    })

    rollbackActions.length = 0
    return result
  } catch (error) {
    for (const action of rollbackActions.reverse()) {
      await action().catch((err) => {
        console.error('❌ Failed during rollback action:', err?.response?.data || err?.message)
      })
    }

    throw error
  }
}

//B2B

export const createB2BShipmentService = async (
  params: ShipmentParams,
  userId: string,
  is_external_api: boolean = false,
) => {
  await requireMerchantOrderReadiness(userId)

  // Helper function to normalize JSON values (similar to B2C)
  const normalizeJsonValue = (value: unknown) => {
    if (!value) return null

    if (typeof value === 'string') {
      const trimmed = value.trim()
      if (!trimmed) return null
      try {
        return JSON.parse(trimmed)
      } catch (err) {
        console.warn('⚠️ Unable to parse JSON string in createB2BShipmentService:', trimmed)
        return null
      }
    }

    if (typeof value === 'object') {
      const keys = Object.keys(value as Record<string, unknown>).filter((key) => {
        const v = (value as Record<string, unknown>)[key]
        if (v === undefined || v === null) return false
        if (typeof v === 'string') return v.trim().length > 0
        return true
      })

      return keys.length ? value : null
    }

    return null
  }

  const pickupDetails = normalizeJsonValue(params.pickup) ?? {}
  const rtoDetails = normalizeJsonValue(params.rto)
  const normalizedOrderNumber = await ensureUniqueMerchantOrderNumber(db as any, userId, params.order_number)

  const invoiceValue = Number(params.invoice_amount ?? params.order_amount ?? 0)

  // Derive actual courier + service provider + user's active plan for ROV
  const courierId =
    params.courier_id !== undefined && params.courier_id !== null
      ? Number(params.courier_id)
      : undefined
  const serviceProvider = params.integration_type ?? undefined

  let activePlanId: string | null = null
  try {
    const [userPlan] = await db
      .select({ planId: userPlans.plan_id })
      .from(userPlans)
      .where(eq(userPlans.userId, userId))
    activePlanId = userPlan?.planId ?? null
  } catch (planErr) {
    console.error('⚠️ Failed to fetch B2B user plan for ROV:', planErr)
  }

  const rovCharge =
    params.is_insurance === 1
      ? await computeRovChargeForOrder({
          invoiceValue,
          isInsurance: true,
          courierId,
          serviceProvider,
          planId: activePlanId ?? undefined,
        })
      : 0

  // Compute B2B rate breakdown (using admin overhead config)
  let chargesBreakdown: {
    baseFreight: number
    overheads: {
      id: string
      code?: string
      name: string
      type: string
      amount: number
      description?: string
    }[]
    demurrage: number
    total: number
  } | null = null

  try {
    const rateResult = await calculateB2BRate({
      originPincode: params.pickup?.pincode ?? '',
      destinationPincode: params.consignee.pincode,
      weightKg: Number(params.package_weight ?? 0),
      length: Number(params.package_length ?? 0) || undefined,
      width: Number(params.package_breadth ?? 0) || undefined,
      height: Number(params.package_height ?? 0) || undefined,
      invoiceValue,
      paymentMode: (params.payment_type ?? 'prepaid').toUpperCase() === 'COD' ? 'COD' : 'PREPAID',
      courierScope: {
        courierId: params.courier_id ? Number(params.courier_id) : undefined,
        serviceProvider: params.integration_type ?? undefined,
      },
      pickupDate: params.pickup?.pickup_date,
      deliveryAddress: params.consignee.address,
      planId: activePlanId ?? undefined,
    })

    if (rateResult?.charges) {
      chargesBreakdown = {
        baseFreight: rateResult.charges.baseFreight,
        overheads: rateResult.charges.overheads,
        demurrage: rateResult.charges.demurrage,
        total: rateResult.charges.total,
      }
    }
  } catch (err) {
    console.error('⚠️ Failed to compute B2B charges breakdown for order', params.order_number, err)
    chargesBreakdown = null
  }

  // 1️⃣ Insert local B2B order as 'pending'
  const [pendingOrder] = await db
    .insert(b2b_orders)
    .values({
      order_number: normalizedOrderNumber,
      order_date: params?.order_date,
      order_amount: params?.order_amount,
      user_id: userId,
      company_name: params.consignee?.company_name ?? '',
      company_gst: params.consignee?.gstin ?? '',
      buyer_name: params.consignee.name,
      buyer_phone: params.consignee.phone ?? '',
      buyer_email: params.consignee.email ?? '',
      address: params.consignee.address,
      city: params.consignee.city,
      state: params.consignee.state,
      country: 'India',
      pincode: params.consignee.pincode,
      packages: params.boxes ? JSON.stringify(params.boxes) : null,
      order_type: params.payment_type,
      order_status: 'pending',
      invoice_number: params?.invoice_number,
      invoice_date: params?.invoice_date,
      invoice_amount: params?.invoice_amount ? String(params.invoice_amount) : null,
      is_insurance: params.is_insurance === 1,
      declared_value: params.is_insurance === 1 ? invoiceValue : null,
      rov_charge: params.is_insurance === 1 ? rovCharge : null,
      charges_breakdown: chargesBreakdown,
      shipping_charges: params.shipping_charges ?? 0,
      freight_charges: params.freight_charges ?? params.shipping_charges ?? 0, // What platform charges seller
      courier_cost: params.courier_cost ?? null, // What platform pays courier (will be updated via webhook)
      transaction_fee: params.transaction_fee ?? 0,
      discount: params.discount ?? 0,
      gift_wrap: params.gift_wrap ? Number(params.gift_wrap) : 0,
      products: params?.order_items ?? [],
      delivery_location: params.delivery_location ?? params.zone ?? null,
      pickup_location_id: params.pickup_location_id ?? params.pickup?.warehouse_name ?? null,
      pickup_details: pickupDetails,
      rto_details: rtoDetails,
      is_rto_different: params.is_rto_different === 'yes',
      is_external_api: is_external_api ?? false,
      created_at: new Date(),
      updated_at: new Date(),
    } as any)
    .returning({ id: b2b_orders.id })

  // 2️⃣ Calculate package weight and dimensions
  const boxes = params?.order_items ?? []

  const totalDeadWeight = boxes.reduce((sum: number, b: any) => sum + Number(b.weight ?? 0), 0)
  const totalVolumetricWeight = boxes.reduce(
    (sum: number, b: any) =>
      sum + (Number(b.length ?? 0) * Number(b.breadth ?? 0) * Number(b.height ?? 0)) / 5000,
    0,
  )

  const package_weight = Math.ceil(Math.max(totalDeadWeight, totalVolumetricWeight))
  const package_length = Math.max(...boxes.map((b: any) => Number(b.length ?? 0)))
  const package_breadth = Math.max(...boxes.map((b: any) => Number(b.breadth ?? 0)))
  const package_height = Math.max(...boxes.map((b: any) => Number(b.height ?? 0)))

  // 3️⃣ Prepare payload for Delhivery
  const payload: ShipmentParams = {
    ...params,
    payment_type: params.payment_type === 'prepaid' ? 'prepaid' : 'cod',
    request_auto_pickup: params.request_auto_pickup ?? 'no',
    is_insurance: params.is_insurance ?? 0,
    is_rto_different: params.is_rto_different ?? 'no',
    package_weight,
    package_length,
    package_breadth,
    package_height,
    order_items: boxes?.map((b: any) => ({
      name: b.box_name,
      sku: b.sku ?? 'NA',
      qty: b.quantity ?? 1,
      price: Number(b.price),
      hsn: b.hsnCode ?? '',
      discount: Number(b.discount ?? 0),
      tax_rate: Number(b.tax_rate ?? 0),
    })),
  }

  // console.log('payload', payload)

  let shipmentData

  // try {
  //   // 4️⃣ Call courier API
  //   // const res = await axios.post(`${process.env.NIMBUSPOST_API_BASE}/shipments`, payload, {
  //   //   headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  //   //   timeout: 15000,
  //   // })
  //   shipmentData = res.data
  // } catch (err) {
  //   // Mark order as failed if API call fails
  //   await db
  //     .update(b2b_orders)
  //     .set({ order_status: 'failed', updated_at: new Date() })
  //     .where(eq(b2b_orders.id, pendingOrder.id))
  //   console.error('Courier API failed:', err)
  //   throw new Error('B2B Shipment creation failed')
  // }
  // if (shipmentData?.status === false) {
  //   throw new HttpError(500, `Order Creation Failed: ${shipmentData?.message ?? ''}`)
  // }

  // console.log('shipment dsata', shipmentData)
  // 5️⃣ Update local order and deduct wallet in a transaction
  // await db.transaction(async (tx) => {
  //   const userWallet = await walletOfUser(userId, tx)
  //   if (!userWallet?.[0]) throw new Error('Wallet not found')

  //   const wallet = userWallet[0]

  //   // 2️⃣ Check sufficient balance
  //   if ((wallet.balance ?? 0) < Number(params.order_amount)) {
  //     throw new Error('Insufficient wallet balance for prepaid B2B order')
  //   }

  //   await createWalletTransaction({
  //     walletId: wallet.id,
  //     amount: params.order_amount ?? 0,
  //     currency: 'INR',
  //     type: 'debit',
  //     reason: 'B2B Order Payment',
  //     ref: pendingOrder.id?.toString(),
  //     meta: {
  //       order_number: params.order_number,
  //       shipment_id: shipmentData?.shipment?.id ?? null,
  //       boxes: params.order_items,
  //     },
  //     tx: tx as any,
  //   })

  //   // Extract courier cost from response for B2B
  //   const courierCostFromResponse =
  //     shipmentData?.data?.freight_charges ||
  //     shipmentData?.data?.charge ||
  //     shipmentData?.data?.cost ||
  //     shipmentData?.freight_charges ||
  //     shipmentData?.charge ||
  //     params?.courier_cost ||
  //     null

  //   await tx
  //     .update(b2b_orders)
  //     .set({
  //       order_status: 'booked',
  //       shipment_id: shipmentData.data.shipment_id?.toString() ?? '',
  //       awb_number: shipmentData.data.awb_number ?? '',
  //       courier_partner: shipmentData.data.courier_name ?? '',
  //       courier_id: shipmentData.data.courier_id ?? null,
  //       label: shipmentData.data.label ?? '',
  //       manifest: shipmentData.data.manifest ?? '',
  //       courier_cost: courierCostFromResponse, // Save courier cost from shipment response
  //       updated_at: new Date(),
  //     })
  //     .where(eq(b2b_orders.id, pendingOrder.id))
  // })

  console.log(`B2B Order ${pendingOrder.id} successfully booked with Delhivery shipment.`)
  return shipmentData
}

export const getAllB2COrdersService = async () => {
  const orders = await db.select().from(b2c_orders).orderBy(desc(b2c_orders.updated_at)) // ✅ FIX
  return orders
}

// ✅ Get all B2B orders
export const getAllB2BOrdersService = async () => {
  const orders = await db.select().from(b2b_orders).orderBy(desc(b2b_orders.created_at)) // ✅ FIX
  return orders
}

interface OrderFilters {
  status?: string | string[] // support single or multiple statuses
  type?: string
  courier?: string
  warehouse?: string
  fromDate?: string
  toDate?: string
  search?: string
  sortBy?: 'created_at'
  sortOrder?: 'asc' | 'desc'
}

export const getB2COrdersByUserService = async (
  userId: string,
  page: number = 1,
  limit: number = 10,
  filters: OrderFilters = {},
) => {
  const offset = (page - 1) * limit

  // Build conditions array (explicit type)
  const conditions: SQL<unknown>[] = [eq(b2c_orders.user_id, userId)]

  // 🔹 Status filter (single or multiple)
  if (filters.status) {
    if (Array.isArray(filters.status)) {
      conditions.push(inArray(b2c_orders.order_status, filters.status))
    } else {
      conditions.push(eq(b2c_orders.order_status, filters.status))
    }
  }

  // 🔹 Type filter (COD / Prepaid)
  if (filters.type) {
    conditions.push(eq(b2c_orders.order_type, filters.type))
  }

  // 🔹 Courier filter
  if (filters.courier) {
    const courierId = Number(filters.courier)
    if (!isNaN(courierId) && courierId > 0) {
      // Match by courier_id (numeric)
      conditions.push(eq(b2c_orders.courier_id, courierId))
    } else {
      // If not a valid number, try matching by courier_partner name
      conditions.push(ilike(b2c_orders.courier_partner, `%${filters.courier}%`))
    }
  }

  // 🔹 Warehouse filter - check both pickup_location_id and pickup_details JSONB
  if (filters.warehouse && filters.warehouse.trim()) {
    const warehouseFilter = `%${filters.warehouse.trim()}%`
    const warehouseConditions: any[] = [ilike(b2c_orders.pickup_location_id, warehouseFilter)]

    // Also check JSONB fields in pickup_details
    warehouseConditions.push(
      sql`COALESCE(${b2c_orders.pickup_details}->>'warehouse_name', '') ILIKE ${warehouseFilter}`,
    )
    warehouseConditions.push(
      sql`COALESCE(${b2c_orders.pickup_details}->>'name', '') ILIKE ${warehouseFilter}`,
    )

    conditions.push(or(...warehouseConditions) as any)
  }

  // 🔹 Date filters
  if (filters.fromDate) {
    // Start of day for fromDate
    const fromDate = new Date(filters.fromDate)
    fromDate.setHours(0, 0, 0, 0)
    conditions.push(gte(b2c_orders.created_at, fromDate))
  }
  if (filters.toDate) {
    // End of day for toDate to include the entire day
    const toDate = new Date(filters.toDate)
    toDate.setHours(23, 59, 59, 999)
    conditions.push(lte(b2c_orders.created_at, toDate))
  }

  if (filters.search && filters.search.trim()) {
    const search = filters.search.trim()

    // try parse number safely
    const searchAsNumber = Number(search)
    const isNumericSearch = !isNaN(searchAsNumber) && search.length > 0

    const searchConditions: any[] = [
      ilike(b2c_orders.order_number, `%${search}%`),
      ilike(b2c_orders.buyer_name, `%${search}%`),
      ilike(b2c_orders.buyer_phone, `%${search}%`),
      ilike(b2c_orders.awb_number, `%${search}%`),
      ilike(b2c_orders.buyer_email, `%${search}%`),
    ]

    if (isNumericSearch) {
      // Match exact order amount
      searchConditions.push(eq(b2c_orders.order_amount, searchAsNumber))
      // Also search in order amount as text for partial matches
      searchConditions.push(
        sql`CAST(${b2c_orders.order_amount} AS TEXT) ILIKE ${'%' + search + '%'}`,
      )
    }

    // Search in city, state, and pincode
    searchConditions.push(ilike(b2c_orders.city, `%${search}%`))
    searchConditions.push(ilike(b2c_orders.state, `%${search}%`))
    searchConditions.push(ilike(b2c_orders.pincode, `%${search}%`))

    conditions.push(or(...searchConditions) as any)
  }

  // Combine conditions safely
  const whereCondition = conditions.length === 1 ? conditions[0] : and(...conditions)

  // Count total rows
  const totalResult = await db
    .select({ value: count().as('value') })
    .from(b2c_orders)
    .where(whereCondition)

  const total = Number(totalResult[0]?.value ?? 0)

  if (total === 0) {
    return { orders: [], totalCount: 0, totalPages: 0 }
  }

  // Fetch paginated results
  const sortBy = filters.sortBy || 'created_at'
  const sortOrder = filters.sortOrder === 'asc' ? 'asc' : 'desc'
  const orderByClause =
    sortBy === 'created_at' && sortOrder === 'asc'
      ? asc(b2c_orders.created_at)
      : desc(b2c_orders.created_at)

  const ordersRaw = await db
    .select({
      ...getTableColumns(b2c_orders),
      totalAmount: sql<number>`
        (
          COALESCE(${b2c_orders.order_amount}, 0)
          + COALESCE(${b2c_orders.shipping_charges}, 0)
          + COALESCE(${b2c_orders.transaction_fee}, 0)
          + COALESCE(${b2c_orders.gift_wrap}, 0)
          + CASE WHEN ${b2c_orders.order_type} = 'cod' THEN COALESCE(${b2c_orders.cod_charges}, 0) ELSE 0 END
          - COALESCE(${b2c_orders.discount}, 0)
          - COALESCE(${b2c_orders.prepaid_amount}, 0)
        ) as "totalAmount"
      `,
    })
    .from(b2c_orders)
    .where(whereCondition)
    .orderBy(orderByClause)
    .limit(limit)
    .offset(offset)

  // Sanitize orders - remove internal platform fields (courier_cost)
  const { sanitizeOrdersForCustomer } = await import('../../utils/orderSanitizer')
  const orders = await sanitizeOrdersForCustomer(ordersRaw)

  return {
    orders,
    totalCount: total,
    totalPages: Math.ceil(total / limit),
  }
}

export const getB2BOrdersByUserService = async (
  userId: string,
  page: number = 1,
  limit: number = 10,
  filters: OrderFilters = {},
) => {
  const offset = (page - 1) * limit

  const conditions: any[] = [sql`${b2b_orders.user_id} = ${userId}::uuid`]

  // if (filters.status) conditions.push(eq(b2b_orders.order_status, filters.status))
  if (filters.fromDate)
    conditions.push(
      gte(b2b_orders.order_date, new Date(filters.fromDate).toISOString().slice(0, 10)),
    )
  if (filters.toDate)
    conditions.push(lte(b2b_orders.order_date, new Date(filters.toDate).toISOString().slice(0, 10)))

  if (filters.search) {
    conditions.push(
      or(
        ilike(b2b_orders.order_number, `%${filters.search}%`),
        ilike(b2b_orders.buyer_name, `%${filters.search}%`),
        ilike(b2b_orders.buyer_phone, `%${filters.search}%`),
        ilike(b2b_orders.awb_number, `%${filters.search}%`),
      ),
    )
  }

  const whereCondition = conditions.length === 1 ? conditions[0] : and(...conditions)

  const totalResult = await db
    .select({ value: count().as('value') })
    .from(b2b_orders)
    .where(whereCondition)

  const total = Number(totalResult[0]?.value ?? 0)

  if (total === 0) return { orders: [], totalCount: 0, totalPages: 0 }

  const ordersRaw = await db
    .select()
    .from(b2b_orders)
    .where(whereCondition)
    .orderBy(desc(b2b_orders.order_date))
    .limit(limit)
    .offset(offset)

  // Sanitize orders - remove internal platform fields (courier_cost)
  const { sanitizeOrdersForCustomer } = await import('../../utils/orderSanitizer')
  const orders = await sanitizeOrdersForCustomer(ordersRaw)

  return {
    orders,
    totalCount: total,
    totalPages: Math.ceil(total / limit),
  }
}

// // 🔹 Get all B2B orders for a user
// export const getB2BOrdersByUserService = async (userId: string) => {
//   const orders = await db
//     .select()
//     .from(b2b_orders)
//     .where(eq(b2b_orders.user_id, userId))
//     .orderBy(desc(b2b_orders.created_at))

//   return orders
// }
interface UpdateB2COrderParams {
  awb_number?: string // identify order by AWB
  order_id?: string // or by internal order ID
  updates: Partial<{
    manifest: string
    order_status: string
    courier_partner: string
    updated_at: Date
    [key: string]: any // for any other dynamic field
  }>
}

export const updateB2COrderService = async (params: UpdateB2COrderParams) => {
  try {
    const { awb_number, order_id, updates } = params

    if (!awb_number && !order_id) {
      throw new Error('Either awb_number or order_id must be provided')
    }

    const condition = awb_number
      ? eq(b2c_orders.awb_number, awb_number)
      : eq(b2c_orders.order_id, order_id!)

    const updated = await db
      .update(b2c_orders)
      .set({ ...updates, updated_at: new Date() })
      .where(condition)
      .returning({ id: b2c_orders.id, awb_number: b2c_orders.awb_number })

    return updated
  } catch (error: any) {
    console.error('Update B2C order error:', error.message)
    throw new Error(`Failed to update order: ${error.message}`)
  }
}

type OrderType = 'b2c' | 'b2b'

// ----------------------
// Generate Manifest
// ----------------------
export const generateManifestService = async (params: {
  awbs: string[]
  type: 'b2c' | 'b2b'
  userId?: string
}): Promise<{
  manifest_id: string | null
  manifest_url: string | null
  manifest_key: string | null
  warnings?: string[]
}> => {
  const table = params.type === 'b2c' ? b2c_orders : b2b_orders

  return await db.transaction(
    async (
      tx,
    ): Promise<{
      manifest_id: string | null
      manifest_url: string | null
      manifest_key: string | null
      warnings?: string[]
    }> => {
      let manifestFailureOrderIds: string[] = []

      try {
        const normalizedRefs = Array.from(
          new Set((params.awbs || []).map((value) => String(value ?? '').trim()).filter(Boolean)),
        )

        if (normalizedRefs.length === 0) {
          throw new Error('No AWBs provided for manifest generation')
        }

        const orderLookupColumns =
          params.type === 'b2c'
            ? {
                id: b2c_orders.id,
                user_id: b2c_orders.user_id,
                order_number: b2c_orders.order_number,
                awb_number: b2c_orders.awb_number,
                integration_type: b2c_orders.integration_type,
              }
            : {
                id: b2b_orders.id,
                user_id: b2b_orders.user_id,
                order_number: b2b_orders.order_number,
                awb_number: b2b_orders.awb_number,
              }

        const orderMatchCondition = or(
          inArray(table.awb_number, normalizedRefs),
          inArray(table.order_number, normalizedRefs),
        )

        const scopedOrderCondition = params.userId
          ? and(orderMatchCondition, eq(table.user_id, params.userId))
          : orderMatchCondition

        const orders = await tx
          .select(orderLookupColumns as any)
          .from(table)
          .where(scopedOrderCondition as any)

        if (!orders.length) {
          throw new HttpError(404, 'No orders found for the selected manifest request.')
        }

        const matchedRefs = new Set<string>()
        orders.forEach((order) => {
          const awbNumber = String(order.awb_number ?? '').trim()
          const orderNumber = String(order.order_number ?? '').trim()
          if (awbNumber) matchedRefs.add(awbNumber)
          if (orderNumber) matchedRefs.add(orderNumber)
        })

        const missingRefs = normalizedRefs.filter((ref) => !matchedRefs.has(ref))
        if (missingRefs.length > 0) {
          throw new HttpError(
            404,
            `Manifest could not be started for: ${summarizeManifestRefs(missingRefs)}.`,
          )
        }

        const orderUserIds = Array.from(
          new Set(orders.map((order) => String((order as { user_id?: string }).user_id ?? '').trim()).filter(Boolean)),
        )

        if (orderUserIds.length > 1) {
          throw new HttpError(400, 'Manifest can only be generated for one merchant at a time.')
        }

        const integrationTypes =
          params.type === 'b2c'
            ? Array.from(
                new Set(
                  orders.map((order) =>
                    String(
                      (order as (typeof orders)[0] & { integration_type?: string })
                        ?.integration_type ?? 'delhivery',
                    )
                      .trim()
                      .toLowerCase() || 'delhivery',
                  ),
                ),
              )
            : ['delhivery']

        if (params.type === 'b2c' && integrationTypes.length > 1) {
          throw new HttpError(
            400,
            'Select orders from only one courier at a time for manifesting.',
          )
        }

        const integrationType = integrationTypes[0] || 'delhivery'

        if (integrationType === 'xpressbees' || integrationType === 'ekart') {
          if (params.type !== 'b2c') {
            throw new Error('This manifest flow is only supported for B2C orders')
          }

          const fetchedOrders: any[] = []
          for (const order of orders) {
            const [fullOrder] = await tx.select().from(b2c_orders).where(eq(b2c_orders.id, order.id))
            if (fullOrder) fetchedOrders.push(fullOrder)
          }

          if (!fetchedOrders.length) {
            throw new Error(`Unable to load ${integrationType} orders for manifest generation`)
          }

          const providerName = integrationType === 'ekart' ? 'Ekart' : 'Xpressbees'
          const providerManifestIds =
            integrationType === 'ekart'
              ? fetchedOrders
                  .map((order) =>
                    String(order.shipment_id || order.awb_number || order.order_number || '').trim(),
                  )
                  .filter(Boolean)
              : fetchedOrders
                  .map((order) => String(order.awb_number || '').trim())
                  .filter(Boolean)

          if (!providerManifestIds.length) {
            throw new Error(`No ${providerName} identifiers found for manifest generation`)
          }

          if (integrationType === 'ekart') {
            const ekart = new EkartService()
            await ekart.generateManifest(providerManifestIds)
          } else {
            const xpressbees = new XpressbeesService()
            await xpressbees.generateManifest(providerManifestIds)
          }

          const normalizeDetails = (value: any) => {
            if (!value) return {}
            if (typeof value === 'string') {
              try {
                return JSON.parse(value)
              } catch {
                return {}
              }
            }
            return value
          }

          const pickupDetails = normalizeDetails(fetchedOrders[0]?.pickup_details)

          const createManifestCard = (order: any) => ({
            width: '48%',
            margin: [0, 0, 0, 12],
            stack: [
              {
                canvas: [
                  {
                    type: 'rect',
                    x: 0,
                    y: 0,
                    w: 245,
                    h: 118,
                    r: 8,
                    lineColor: '#d8deee',
                    fillColor: '#fbfcff',
                    lineWidth: 1,
                  },
                ],
              },
              {
                margin: [12, -108, 12, 0],
                stack: [
                  {
                    columns: [
                      {
                        text: order.order_number ?? '-',
                        bold: true,
                        fontSize: 11,
                        color: '#1f2a44',
                      },
                      {
                        text: (order.order_type ?? '').toUpperCase() || '-',
                        fontSize: 8,
                        bold: true,
                        color: '#4c67a1',
                        alignment: 'right',
                      },
                    ],
                  },
                  {
                    text: `AWB: ${order.awb_number ?? '-'}`,
                    fontSize: 9,
                    color: '#42506b',
                    margin: [0, 6, 0, 0],
                  },
                  {
                    text: `Consignee: ${order.buyer_name ?? '-'}`,
                    fontSize: 9,
                    color: '#42506b',
                    margin: [0, 4, 0, 0],
                  },
                  {
                    columns: [
                      {
                        text: `Pincode: ${order.pincode ?? '-'}`,
                        fontSize: 9,
                        color: '#42506b',
                      },
                      {
                        text: `Weight: ${Number(order.weight ?? 0).toFixed(0)} g`,
                        fontSize: 9,
                        color: '#42506b',
                        alignment: 'right',
                      },
                    ],
                    margin: [0, 4, 0, 0],
                  },
                  {
                    text: `City: ${order.city ?? '-'}${order.state ? `, ${order.state}` : ''}`,
                    fontSize: 9,
                    color: '#42506b',
                    margin: [0, 4, 0, 0],
                  },
                  {
                    text: `Address: ${order.address ?? '-'}`,
                    fontSize: 8,
                    color: '#667085',
                    margin: [0, 8, 0, 0],
                  },
                ],
              },
            ],
          })

          const manifestCards = fetchedOrders.reduce((rows: any[], order, index) => {
            if (index % 2 === 0) {
              rows.push({
                columns: [
                  createManifestCard(order),
                  fetchedOrders[index + 1]
                    ? createManifestCard(fetchedOrders[index + 1])
                    : { width: '48%', text: '' },
                ],
                columnGap: 12,
              })
            }
            return rows
          }, [])

          const printer = new PdfPrinter(pdfFonts)
          const docDefinition: any = {
            defaultStyle: { font: 'Helvetica' },
            pageSize: 'A4',
            pageMargins: [30, 40, 30, 40],
            content: [
              {
                text: 'Manifest',
                fontSize: 16,
                bold: true,
                alignment: 'center',
                margin: [0, 0, 0, 10],
              },
              {
                columns: [
                  {
                    stack: [
                      { text: `Generated On: ${new Date().toLocaleString()}`, fontSize: 9 },
                      {
                        text: `Total Shipments: ${fetchedOrders.length}`,
                        fontSize: 9,
                        margin: [0, 4, 0, 0],
                      },
                    ],
                  },
                  {
                    stack: [
                      {
                        text: `User ID: ${fetchedOrders[0].user_id}`,
                        fontSize: 9,
                        alignment: 'right',
                      },
                      {
                        text: `Pickup Location: ${pickupDetails?.warehouse_name ?? '-'}`,
                        fontSize: 9,
                        alignment: 'right',
                        margin: [0, 4, 0, 0],
                      },
                    ],
                  },
                ],
                margin: [0, 0, 0, 12],
              },
              {
                text: 'Shipments',
                fontSize: 11,
                bold: true,
                color: '#24324d',
                margin: [0, 0, 0, 10],
              },
              ...manifestCards,
            ],
          }

          const pdfDoc = printer.createPdfKitDocument(docDefinition)
          const chunks: Buffer[] = []
          const pdfBuffer = await new Promise<Buffer>((resolve, reject) => {
            pdfDoc.on('data', (chunk) => chunks.push(chunk))
            pdfDoc.on('end', () => resolve(Buffer.concat(chunks)))
            pdfDoc.on('error', (err) => reject(err))
            pdfDoc.end()
          })

          const { uploadUrl, key } = await presignUpload({
            filename: `manifest-${integrationType}-${Date.now()}.pdf`,
            contentType: 'application/pdf',
            userId: fetchedOrders[0].user_id,
            folderKey: 'manifests',
          })
          const putUrl = Array.isArray(uploadUrl) ? uploadUrl[0] : uploadUrl
          await axios.put(putUrl, pdfBuffer, {
            headers: { 'Content-Type': 'application/pdf' },
            timeout: 60000,
          })
          const manifestKey = Array.isArray(key) ? key[0] : key
          const signedManifestUrl = await presignDownload(manifestKey)
          const manifestDownloadUrl = Array.isArray(signedManifestUrl)
            ? (signedManifestUrl[0] ?? null)
            : signedManifestUrl
          const manifestWarnings: string[] = []

          const orderUpdatePromises = fetchedOrders.map(async (order) => {
            const [freshOrder] = await tx
              .select()
              .from(b2c_orders)
              .where(eq(b2c_orders.id, order.id))

            if (!freshOrder) {
              console.warn(
                `⚠️ ${providerName} order ${order.order_number} not found in database, skipping label generation`,
              )
              manifestWarnings.push(
                `${order.order_number}: label could not be generated because the order was not found after manifesting.`,
              )
              return
            }

            let labelKey: string | null =
              typeof freshOrder.label === 'string' && freshOrder.label.trim()
                ? freshOrder.label.trim()
                : null

            if (!labelKey && freshOrder.awb_number) {
              try {
                labelKey = await generateLabelForOrder(freshOrder, freshOrder.user_id, tx)
                if (labelKey) {
                  console.log(
                    `✅ [${providerName}] Custom label generated for order ${freshOrder.order_number}: ${labelKey}`,
                  )
                }
              } catch (labelErr: any) {
                console.error(
                  `❌ [${providerName}] Failed to generate custom label for order ${freshOrder.order_number}:`,
                  labelErr?.message || labelErr,
                )
                manifestWarnings.push(
                  `${freshOrder.order_number}: label could not be generated.`,
                )
              }
            }

            const updateDataXpress: any = {
              manifest: manifestKey,
              order_status: 'pickup_initiated',
              updated_at: new Date(),
            }

            if (labelKey && typeof labelKey === 'string' && labelKey.trim().length > 0) {
              const normalizedLabel = normalizeToR2Key(labelKey.trim())
              if (normalizedLabel) {
                updateDataXpress.label = normalizedLabel
              }
            }

            await tx
              .update(b2c_orders)
              .set(updateDataXpress)
              .where(eq(b2c_orders.id, freshOrder.id))
          })

          await Promise.all(orderUpdatePromises)

          const invoiceResults = await Promise.allSettled(
            fetchedOrders.map((order) => generateInvoiceForOrder(order)),
          )

          const invoiceUpdateResults = await Promise.allSettled(
            invoiceResults.map(async (result, index) => {
              const order = fetchedOrders[index]

              if (result.status !== 'fulfilled' || !result.value) {
                console.warn(
                  `⚠️ [Manifest] Invoice generation failed for ${providerName} order ${order.order_number}`,
                )
                manifestWarnings.push(`${order.order_number}: invoice could not be generated.`)
                return
              }

              const invoiceResult = result.value as {
                key: string
                invoiceNumber?: string
                invoiceDate?: string
                invoiceAmount?: number
              }
              const invoiceKey = invoiceResult.key
              if (!invoiceKey || typeof invoiceKey !== 'string' || !invoiceKey.trim()) {
                manifestWarnings.push(`${order.order_number}: invoice file is missing.`)
                return
              }

              const normalizedInvoiceKey = normalizeToR2Key(invoiceKey.trim())
              if (!normalizedInvoiceKey) {
                console.warn(
                  `⚠️ [Manifest] Could not normalize invoice key for ${providerName} order ${order.order_number}: ${invoiceKey.trim()}`,
                )
                manifestWarnings.push(`${order.order_number}: invoice file could not be saved.`)
                return
              }

              await db
                .update(b2c_orders)
                .set({
                  invoice_link: normalizedInvoiceKey,
                  invoice_number: invoiceResult.invoiceNumber ?? undefined,
                  invoice_date: invoiceResult.invoiceDate ?? undefined,
                  invoice_amount:
                    invoiceResult.invoiceAmount !== undefined
                      ? invoiceResult.invoiceAmount
                      : undefined,
                  updated_at: new Date(),
                })
                .where(eq(b2c_orders.id, order.id))

              console.log(
                `✅ [Manifest] Invoice link updated for ${providerName} order ${order.order_number}: ${normalizedInvoiceKey}`,
              )
            }),
          )

          invoiceUpdateResults.forEach((result, index) => {
            if (result.status === 'fulfilled') return
            const order = fetchedOrders[index]
            console.error(
              `❌ [Manifest] Failed to update invoice_link for ${providerName} order ${order.order_number}:`,
              result.reason?.message || result.reason,
            )
            manifestWarnings.push(`${order.order_number}: invoice could not be saved.`)
          })

          const uniqueWarnings = Array.from(new Set(manifestWarnings))

          return {
            manifest_id: manifestKey,
            manifest_url: manifestDownloadUrl,
            manifest_key: manifestKey,
            warnings: uniqueWarnings.length > 0 ? uniqueWarnings : undefined,
          }
        }

        if (integrationType !== 'delhivery') {
          throw new Error('Only Delhivery is supported for manifest generation')
        }

        async function resolveManifestUrl(value: string | null): Promise<string | null> {
          if (!value) return null
          if (/^https?:\/\//i.test(value)) return value
          try {
            const signed = await presignDownload(value)
            return Array.isArray(signed) ? (signed[0] ?? null) : signed
          } catch (err) {
            console.error('⚠️ Failed to presign manifest URL:', err)
            return null
          }
        }

        // Helper function to normalize URLs to R2 keys
        // Ensures we always store R2 keys (not full Cloudflare URLs) in the database
        function normalizeToR2Key(value: string | null | undefined): string | null {
          if (!value || typeof value !== 'string' || !value.trim()) {
            return null
          }

          const trimmed = value.trim()

          // If it's already a key (doesn't start with http), return as-is
          if (!/^https?:\/\//i.test(trimmed)) {
            return trimmed
          }

          // If it's a URL, try to extract the R2 key
          try {
            const url = new URL(trimmed)
            const pathParts = url.pathname.split('/').filter(Boolean)
            const bucket = getBucketName()

            // Check if it's an R2 URL with our bucket
            if (pathParts.includes(bucket)) {
              const bucketIndex = pathParts.indexOf(bucket)
              if (bucketIndex !== -1 && bucketIndex < pathParts.length - 1) {
                const key = pathParts.slice(bucketIndex + 1).join('/')
                console.log(`🔄 Extracted R2 key from URL: ${key}`)
                return key
              }
            }

            // Check if it's an R2 endpoint URL format
            if (process.env.R2_ENDPOINT && trimmed.startsWith(process.env.R2_ENDPOINT)) {
              if (pathParts.length > 1) {
                // Skip bucket name (first part) and get the rest as key
                const key = pathParts.slice(1).join('/')
                console.log(`🔄 Extracted R2 key from endpoint URL: ${key}`)
                return key
              }
            }

            // If we can't extract a key, it's an external URL - log warning
            console.warn(
              `⚠️ Could not extract R2 key from URL, treating as external URL: ${trimmed}`,
            )
            return null // Don't store external URLs as keys
          } catch (err) {
            console.error(`❌ Failed to parse URL for key extraction: ${trimmed}`, err)
            return null
          }
        }

        // Helper function to generate invoice for an order
        async function generateInvoiceForOrder(
          order: any,
        ): Promise<
          | {
              key: string
              invoiceNumber: string
              invoiceDate: string
              invoiceAmount: number
            }
          | null
        > {
          try {
            console.log(
              `🧾 [Manifest] Generating invoice for order ${order.order_number} (ID: ${order.id})`,
            )

            // Use db instead of tx since this runs after transaction completes
            const [prefs] = await db
              .select()
              .from(invoicePreferences)
              .where(eq(invoicePreferences.userId, order.user_id))

            // 🔹 Fetch user profile for company details
            const [user] = await db
              .select({
                companyName: sql<string>`(${userProfiles.companyInfo} ->> 'brandName')`,
                companyGST: sql<string>`(${userProfiles.companyInfo} ->> 'companyGst')`,
                supportEmail: sql<string>`(${userProfiles.companyInfo} ->> 'companyEmail')`,
                supportPhone: sql<string>`(${userProfiles.companyInfo} ->> 'companyContactNumber')`,
                brandName: sql<string>`(${userProfiles.companyInfo} ->> 'brandName')`,
                companyLogo: sql<string>`(${userProfiles.companyInfo} ->> 'companyLogoUrl')`,
                companyAddress: sql<string>`(${userProfiles.companyInfo} ->> 'companyAddress')`,
                companyState: sql<string>`(${userProfiles.companyInfo} ->> 'state')`,
                panNumber: sql<string>`(${userProfiles.companyInfo} ->> 'panNumber')`,
              })
              .from(userProfiles)
              .where(eq(userProfiles.userId, order.user_id))

            const pickupDetails = normalizePickupDetails(order.pickup_details)
            const pickupPincode = pickupDetails?.pincode

            const { logoBuffer, signatureBuffer } = await loadInvoiceAssets(
              {
                companyLogoKey: user?.companyLogo ?? undefined,
                includeSignature: prefs?.includeSignature,
                signatureFile: prefs?.signatureFile ?? undefined,
              },
              order.order_number || String(order.id),
            )

            const serviceType =
              order.service_type ||
              (order as any).serviceType ||
              order.integration_type ||
              order.courier_partner ||
              ''

            // ✅ Always use prefs prefix/suffix
            const invoiceNumber = await resolveInvoiceNumber({
              userId: order.user_id,
              existingInvoiceNumber: (order as any)?.invoice_number,
              prefix: prefs?.prefix ?? undefined,
              suffix: prefs?.suffix ?? undefined,
            })
            const invoiceDateDisplay = dayjs().format('DD MMM YYYY')
            const invoiceDateStored = dayjs().format('YYYY-MM-DD')

            const pickupAddress = formatPickupAddress(pickupDetails)
            const sellerAddress = pickupAddress || user?.companyAddress || ''
            const sellerStateCode = pickupDetails?.state || user?.companyState || ''
            const sellerName =
              pickupDetails?.warehouse_name ||
              user?.companyName ||
              user?.brandName ||
              'Seller'
            const brandName =
              user?.brandName ||
              user?.companyName ||
              pickupDetails?.warehouse_name ||
              ''
            const gstNumber = user?.companyGST || ''
            const panNumber = user?.panNumber || ''
            const supportPhone = pickupDetails?.phone || user?.supportPhone || ''
            const supportEmail = user?.supportEmail || prefs?.supportEmail || ''

            // ✅ COD-safe invoice amount
            const invoiceAmount =
              Number(order.order_amount ?? 0) +
              Number(order.shipping_charges ?? 0) +
              Number(order.gift_wrap ?? 0) +
              Number(order.transaction_fee ?? 0) -
              (Number(order.discount ?? 0) + Number(order.prepaid_amount ?? 0))

            // Validate and normalize products array
            let products: Product[] = []
            try {
              if (order.products) {
                // Handle case where products might be a JSON string
                const productsData =
                  typeof order.products === 'string' ? JSON.parse(order.products) : order.products

                // Ensure it's an array
                if (Array.isArray(productsData)) {
                  products = productsData.map((p: any) => ({
                    name: p.name ?? p.productName ?? p.box_name ?? 'N/A',
                    price: Number(p.price ?? 0),
                    qty: Number(p.qty ?? p.quantity ?? 1),
                    sku: p.sku ?? '',
                    hsn: p.hsn ?? p.hsnCode ?? '',
                    discount: Number(p.discount ?? 0),
                    tax_rate: Number(p.tax_rate ?? p.taxRate ?? 0),
                    box_name: p.box_name ?? p.name ?? p.productName,
                  }))
                } else {
                  console.warn(
                    `⚠️ [Manifest] Products is not an array for order ${order.order_number}, using empty array`,
                  )
                  products = []
                }
              } else {
                console.warn(
                  `⚠️ [Manifest] Products is null/undefined for order ${order.order_number}, using empty array`,
                )
                products = []
              }
            } catch (productsErr: any) {
              console.error(
                `❌ [Manifest] Failed to parse products for order ${order.order_number}:`,
                productsErr?.message || productsErr,
              )
              products = []
            }

            // Ensure we have at least one product
            if (products.length === 0) {
              console.warn(
                `⚠️ [Manifest] No products found for order ${order.order_number}, creating placeholder product`,
              )
              products = [
                {
                  name: 'Product',
                  price: Number(order.order_amount ?? 0),
                  qty: 1,
                  sku: '',
                  hsn: '',
                  discount: 0,
                  tax_rate: 0,
                },
              ]
            }

            console.log(`📄 [Manifest] Generating invoice PDF for order ${order.order_number}...`)

            // Generate invoice PDF
            const invoiceBuffer = await generateInvoicePDF({
              invoiceNumber,
              invoiceDate: invoiceDateDisplay,
              invoiceAmount,
              buyerName: order.buyer_name,
              buyerPhone: order.buyer_phone,
              buyerEmail: order.buyer_email ?? '',
              buyerAddress: order.address,
              buyerCity: order.city,
              buyerState: order.state,
              buyerPincode: order.pincode,
              products: products,
              shippingCharges: Number(order.shipping_charges) ?? 0,
              giftWrap: Number(order.gift_wrap) ?? 0,
              transactionFee: Number(order.transaction_fee) ?? 0,
              discount: Number(order.discount) ?? 0,
              prepaidAmount: Number(order.prepaid_amount) ?? 0,
              courierName: order.courier_partner ?? '',
              courierId: order.courier_id?.toString() ?? '',
              logoBuffer,
              orderType: order?.order_type as 'prepaid' | 'cod',
              courierCod: order?.order_type === 'cod' ? Number(order?.cod_charges ?? 0) : 0,
              signatureBuffer,
              companyName: sellerName,
              supportEmail,
              supportPhone,
              companyGST: gstNumber,
              sellerName,
              brandName,
              sellerAddress,
              sellerStateCode,
              gstNumber,
              panNumber,
              invoiceNotes: prefs?.invoiceNotes ?? '',
              termsAndConditions: prefs?.termsAndConditions ?? '',
              orderId: order.order_number,
              awbNumber: order.awb_number ?? '',
              courierPartner: order.courier_partner ?? '',
              serviceType,
              pickupPincode: pickupPincode ?? '',
              deliveryPincode: order.pincode ?? '',
              orderDate: order.order_date ?? '',
              rtoCharges: Number((order as any).rto_charges ?? 0),
              layout: (prefs?.template as 'classic' | 'thermal') ?? 'classic',
            })

            if (!invoiceBuffer || invoiceBuffer.length === 0) {
              throw new Error('Invoice PDF buffer is empty')
            }

            console.log(
              `📤 [Manifest] Uploading invoice PDF for order ${order.order_number} (size: ${invoiceBuffer.length} bytes)...`,
            )

            // Upload invoice to R2
            const { uploadUrl, key } = await presignUpload({
              filename: `invoice-${order.id}.pdf`,
              contentType: 'application/pdf',
              userId: order.user_id,
              folderKey: 'invoices',
            })

            if (!uploadUrl || !key) {
              throw new Error('Failed to get presigned upload URL for invoice')
            }

            const finalUploadUrl = Array.isArray(uploadUrl) ? uploadUrl[0] : uploadUrl
            const uploadResponse = await axios.put(finalUploadUrl, invoiceBuffer, {
              headers: { 'Content-Type': 'application/pdf' },
              validateStatus: (status) => status >= 200 && status < 300, // Only accept 2xx status codes
              timeout: 60000, // 60 seconds for invoice upload
            })

            // Verify upload succeeded
            if (uploadResponse.status < 200 || uploadResponse.status >= 300) {
              throw new Error(`Upload failed with status ${uploadResponse.status}`)
            }

            const finalKey = Array.isArray(key) ? key[0] : key

            // Validate key is not empty and is a string
            if (!finalKey || typeof finalKey !== 'string' || finalKey.trim().length === 0) {
              throw new Error('Invoice key is invalid or empty after upload')
            }

            // Ensure we store only the R2 key (not a URL), even if Cloudflare returns it in URL format
            const trimmedKey = finalKey.trim()
            const normalizedKey = normalizeToR2Key(trimmedKey) || trimmedKey

            // If normalization failed but it's not a URL, use the original key
            // (normalizeToR2Key returns null for external URLs, but our key should be valid)
            const keyToStore = normalizedKey || (trimmedKey.startsWith('http') ? null : trimmedKey)

            if (!keyToStore) {
              throw new Error(`Invalid invoice key format: ${trimmedKey}`)
            }

            console.log(
              `✅ [Manifest] Invoice generated and uploaded successfully for order ${order.order_number}: ${keyToStore} (status: ${uploadResponse.status})`,
            )

            return {
              key: keyToStore,
              invoiceNumber,
              invoiceDate: invoiceDateStored,
              invoiceAmount,
            }
          } catch (err: any) {
            console.error(
              `❌ [Manifest] Failed to generate invoice for order ${order.order_number} (ID: ${order.id}):`,
              {
                error: err?.message || err,
                errorName: err?.name,
                stack: err?.stack,
                orderNumber: order.order_number,
                orderId: order.id,
                hasProducts: !!order.products,
                productsType: typeof order.products,
                productsIsArray: Array.isArray(order.products),
              },
            )
            // Return null so we can continue manifest generation even if invoice fails
            return null
          }
        }
        if (integrationType === 'delhivery') {
          const fetchedOrders: any[] = []
          let expectedPackageCount = 0
          for (const order of orders) {
            const [fullOrder] = await tx.select().from(table).where(eq(table.id, order.id))
            if (fullOrder) fetchedOrders.push(fullOrder)
          }

          if (!fetchedOrders.length) {
            throw new Error('Unable to load Delhivery orders for manifest generation')
          }

          manifestFailureOrderIds = fetchedOrders.map((order) => order.id)

          const delhivery = new DelhiveryService()
          const normalizeDetails = (value: any) => {
            if (!value) return {}
            if (typeof value === 'string') {
              try {
                return JSON.parse(value)
              } catch {
                return {}
              }
            }
            return value
          }

          const normalizeOrderItems = (value: any) => {
            try {
              const raw = typeof value === 'string' ? JSON.parse(value) : value
              if (!Array.isArray(raw) || !raw.length) {
                return [
                  {
                    name: 'Product',
                    sku: 'NA',
                    qty: 1,
                    price: 0,
                    hsn: '',
                    discount: 0,
                    tax_rate: 0,
                  },
                ]
              }

              return raw.map((item: any) => ({
                name: item?.name ?? item?.productName ?? item?.box_name ?? 'Product',
                sku: item?.sku ?? 'NA',
                qty: Number(item?.qty ?? item?.quantity ?? 1) || 1,
                price: Number(item?.price ?? 0) || 0,
                hsn: item?.hsn ?? item?.hsnCode ?? '',
                discount: Number(item?.discount ?? 0) || 0,
                tax_rate: Number(item?.tax_rate ?? item?.taxRate ?? 0) || 0,
              }))
            } catch {
              return [
                {
                  name: 'Product',
                  sku: 'NA',
                  qty: 1,
                  price: 0,
                  hsn: '',
                  discount: 0,
                  tax_rate: 0,
                },
              ]
            }
          }

          for (const order of fetchedOrders) {
            if (order.awb_number) continue

            const pickupDetails = normalizeDetails(order.pickup_details)
            const manifestParams: ShipmentParams = {
              order_number: order.order_number,
              order_date: new Date(order.order_date || order.created_at || new Date()),
              payment_type: order.order_type === 'cod' ? 'cod' : 'prepaid',
              order_amount: Number(order.order_amount ?? 0),
              package_weight: Number(order.weight ?? 0),
              package_length: Number(order.length ?? 0),
              package_breadth: Number(order.breadth ?? 0),
              package_height: Number(order.height ?? 0),
              courier_id: order.courier_id ?? undefined,
              integration_type: 'delhivery',
              invoice_number: order.invoice_number ?? undefined,
              invoice_date: order.invoice_date ?? undefined,
              is_rto_different: order.is_rto_different ? 'yes' : 'no',
              company: {},
              pickup: {
                warehouse_name: pickupDetails?.warehouse_name || '',
                name: pickupDetails?.name || pickupDetails?.warehouse_name || 'Pickup',
                address: pickupDetails?.address || '',
                city: pickupDetails?.city || '',
                state: pickupDetails?.state || '',
                pincode: pickupDetails?.pincode || '',
                phone: pickupDetails?.phone || '',
                gst_number: pickupDetails?.gst_number || '',
              },
              consignee: {
                name: order.buyer_name,
                address: order.address,
                city: order.city,
                state: order.state,
                pincode: order.pincode,
                phone: order.buyer_phone,
                email: order.buyer_email ?? '',
              },
              order_items: normalizeOrderItems(order.products),
            }

            let shipmentData: any
            try {
              shipmentData = await delhivery.createShipment(manifestParams)
            } catch (error: any) {
              const manifestErrorMessage = getUserFacingManifestError(error)
              await refundManifestFailureChargeOnce({
                orderId: order.id,
                manifestErrorMessage,
              })

              throw new HttpError(getErrorStatusCode(error, 502), manifestErrorMessage)
            }
            const shipmentPackage = shipmentData?.packages?.[0] || null
            expectedPackageCount += Math.max(
              1,
              Array.isArray(shipmentData?.packages) ? shipmentData.packages.length : 0,
            )

            await tx
              .update(b2c_orders)
              .set({
                awb_number: shipmentPackage?.waybill ?? shipmentData?.awb_number ?? null,
                shipment_id: shipmentData?.upload_wbn ?? shipmentData?.shipment_id ?? null,
                courier_partner: 'Delhivery',
                shipping_mode:
                  shipmentData?.shipping_mode ??
                  shipmentPackage?.shipping_mode ??
                  shipmentPackage?.service_mode ??
                  shipmentPackage?.service_type ??
                  order.shipping_mode ??
                  null,
                sort_code:
                  shipmentPackage?.sort_code ??
                  shipmentPackage?.sortCode ??
                  shipmentPackage?.routing_code ??
                  shipmentPackage?.routingCode ??
                  null,
                manifest: shipmentData?.upload_wbn ?? shipmentData?.manifest ?? null,
                manifest_error: null,
                order_status:
                  order.order_status === 'pending' || order.order_status === 'manifest_failed'
                    ? 'shipment_created'
                    : order.order_status,
                updated_at: new Date(),
              })
              .where(eq(b2c_orders.id, order.id))

            order.awb_number = shipmentPackage?.waybill ?? shipmentData?.awb_number ?? null
            order.shipment_id = shipmentData?.upload_wbn ?? shipmentData?.shipment_id ?? null
            order.shipping_mode =
              shipmentData?.shipping_mode ??
              shipmentPackage?.shipping_mode ??
              shipmentPackage?.service_mode ??
              shipmentPackage?.service_type ??
              order.shipping_mode ??
              null
            order.sort_code =
              shipmentPackage?.sort_code ??
              shipmentPackage?.sortCode ??
              shipmentPackage?.routing_code ??
              shipmentPackage?.routingCode ??
              null
            order.manifest = shipmentData?.upload_wbn ?? shipmentData?.manifest ?? null
          }

          if (expectedPackageCount === 0) {
            expectedPackageCount = fetchedOrders.reduce(
              (count, order) => count + (order.awb_number ? 1 : 0),
              0,
            )
          }
          if (expectedPackageCount === 0) {
            expectedPackageCount = fetchedOrders.length
          }

          const pickupDetails = normalizeDetails(fetchedOrders[0]?.pickup_details)
          const pickupLocationName = String(pickupDetails?.warehouse_name || '').trim()
          if (!pickupLocationName) {
            throw new Error('Pickup warehouse name is required to create Delhivery pickup request')
          }
          const isManifestRetry = fetchedOrders.some(
            (order) => String(order.order_status || '').toLowerCase() === 'manifest_failed',
          )
          const pickupDateRaw =
            pickupDetails?.pickup_date || fetchedOrders[0]?.order_date || new Date().toISOString()
          const pickupDate = normalizePickupDateForRetry(pickupDateRaw, isManifestRetry)
          const pickupTimeRaw = String(pickupDetails?.pickup_time || '11:00:00').trim()
          const pickupTime = /^\d{2}:\d{2}:\d{2}$/.test(pickupTimeRaw)
            ? pickupTimeRaw
            : /^\d{2}:\d{2}$/.test(pickupTimeRaw)
              ? `${pickupTimeRaw}:00`
              : '11:00:00'

          if (isManifestRetry) {
            console.log('ℹ️ Delhivery manifest retry pickup schedule adjusted', {
              order_number: fetchedOrders[0]?.order_number,
              requested_pickup_date: String(pickupDateRaw).slice(0, 10) || null,
              final_pickup_date: pickupDate,
            })
          }

          for (const order of fetchedOrders) {
            await debitManifestSuccessChargeIfNeeded({ tx, order })
          }

          await delhivery.createPickupRequest({
            pickup_date: pickupDate,
            pickup_time: pickupTime,
            pickup_location: pickupLocationName,
            expected_package_count: expectedPackageCount,
          })

          const createManifestCard = (order: any) => ({
            width: '48%',
            margin: [0, 0, 0, 12],
            stack: [
              {
                canvas: [
                  {
                    type: 'rect',
                    x: 0,
                    y: 0,
                    w: 245,
                    h: 118,
                    r: 8,
                    lineColor: '#d8deee',
                    fillColor: '#fbfcff',
                    lineWidth: 1,
                  },
                ],
              },
              {
                margin: [12, -108, 12, 0],
                stack: [
                  {
                    columns: [
                      {
                        text: order.order_number ?? '-',
                        bold: true,
                        fontSize: 11,
                        color: '#1f2a44',
                      },
                      {
                        text: (order.order_type ?? '').toUpperCase() || '-',
                        fontSize: 8,
                        bold: true,
                        color: '#4c67a1',
                        alignment: 'right',
                      },
                    ],
                  },
                  {
                    text: `AWB: ${order.awb_number ?? '-'}`,
                    fontSize: 9,
                    color: '#42506b',
                    margin: [0, 6, 0, 0],
                  },
                  {
                    text: `Consignee: ${order.buyer_name ?? '-'}`,
                    fontSize: 9,
                    color: '#42506b',
                    margin: [0, 4, 0, 0],
                  },
                  {
                    columns: [
                      {
                        text: `Pincode: ${order.pincode ?? '-'}`,
                        fontSize: 9,
                        color: '#42506b',
                      },
                      {
                        text: `Weight: ${Number(order.weight ?? 0).toFixed(0)} g`,
                        fontSize: 9,
                        color: '#42506b',
                        alignment: 'right',
                      },
                    ],
                    margin: [0, 4, 0, 0],
                  },
                  {
                    text: `City: ${order.city ?? '-'}${order.state ? `, ${order.state}` : ''}`,
                    fontSize: 9,
                    color: '#42506b',
                    margin: [0, 4, 0, 0],
                  },
                  {
                    text: `Address: ${order.address ?? '-'}`,
                    fontSize: 8,
                    color: '#667085',
                    margin: [0, 8, 0, 0],
                  },
                ],
              },
            ],
          })

          const manifestCards = fetchedOrders.reduce((rows: any[], order, index) => {
            if (index % 2 === 0) {
              rows.push({
                columns: [
                  createManifestCard(order),
                  fetchedOrders[index + 1]
                    ? createManifestCard(fetchedOrders[index + 1])
                    : { width: '48%', text: '' },
                ],
                columnGap: 12,
              })
            }
            return rows
          }, [])

          const printer = new PdfPrinter(pdfFonts)
          const docDefinition: any = {
            defaultStyle: { font: 'Helvetica' },
            pageSize: 'A4',
            pageMargins: [30, 40, 30, 40],
            content: [
              {
                text: 'Manifest',
                fontSize: 16,
                bold: true,
                alignment: 'center',
                margin: [0, 0, 0, 10],
              },
              {
                columns: [
                  {
                    stack: [
                      { text: `Generated On: ${new Date().toLocaleString()}`, fontSize: 9 },
                      {
                        text: `Total Shipments: ${fetchedOrders.length}`,
                        fontSize: 9,
                        margin: [0, 4, 0, 0],
                      },
                    ],
                  },
                  {
                    stack: [
                      {
                        text: `User ID: ${fetchedOrders[0].user_id}`,
                        fontSize: 9,
                        alignment: 'right',
                      },
                      {
                        text: `Pickup Location: ${pickupDetails?.warehouse_name ?? '-'}`,
                        fontSize: 9,
                        alignment: 'right',
                        margin: [0, 4, 0, 0],
                      },
                    ],
                  },
                ],
                margin: [0, 0, 0, 12],
              },
              {
                text: 'Shipments',
                fontSize: 11,
                bold: true,
                color: '#24324d',
                margin: [0, 0, 0, 10],
              },
              ...manifestCards,
            ],
          }

          const pdfDoc = printer.createPdfKitDocument(docDefinition)
          const chunks: Buffer[] = []
          const pdfBuffer = await new Promise<Buffer>((resolve, reject) => {
            pdfDoc.on('data', (chunk) => chunks.push(chunk))
            pdfDoc.on('end', () => resolve(Buffer.concat(chunks)))
            pdfDoc.on('error', (err) => reject(err))
            pdfDoc.end()
          })

          const { uploadUrl, key } = await presignUpload({
            filename: `manifest-delhivery-${Date.now()}.pdf`,
            contentType: 'application/pdf',
            userId: fetchedOrders[0].user_id,
            folderKey: 'manifests',
          })
          const putUrl = Array.isArray(uploadUrl) ? uploadUrl[0] : uploadUrl
          await axios.put(putUrl, pdfBuffer, {
            headers: { 'Content-Type': 'application/pdf' },
            timeout: 60000, // 60 seconds for manifest upload
          })
          const manifestKey = Array.isArray(key) ? key[0] : key

          // Generate invoices in parallel (non-blocking) to avoid timeouts
          const invoicePromisesDel = fetchedOrders.map((order) =>
            generateInvoiceForOrder(order).catch((err) => {
              console.error(
                `❌ [Manifest] Invoice generation failed for order ${order.order_number}:`,
                err?.message || err,
              )
              return null
            }),
          )

          // Process orders (labels first, then update) - don't wait for invoices
          const orderUpdatePromisesDel = fetchedOrders.map(async (order) => {
            // 🖨️ Generate label if it doesn't exist and order has AWB
            // Fetch fresh order data to avoid race conditions
            const [freshOrder] = await tx.select().from(table).where(eq(table.id, order.id))
            if (!freshOrder) {
              console.warn(
                `⚠️ Order ${order.order_number} not found in database, skipping label generation`,
              )
              return
            }

            const currentLabel = freshOrder.label || null
            const currentAwb = freshOrder.awb_number || null

            console.log(`🔍 Checking label generation for order ${order.order_number}:`, {
              order_id: order.id,
              has_label: !!currentLabel,
              label_value: currentLabel,
              has_awb: !!currentAwb,
              awb_value: currentAwb,
            })

            let labelKey: string | null = currentLabel
            if (!labelKey && currentAwb) {
              try {
                console.log(
                  `🖨️ [Delhivery] Generating custom label during manifest for order ${order.order_number} (AWB: ${currentAwb})`,
                )

                // Fetch Delhivery packing_slip JSON (pdf=false) to enrich our custom label
                let enrichedOrder: any = freshOrder
                try {
                  const delhivery = new DelhiveryService()
                  const labelResp: any = await delhivery.generateLabel(currentAwb)

                  const pkg = Array.isArray(labelResp?.packages)
                    ? labelResp.packages[0]
                    : labelResp?.packages || labelResp

                  if (pkg) {
                    // Capture sort_code from Delhivery label metadata
                    const sortCode =
                      (pkg.sort_code || pkg.sortCode || pkg.routing_code || pkg.routingCode) ?? null

                    enrichedOrder = {
                      ...freshOrder,
                      // Provider barcodes (data:image/png;base64,...) used by custom label generator
                      barcode_img: pkg.barcode || null,
                      oid_barcode: pkg.oid_barcode || null,
                      // Sort code from courier label API (use existing sort_code from order if available, otherwise from label metadata)
                      sort_code: sortCode || (freshOrder as any).sort_code || null,
                      // Keep raw meta if needed later
                      delhivery_label_meta: pkg,
                    }
                  }
                } catch (metaErr: any) {
                  console.warn(
                    `⚠️ [Delhivery] Failed to fetch packing_slip JSON for order ${order.order_number}:`,
                    metaErr?.message || metaErr,
                  )
                }

                // Always generate our own custom label PDF
                labelKey = await generateLabelForOrder(enrichedOrder, enrichedOrder.user_id, tx)

                if (!labelKey) {
                  console.warn(
                    `⚠️ [Delhivery] Custom label generation returned null for order ${order.order_number} during manifest`,
                  )
                } else {
                  console.log(
                    `✅ [Delhivery] Custom label generated for order ${order.order_number} during manifest: ${labelKey}`,
                  )
                }

                // Best-effort: trigger Delhivery packing slip PDF generation as well.
                // This keeps provider-side label state in sync even when we print custom labels.
                try {
                  const delhivery = new DelhiveryService()
                  const providerLabelPdf = await delhivery.generateLabel(currentAwb, {
                    format: 'pdf',
                  })
                  console.log(
                    `✅ [Delhivery] Provider label PDF fetched for AWB ${currentAwb} (${providerLabelPdf?.length || 0} bytes)`,
                  )
                } catch (providerLabelErr: any) {
                  console.warn(
                    `⚠️ [Delhivery] Failed to fetch provider label PDF for AWB ${currentAwb}:`,
                    providerLabelErr?.message || providerLabelErr,
                  )
                }
              } catch (labelErr: any) {
                console.error(
                  `❌ [Delhivery] Failed to generate custom label for order ${order.order_number} during manifest:`,
                  labelErr?.message || labelErr,
                  labelErr?.stack,
                )
                // Don't throw - continue with manifest generation even if label fails
              }
            } else if (!labelKey) {
              console.warn(
                `⚠️ Cannot generate label for order ${order.order_number}: AWB number is missing (AWB: ${currentAwb})`,
              )
            } else {
              console.log(
                `ℹ️ Label already exists for order ${order.order_number}: ${currentLabel}`,
              )
            }

            // Update order with manifest and label first (invoice will be updated separately)
            const updateDataDel: any = {
              manifest: manifestKey,
              manifest_error: null,
              order_status: 'pickup_initiated',
              updated_at: new Date(),
            }

            // Only set label if it was generated and is valid
            // Ensure we store R2 key, not a full URL
            if (labelKey && typeof labelKey === 'string' && labelKey.trim().length > 0) {
              const normalizedLabel = normalizeToR2Key(labelKey.trim())
              if (normalizedLabel) {
                updateDataDel.label = normalizedLabel
                console.log(`✅ [Delhivery] Normalized label key stored: ${normalizedLabel}`)
              } else {
                console.warn(
                  `⚠️ [Delhivery] Could not normalize label, skipping: ${labelKey.trim()}`,
                )
              }
            } else if (
              currentLabel &&
              typeof currentLabel === 'string' &&
              currentLabel.trim().length > 0
            ) {
              // Preserve existing label if new one wasn't generated, but normalize it
              const normalizedLabel = normalizeToR2Key(currentLabel.trim())
              if (normalizedLabel) {
                updateDataDel.label = normalizedLabel
              }
            }

            await tx.update(table).set(updateDataDel).where(eq(table.id, order.id))
          })

          // Wait for order updates to complete
          await Promise.all(orderUpdatePromisesDel)

          // Update invoices in background (fire-and-forget, but wait a bit for initial completion)
          Promise.allSettled(invoicePromisesDel).then((results) => {
            results.forEach((result, index) => {
              const order = fetchedOrders[index]
            if (result.status === 'fulfilled' && result.value) {
              // Validate and update invoice_link in database (use db, not tx, since this runs after transaction)
              // Ensure we store R2 key, not a full URL
              const invoiceResult = result.value as {
                key: string
                invoiceNumber?: string
                invoiceDate?: string
                invoiceAmount?: number
              }
              const invoiceKey = invoiceResult.key
              if (invoiceKey && typeof invoiceKey === 'string' && invoiceKey.trim().length > 0) {
                const normalizedInvoiceKey = normalizeToR2Key(invoiceKey.trim())
                if (normalizedInvoiceKey) {
                  db.update(table)
                      .set({
                        invoice_link: normalizedInvoiceKey,
                        invoice_number: invoiceResult.invoiceNumber ?? undefined,
                        invoice_date: invoiceResult.invoiceDate ?? undefined,
                        invoice_amount:
                          invoiceResult.invoiceAmount !== undefined ? invoiceResult.invoiceAmount : undefined,
                        updated_at: new Date(),
                      })
                    .where(eq(table.id, order.id))
                      .then(() => {
                        console.log(
                          `✅ [Manifest] Invoice link updated for order ${order.order_number}: ${normalizedInvoiceKey}`,
                        )
                      })
                      .catch((err) => {
                        console.error(
                          `❌ [Manifest] Failed to update invoice_link for order ${order.order_number}:`,
                          err?.message || err,
                        )
                      })
                  } else {
                    console.warn(
                      `⚠️ [Manifest] Could not normalize invoice key for order ${
                        order.order_number
                      }: ${invoiceKey.trim()}`,
                    )
                  }
                } else {
                  console.warn(
                    `⚠️ [Manifest] Invoice generation failed for order ${order.order_number}: Invalid key`,
                  )
                }
              } else {
                console.warn(
                  `⚠️ [Manifest] Invoice generation failed for order ${order.order_number}`,
                )
              }
            })
          })

          const manifestDownloadUrl = await resolveManifestUrl(manifestKey)

          return {
            manifest_id: manifestKey,
            manifest_url: manifestDownloadUrl,
            manifest_key: manifestKey,
          }
        }

        for (const awb of params.awbs) {
          let order: any = orders.find((o) => o.awb_number === awb)
          if (!order) {
            const [fetched] = await tx.select().from(table).where(eq(table.awb_number, awb))
            order = fetched
          }
          if (!order) continue

          const [prefs] = await tx
            .select()
            .from(invoicePreferences)
            .where(eq(invoicePreferences.userId, order.user_id))

          // 🔹 Fetch user profile for company details
          const [user] = await tx
            .select({
              companyName: sql<string>`(${userProfiles.companyInfo} ->> 'brandName')`,
              companyGST: sql<string>`(${userProfiles.companyInfo} ->> 'companyGst')`,
              supportEmail: sql<string>`(${userProfiles.companyInfo} ->> 'companyEmail')`,
              brandName: sql<string>`(${userProfiles.companyInfo} ->> 'brandName')`,
              supportPhone: sql<string>`(${userProfiles.companyInfo} ->> 'companyContactNumber')`,
              companyLogo: sql<string>`(${userProfiles.companyInfo} ->> 'companyLogoUrl')`,
              companyAddress: sql<string>`(${userProfiles.companyInfo} ->> 'companyAddress')`,
              companyState: sql<string>`(${userProfiles.companyInfo} ->> 'state')`,
              panNumber: sql<string>`(${userProfiles.companyInfo} ->> 'panNumber')`,
            })
            .from(userProfiles)
            .where(eq(userProfiles.userId, order.user_id))

          const pickupDetails = normalizePickupDetails(order.pickup_details)
          const pickupPincode = pickupDetails?.pincode
          const { logoBuffer, signatureBuffer } = await loadInvoiceAssets(
            {
              companyLogoKey: user?.companyLogo ?? undefined,
              includeSignature: prefs?.includeSignature,
              signatureFile: prefs?.signatureFile ?? undefined,
            },
            order.order_number || String(order.id),
          )

          const serviceType =
            (order as any).service_type || order.integration_type || order.courier_partner || ''

          const invoiceNumber = await resolveInvoiceNumber({
            userId: order.user_id,
            existingInvoiceNumber: (order as any)?.invoice_number,
            prefix: prefs?.prefix ?? undefined,
            suffix: prefs?.suffix ?? undefined,
          })
          const invoiceDateDisplay = dayjs().format('DD MMM YYYY')
          const invoiceDateStored = dayjs().format('YYYY-MM-DD')

          const pickupAddress = formatPickupAddress(pickupDetails)
          const sellerAddress = pickupAddress || user?.companyAddress || ''
          const sellerStateCode = pickupDetails?.state || user?.companyState || ''
          const sellerName =
            pickupDetails?.warehouse_name ||
            user?.companyName ||
            user?.brandName ||
            'Seller'
          const brandName =
            user?.brandName ||
            user?.companyName ||
            pickupDetails?.warehouse_name ||
            ''
          const gstNumber = user?.companyGST || ''
          const panNumber = user?.panNumber || ''
          const supportPhone = pickupDetails?.phone || user?.supportPhone || ''
          const supportEmail = user?.supportEmail || prefs?.supportEmail || ''

          // ✅ COD-safe invoice amount
          const invoiceAmount =
            Number(order.order_amount ?? 0) +
            Number(order.shipping_charges ?? 0) +
            Number(order.gift_wrap ?? 0) +
            Number(order.transaction_fee ?? 0) -
            (Number(order.discount ?? 0) + Number(order.prepaid_amount ?? 0))

          // Generate invoice PDF
          const invoiceBuffer = await generateInvoicePDF({
            invoiceNumber,
            invoiceDate: invoiceDateDisplay,
            invoiceAmount,
            buyerName: order.buyer_name,
            buyerPhone: order.buyer_phone,
            buyerEmail: order.buyer_email ?? '',
            buyerAddress: order.address,
            buyerCity: order.city,
            buyerState: order.state,
            buyerPincode: order.pincode,
            products: order.products as Product[],
            shippingCharges: Number(order.shipping_charges) ?? 0,
            giftWrap: Number(order.gift_wrap) ?? 0,
            transactionFee: Number(order.transaction_fee) ?? 0,
            discount: Number(order.discount) ?? 0,
            prepaidAmount: Number(order.prepaid_amount) ?? 0,
            courierName: order.courier_partner ?? '',
            courierId: order.courier_id?.toString() ?? '',
            logoBuffer,
            orderType: order?.order_type as 'prepaid' | 'cod',
            courierCod: order?.order_type === 'cod' ? Number(order?.cod_charges ?? 0) : 0,
            signatureBuffer,
            companyName: sellerName,
            supportEmail,
            supportPhone,
            companyGST: gstNumber,
            sellerName,
            brandName,
            sellerAddress,
            sellerStateCode,
            gstNumber,
            panNumber,
            invoiceNotes: prefs?.invoiceNotes ?? '',
            termsAndConditions: prefs?.termsAndConditions ?? '',
            orderId: order.order_number,
            awbNumber: order.awb_number ?? '',
            courierPartner: order.courier_partner ?? '',
            serviceType,
            pickupPincode: pickupPincode ?? '',
            deliveryPincode: order.pincode ?? '',
            orderDate: order.order_date ?? '',
              rtoCharges: Number((order as any).rto_charges ?? 0),
            layout: (prefs?.template as 'classic' | 'thermal') ?? 'classic',
          })

          // Upload invoice to S3
          const { uploadUrl, key } = await presignUpload({
            filename: `invoice-${order.id}.pdf`,
            contentType: 'application/pdf',
            userId: order.user_id,
            folderKey: 'invoices',
          })
          await axios.put(Array.isArray(uploadUrl) ? uploadUrl[0] : uploadUrl, invoiceBuffer, {
            headers: { 'Content-Type': 'application/pdf' },
            timeout: 60000, // 60 seconds for invoice upload
          })
          const finalKey = Array.isArray(key) ? key[0] : key

          // Validate key is not empty and is a string
          if (!finalKey || typeof finalKey !== 'string' || finalKey.trim().length === 0) {
            throw new Error('Invoice key is invalid or empty after upload')
          }

          // Ensure we store only the R2 key (not a URL), even if Cloudflare returns it in URL format
          const trimmedKey = finalKey.trim()
          const normalizedInvoiceKey = normalizeToR2Key(trimmedKey) || trimmedKey

          // If normalization failed but it's not a URL, use the original key
          // (normalizeToR2Key returns null for external URLs, but our key should be valid)
          const keyToStore =
            normalizedInvoiceKey || (trimmedKey.startsWith('http') ? null : trimmedKey)

          if (!keyToStore) {
            throw new Error(`Invalid invoice key format: ${trimmedKey}`)
          }

          console.log(`📄 Invoice generated and uploaded for order ${order.order_number}:`, {
            invoice_key: keyToStore,
            upload_url: Array.isArray(uploadUrl) ? uploadUrl[0] : uploadUrl,
            invoice_size: invoiceBuffer.length,
          })

          // Update order with manifest + invoice (local manifest only)
          // Ensure we store R2 key, not a full URL
          await tx
            .update(table)
            .set({
              invoice_link: keyToStore,
              invoice_number: invoiceNumber,
              invoice_date: invoiceDateStored,
              invoice_amount: invoiceAmount,
              order_status: 'pickup_initiated',
              updated_at: new Date(),
            })
            .where(eq(table.id, order.id))

          console.log(
            `✅ Invoice link saved to database for order ${order.order_number}: ${finalKey}`,
          )

          // 🖨️ Generate label if it doesn't exist and order has AWB
          if (!order.label && order.awb_number) {
            try {
              console.log(
                `🖨️ Generating label for order ${order.order_number} during manifest (AWB: ${order.awb_number})`,
              )
              const labelKey = await generateLabelForOrder(order, order.user_id, tx)

              // Validate and save label if generated
              // Ensure we store R2 key, not a full URL
              if (labelKey && typeof labelKey === 'string' && labelKey.trim().length > 0) {
                const normalizedLabelKey = normalizeToR2Key(labelKey.trim())
                if (normalizedLabelKey) {
                  await tx
                    .update(table)
                    .set({
                      label: normalizedLabelKey,
                      updated_at: new Date(),
                    })
                    .where(eq(table.id, order.id))

                  console.log(
                    `✅ Label generated and saved for order ${order.order_number} during manifest: ${normalizedLabelKey}`,
                  )
                } else {
                  console.warn(
                    `⚠️ Could not normalize label key for order ${
                      order.order_number
                    }: ${labelKey.trim()}`,
                  )
                }
              } else {
                console.warn(
                  `⚠️ Label generation returned invalid value for order ${order.order_number} during manifest`,
                )
              }
            } catch (labelErr: any) {
              console.error(
                `❌ Failed to generate label for order ${order.order_number} during manifest:`,
                labelErr?.message || labelErr,
              )
              // Don't throw - continue with manifest generation even if label fails
            }
          } else if (!order.label) {
            console.warn(
              `⚠️ Cannot generate label for order ${order.order_number}: AWB number is missing`,
            )
          } else if (order.label) {
            // Ensure existing label is preserved and properly formatted
            const existingLabel = order.label
            if (typeof existingLabel === 'string' && existingLabel.trim().length > 0) {
              await tx
                .update(table)
                .set({
                  label: existingLabel.trim(),
                  updated_at: new Date(),
                })
                .where(eq(table.id, order.id))
            }
          } else {
            console.log(`ℹ️ Label already exists for order ${order.order_number}: ${order.label}`)
          }
        }

        // When using local manifest generation, just resolve and return a pseudo key as manifest info.
        const manifestKey = `manifest-invoice`
        const manifestDownloadUrl = await resolveManifestUrl(manifestKey)

        return {
          manifest_id: manifestKey,
          manifest_url: manifestDownloadUrl,
          manifest_key: manifestKey,
        }
      } catch (error: any) {
        console.error('Generate manifest error:', error)
        if (manifestFailureOrderIds.length > 0) {
          const manifestErrorMessage = getUserFacingManifestError(error)
          await Promise.allSettled(
            manifestFailureOrderIds.map((orderId) =>
              refundManifestFailureChargeOnce({
                orderId,
                manifestErrorMessage,
              }),
            ),
          )
        }
        if (error instanceof HttpError) {
          throw error
        }
        throw new HttpError(
          getErrorStatusCode(error, 500),
          getUserFacingManifestError(error),
        )
      }
    },
  )
}

export const retryFailedManifestService = async (
  orderId: string,
  userId: string,
): Promise<{
  manifest_id: string | null
  manifest_url: string | null
  manifest_key: string | null
  retry_count: number
  retries_remaining: number
  order_status: string | null
}> => {
  const [order] = await db
    .select({
      id: b2c_orders.id,
      user_id: b2c_orders.user_id,
      order_number: b2c_orders.order_number,
      awb_number: b2c_orders.awb_number,
      order_status: b2c_orders.order_status,
      integration_type: b2c_orders.integration_type,
      manifest_retry_count: b2c_orders.manifest_retry_count,
      manifest_error: b2c_orders.manifest_error,
    })
    .from(b2c_orders)
    .where(and(eq(b2c_orders.id, orderId), eq(b2c_orders.user_id, userId)))
    .limit(1)

  if (!order) {
    throw new HttpError(404, 'Order not found.')
  }

  const provider = String(order.integration_type || '').trim().toLowerCase()
  if (provider !== 'delhivery') {
    throw new HttpError(
      400,
      'Manifest retry is currently supported only for Delhivery failed orders.',
    )
  }

  if (String(order.order_status || '').trim().toLowerCase() !== 'manifest_failed') {
    throw new HttpError(400, 'Only orders with manifest_failed status can be retried.')
  }

  if (order.awb_number) {
    throw new HttpError(
      400,
      'This order already has an AWB. Use the normal manifest flow instead of retrying it as failed.',
    )
  }

  const currentRetryCount = Number(order.manifest_retry_count ?? 0)
  if (currentRetryCount >= MAX_MANIFEST_RETRY_ATTEMPTS) {
    throw new HttpError(
      409,
      `Manifest retry limit reached for order ${order.order_number}. You can retry a failed manifest only ${MAX_MANIFEST_RETRY_ATTEMPTS} times.`,
    )
  }

  const nextRetryCount = currentRetryCount + 1
  await db
    .update(b2c_orders)
    .set({
      manifest_retry_count: nextRetryCount,
      manifest_last_retry_at: new Date(),
      updated_at: new Date(),
    })
    .where(eq(b2c_orders.id, order.id))

  try {
    const manifestResult = await generateManifestService({
      awbs: [order.order_number],
      type: 'b2c',
      userId,
    })

    await db
      .update(b2c_orders)
      .set({
        manifest_error: null,
        updated_at: new Date(),
      })
      .where(eq(b2c_orders.id, order.id))

    const [updatedOrder] = await db
      .select({
        order_status: b2c_orders.order_status,
        manifest_retry_count: b2c_orders.manifest_retry_count,
      })
      .from(b2c_orders)
      .where(eq(b2c_orders.id, order.id))
      .limit(1)

    const retryCount = Number(updatedOrder?.manifest_retry_count ?? nextRetryCount)

    return {
      ...manifestResult,
      retry_count: retryCount,
      retries_remaining: Math.max(0, MAX_MANIFEST_RETRY_ATTEMPTS - retryCount),
      order_status: updatedOrder?.order_status ?? null,
    }
  } catch (error: any) {
    const manifestErrorMessage = getUserFacingManifestError(error)

    await db
      .update(b2c_orders)
      .set({
        order_status: 'manifest_failed',
        manifest_error: truncateColumnValue(manifestErrorMessage),
        updated_at: new Date(),
      })
      .where(eq(b2c_orders.id, order.id))

    throw new HttpError(getErrorStatusCode(error, 500), manifestErrorMessage)
  }
}

// export const generateAndSaveManifestService = async (params: GenerateManifestParams) => {
//   console.log('PARAMS!!!', params)
//   const { awbs } = params

//   if (!awbs || awbs?.length === 0) {
//     throw new Error('No AWBs provided')
//   }

//   try {
//     const result = await db.transaction(async (tx) => {
//       // 1️⃣ Generate manifest
//       const manifestData = await generateManifestService({ awbs })

//       // 2️⃣ Update all local orders with manifest_id
//       // const updatedOrders = await Promise.all(
//       //   awbs.map(async (awb) => {
//       //     const [updated] = await tx
//       //       .update(b2c_orders)
//       //       .set({
//       //         manifest: manifestData.manifest_id,
//       //         order_status: 'pickup_scheduled', // optional: move status to next step
//       //         updated_at: new Date(),
//       //       })
//       //       .where(eq(b2c_orders.awb_number, awb))
//       //       .returning({ id: b2c_orders.id, awb_number: b2c_orders.awb_number })

//       //     return updated
//       //   }),
//       // )

//       return {
//         // manifestData,
//         // updatedOrders,
//       }
//     })

//     console.log('Manifest generated and orders updated:', result)
//     return result
//   } catch (error: any) {
//     console.error('Error generating or saving manifest:', error.message)
//     throw new Error(`Failed to generate/save manifest: ${error.message}`)
//   }
// }

export interface PaginationParams {
  page?: number
  limit?: number
}

export interface IOrderFilters {
  status?: string
  fromDate?: string
  toDate?: string
  search?: string
  userId?: string
  sortBy?: 'created_at'
  sortOrder?: 'asc' | 'desc'
}
export const getAllOrdersService = async (
  userId: string,
  {
    page = 1,
    limit = 10,
    filters = {} as IOrderFilters,
  }: PaginationParams & { filters?: IOrderFilters },
) => {
  const offset = (page - 1) * limit

  // Fetch B2C orders
  const b2cOrdersRaw = await db.select().from(b2c_orders).where(eq(b2c_orders.user_id, userId))

  const b2cOrders = (b2cOrdersRaw ?? []).map((o) => ({ ...o, type: 'b2c' }))

  // Fetch B2B orders
  const b2bOrdersRaw = await db.select().from(b2b_orders).where(eq(b2b_orders.user_id, userId))

  const b2bOrders = (b2bOrdersRaw ?? []).map((o) => ({ ...o, type: 'b2b' }))

  // Combine
  let combinedOrders = [...b2cOrders, ...b2bOrders]

  // ✅ Apply filters safely
  if (filters.status) {
    combinedOrders = combinedOrders.filter((o) => o.order_status === filters.status)
  }

  if (filters.fromDate) {
    combinedOrders = combinedOrders.filter((o) =>
      o.created_at ? new Date(o.created_at) >= new Date(filters.fromDate!) : false,
    )
  }

  if (filters.toDate) {
    combinedOrders = combinedOrders.filter((o) =>
      o.created_at ? new Date(o.created_at) <= new Date(filters.toDate!) : false,
    )
  }

  if (filters.search) {
    const keyword = filters.search.toLowerCase()
    combinedOrders = combinedOrders.filter((o) => {
      return (
        o.order_number?.toLowerCase().includes(keyword) ||
        o.buyer_name?.toLowerCase().includes(keyword) ||
        o.buyer_phone?.includes(keyword) ||
        o.awb_number?.includes(keyword)
      )
    })
  }

  // ✅ Sort safely
  combinedOrders.sort((a, b) => {
    const timeA = a.created_at ? new Date(a.created_at).getTime() : 0
    const timeB = b.created_at ? new Date(b.created_at).getTime() : 0
    return timeB - timeA
  })

  // Counts
  const totalCount = combinedOrders.length
  if (totalCount === 0) {
    return {
      orders: [],
      totalCount: 0,
      totalPages: 0,
    }
  }

  const totalPages = Math.ceil(totalCount / limit)
  const paginatedOrders = combinedOrders.slice(offset, offset + limit)

  // Sanitize orders - remove internal platform fields (courier_cost)
  const { sanitizeOrdersForCustomer } = await import('../../utils/orderSanitizer')
  const sanitizedOrders = await sanitizeOrdersForCustomer(paginatedOrders)

  return {
    orders: sanitizedOrders,
    totalCount,
    totalPages,
  }
}

type TrackingHistoryItem = {
  status_code: string
  location: string
  event_time: string
  message: string
}

interface TrackingServiceResponse {
  id: string
  order_id: string | null
  order_number: string
  awb_number: string
  courier_name: string
  status: string
  edd: string | null
  history: TrackingHistoryItem[]
  payment_type: string
  shipment_info: string | null
}

type ProviderNormalizedTracking = {
  history: TrackingHistoryItem[]
  status?: string
  edd?: string | null
  courier_name?: string | null
  shipment_info?: string | null
}

type OrderSummary = {
  id: string
  order_id: string | null
  order_number: string
  integration_type: string | null
  courier_partner: string | null
  courier_id: number | null
  awb_number: string
  order_status: string | null
  edd: string | null
  order_type: string | null
  shipment_id: string | null
  delivery_message: string | null
  created_at: Date | null
  updated_at: Date | null
}

const sanitizeString = (value: unknown, fallback = ''): string => {
  if (value === null || value === undefined) return fallback
  const str = String(value).trim()
  return str || fallback
}

const toIsoString = (value: unknown, fallback?: string): string => {
  if (value) {
    const date = value instanceof Date ? value : new Date(value as string)
    if (!Number.isNaN(date.getTime())) {
      return date.toISOString()
    }
  }
  if (fallback) return fallback
  return new Date().toISOString()
}

const pushHistoryEvent = (
  history: TrackingHistoryItem[],
  params: { statusCode?: unknown; message?: unknown; location?: unknown; time?: unknown },
  fallbackTime?: string,
) => {
  const statusCodeCandidate = sanitizeString(params.statusCode)
  const messageCandidate = sanitizeString(params.message)
  const message = messageCandidate || statusCodeCandidate || 'Status Update'
  const statusCode = statusCodeCandidate || message
  history.push({
    status_code: statusCode,
    location: sanitizeString(params.location),
    event_time: toIsoString(params.time, fallbackTime),
    message,
  })
}

const sortHistoryDescending = (history: TrackingHistoryItem[]) => {
  history.sort((a, b) => new Date(b.event_time).getTime() - new Date(a.event_time).getTime())
}

const mapDelhiveryTracking = (raw: any, order: OrderSummary): ProviderNormalizedTracking => {
  const history: TrackingHistoryItem[] = []
  const shipmentWrapper = Array.isArray(raw?.ShipmentData)
    ? raw?.ShipmentData?.[0]
    : (raw?.ShipmentData ?? raw)
  const shipment = shipmentWrapper?.Shipment ?? shipmentWrapper ?? {}
  const statusObj = shipment?.Status ?? shipment?.status ?? {}

  const scans = shipment?.Scans
  if (Array.isArray(scans)) {
    scans.forEach((scanEntry: any) => {
      const detail = scanEntry?.ScanDetail ?? scanEntry
      if (detail) {
        pushHistoryEvent(history, {
          statusCode: detail?.ScanType ?? detail?.StatusCode ?? detail?.Status,
          message: detail?.ScanStatus ?? detail?.Status ?? detail?.Instructions ?? detail?.Remarks,
          location: detail?.ScanLocation ?? detail?.Location,
          time: detail?.ScanDateTime ?? detail?.ScanDate ?? detail?.ScanTime,
        })
      }
    })
  } else if (scans?.ScanDetail) {
    const scanDetails = Array.isArray(scans.ScanDetail) ? scans.ScanDetail : [scans.ScanDetail]
    scanDetails.forEach((detail: any) => {
      pushHistoryEvent(history, {
        statusCode: detail?.ScanType ?? detail?.StatusCode ?? detail?.Status,
        message: detail?.ScanStatus ?? detail?.Status ?? detail?.Instructions ?? detail?.Remarks,
        location: detail?.ScanLocation ?? detail?.Location,
        time: detail?.ScanDateTime ?? detail?.ScanDate ?? detail?.ScanTime,
      })
    })
  }

  if (Object.keys(statusObj).length) {
    pushHistoryEvent(history, {
      statusCode: statusObj?.StatusCode ?? statusObj?.Status,
      message: statusObj?.Status ?? statusObj?.StatusType ?? statusObj?.StatusAction,
      location: statusObj?.StatusLocation ?? statusObj?.StatusLocationName,
      time: statusObj?.StatusDateTime ?? statusObj?.StatusDate,
    })
  }

  const status = sanitizeString(
    statusObj?.Status ?? history[0]?.message ?? order.order_status,
    order.order_status ?? 'In Transit',
  )

  const eddString = sanitizeString(shipment?.ExpectedDeliveryDate ?? shipment?.EDD ?? '')

  const shipmentInfo = sanitizeString(
    statusObj?.Instructions ?? shipment?.Instructions ?? shipment?.Remarks ?? '',
  )

  return {
    history,
    status,
    edd: eddString || undefined,
    shipment_info: shipmentInfo || undefined,
    courier_name: 'Delhivery',
  }
}

const buildTrackingResponse = (
  order: OrderSummary,
  providerData: ProviderNormalizedTracking,
): TrackingServiceResponse => {
  const history = [...(providerData.history || [])]
  const fallbackTime = toIsoString(order.updated_at ?? order.created_at ?? new Date())

  if (!history.length) {
    pushHistoryEvent(
      history,
      {
        statusCode: order.order_status ?? 'Status Update',
        message: order.order_status ?? 'Status Update',
        location: '',
        time: fallbackTime,
      },
      fallbackTime,
    )
  }

  sortHistoryDescending(history)

  const status = sanitizeString(
    providerData.status ?? history[0]?.message ?? order.order_status,
    'In Transit',
  )

  const courierName = sanitizeString(
    providerData.courier_name ?? order.courier_partner ?? order.integration_type ?? 'Courier',
  )

  const eddValue = providerData.edd ?? (order.edd ? sanitizeString(order.edd) : null)

  const shipmentInfoValue =
    providerData.shipment_info || sanitizeString(order.delivery_message ?? '', '') || null

  return {
    id: order.id,
    order_id: order.order_id ?? order.id,
    order_number: order.order_number,
    awb_number: order.awb_number,
    courier_name: courierName,
    status,
    edd: eddValue || null,
    history,
    payment_type: sanitizeString(order.order_type ?? 'prepaid', 'prepaid').toUpperCase(),
    shipment_info: shipmentInfoValue,
  }
}

const findOrderByAwb = async (awb: string): Promise<OrderSummary | null> => {
  const [b2c] = await db
    .select({
      id: b2c_orders.id,
      order_id: b2c_orders.order_id,
      order_number: b2c_orders.order_number,
      integration_type: b2c_orders.integration_type,
      courier_partner: b2c_orders.courier_partner,
      courier_id: b2c_orders.courier_id,
      awb_number: b2c_orders.awb_number,
      order_status: b2c_orders.order_status,
      edd: b2c_orders.edd,
      order_type: b2c_orders.order_type,
      shipment_id: b2c_orders.shipment_id,
      delivery_message: b2c_orders.delivery_message,
      created_at: b2c_orders.created_at,
      updated_at: b2c_orders.updated_at,
    })
    .from(b2c_orders)
    .where(eq(b2c_orders.awb_number, awb))
    .limit(1)

  if (b2c) {
    return {
      id: b2c.id,
      order_id: b2c.order_id,
      order_number: b2c.order_number,
      integration_type: b2c.integration_type ?? 'delhivery',
      courier_partner: b2c.courier_partner,
      courier_id: b2c.courier_id ? Number(b2c.courier_id) : null,
      awb_number: b2c.awb_number ?? awb,
      order_status: b2c.order_status,
      edd: b2c.edd,
      order_type: b2c.order_type,
      shipment_id: b2c.shipment_id,
      delivery_message: b2c.delivery_message,
      created_at: b2c.created_at,
      updated_at: b2c.updated_at,
    }
  }

  const [b2b] = await db
    .select({
      id: b2b_orders.id,
      order_id: b2b_orders.order_id,
      order_number: b2b_orders.order_number,
      courier_partner: b2b_orders.courier_partner,
      courier_id: b2b_orders.courier_id,
      awb_number: b2b_orders.awb_number,
      order_status: b2b_orders.order_status,
      order_type: b2b_orders.order_type,
      shipment_id: b2b_orders.shipment_id,
      delivery_message: b2b_orders.delivery_message,
      created_at: b2b_orders.created_at,
      updated_at: b2b_orders.updated_at,
    })
    .from(b2b_orders)
    .where(eq(b2b_orders.awb_number, awb))
    .limit(1)

  if (b2b) {
    return {
      id: b2b.id,
      order_id: b2b.order_id,
      order_number: b2b.order_number,
      integration_type: 'delhivery',
      courier_partner: b2b.courier_partner,
      courier_id: b2b.courier_id ? Number(b2b.courier_id) : null,
      awb_number: b2b.awb_number ?? awb,
      order_status: b2b.order_status,
      edd: null,
      order_type: b2b.order_type,
      shipment_id: b2b.shipment_id,
      delivery_message: b2b.delivery_message,
      created_at: b2b.created_at,
      updated_at: b2b.updated_at,
    }
  }

  return null
}

export const trackByAwbService = async (awb: string): Promise<TrackingServiceResponse> => {
  if (!awb) throw new HttpError(400, 'AWB number is required')

  const order = await findOrderByAwb(awb)
  if (!order) {
    throw new HttpError(404, `No order found for AWB: ${awb}`)
  }

  let providerKey = sanitizeString(order.integration_type ?? 'delhivery').toLowerCase()

  if (!['delhivery'].includes(providerKey) && order.courier_partner) {
    const partner = order.courier_partner.toLowerCase()
    if (partner.includes('delhivery')) providerKey = 'delhivery'
  }

  let providerData: ProviderNormalizedTracking

  try {
    if (providerKey === 'delhivery') {
      const delhiveryService = new DelhiveryService()
      const raw = await delhiveryService.trackShipment(awb)
      providerData = mapDelhiveryTracking(raw, order)
    } else {
      throw new HttpError(400, 'Unsupported integration_type for tracking')
    }
  } catch (err: any) {
    if (err instanceof HttpError) throw err
    const status = err?.status ?? err?.response?.status ?? 500
    const message =
      err?.response?.data?.message ?? err?.message ?? 'Failed to fetch tracking information'
    throw new HttpError(status, message)
  }

  return buildTrackingResponse(order, providerData)
}

export const trackByOrderService = async ({
  orderNumber,
  email,
  phone,
}: {
  orderNumber?: string
  email?: string
  phone?: string
}) => {
  if (!orderNumber || (!email && !phone)) {
    throw new Error('Order number and either email or phone are required')
  }

  // 1️⃣ Find user
  const user = await db
    .select()
    .from(users)
    .where(
      or(email ? eq(users.email, email) : undefined, phone ? eq(users.phone, phone) : undefined),
    )
    .limit(1)

  if (!user[0]) throw new Error('User not found with provided contact details')

  // 2️⃣ Fetch orders for user
  const orders = await getAllOrdersService(user[0].id, { filters: { search: orderNumber } })

  if (orders.totalCount === 0) throw new Error(`No order found with order number: ${orderNumber}`)

  // 3️⃣ Return the first matching order with tracking info
  return orders.orders[0]
}

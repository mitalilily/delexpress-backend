import { and, desc, eq, gte, lte, sql } from 'drizzle-orm'
import {
  b2b_orders,
  b2c_orders,
  users,
  wallets,
  weight_adjustment_history,
  weight_discrepancies,
  weight_disputes,
  weight_reconciliation_settings,
} from '../../schema/schema'
import { db } from '../client'
import { createWalletTransaction } from './wallet.service'
import { sendWeightDiscrepancyEmail } from './weightReconciliationEmail.service'
import { calculateFreight } from './pricing/chargeableFreight'
import { computeB2CFreightForOrder } from './shiprocket.service'

interface CreateDiscrepancyParams {
  orderType: 'b2c' | 'b2b'
  orderId: string
  userId: string
  orderNumber: string
  awbNumber?: string
  courierPartner?: string
  declaredWeight: number
  actualWeight?: number
  volumetricWeight?: number
  chargedWeight: number
  declaredDimensions: { length: number; breadth: number; height: number }
  actualDimensions?: { length: number; breadth: number; height: number }
  originalShippingCharge?: number
  revisedShippingCharge?: number
  courierRemarks?: string
  courierWeightSlipUrl?: string
  courierWeightProofImages?: string[]
  weighingMetadata?: {
    timestamp?: string
    location?: string
    operator?: string
    source?: string
  }
}

/**
 * Create a weight discrepancy record when courier reports different weight
 */
export async function createWeightDiscrepancy(params: CreateDiscrepancyParams) {
  const {
    orderType,
    orderId,
    userId,
    orderNumber,
    awbNumber,
    courierPartner,
    declaredWeight,
    actualWeight,
    volumetricWeight,
    chargedWeight,
    declaredDimensions,
    actualDimensions,
    originalShippingCharge,
    revisedShippingCharge,
    courierRemarks,
    courierWeightSlipUrl,
    courierWeightProofImages,
    weighingMetadata,
  } = params

  // Idempotency guard for webhook retries:
  // if same order is reported with same charged/declaration again, reuse latest discrepancy.
  const orderFilter =
    orderType === 'b2c'
      ? eq(weight_discrepancies.b2c_order_id, orderId)
      : eq(weight_discrepancies.b2b_order_id, orderId)

  const [existingDiscrepancy] = await db
    .select()
    .from(weight_discrepancies)
    .where(
      and(
        eq(weight_discrepancies.order_type, orderType),
        orderFilter,
        eq(weight_discrepancies.charged_weight, chargedWeight.toString()),
        eq(weight_discrepancies.declared_weight, declaredWeight.toString()),
      ),
    )
    .orderBy(desc(weight_discrepancies.created_at))
    .limit(1)

  if (existingDiscrepancy) {
    console.log(
      `ℹ️ Weight discrepancy already exists for order ${orderNumber} (id: ${existingDiscrepancy.id})`,
    )
    return existingDiscrepancy
  }

  // Calculate weight difference
  const weightDifference = Number(chargedWeight) - Number(declaredWeight)

  // Calculate additional charge
  let additionalCharge = 0
  let calculatedRevisedCharge = revisedShippingCharge

  // Fetch existing order to reconstruct slab/base price (B2C only)
  let existingOrder: any = null
  const orderTable = orderType === 'b2c' ? b2c_orders : b2b_orders
  try {
    const [row] = await db
      .select()
      .from(orderTable)
      .where(eq(orderTable.id, orderId))
      .limit(1)
    existingOrder = row || null
  } catch (e) {
    existingOrder = null
  }

  if (!revisedShippingCharge && originalShippingCharge && weightDifference !== 0) {
    if (
      orderType === 'b2c' &&
      existingOrder?.courier_id &&
      existingOrder?.pincode &&
      (existingOrder?.pickup_details?.pincode || existingOrder?.rto_details?.pincode)
    ) {
      const recomputed = await computeB2CFreightForOrder({
        userId,
        courierId: Number(existingOrder.courier_id),
        serviceProvider: existingOrder.integration_type ?? null,
        mode: existingOrder.shipping_mode ?? null,
        selectedMaxSlabWeight: existingOrder.selected_max_slab_weight ?? null,
        destinationPincode: String(existingOrder.pincode),
        originPincode: String(
          existingOrder?.pickup_details?.pincode || existingOrder?.rto_details?.pincode,
        ),
        weightG: chargedWeight,
        lengthCm: Number(existingOrder.length ?? declaredDimensions.length ?? 0),
        breadthCm: Number(existingOrder.breadth ?? declaredDimensions.breadth ?? 0),
        heightCm: Number(existingOrder.height ?? declaredDimensions.height ?? 0),
      })

      calculatedRevisedCharge = recomputed.freight
      additionalCharge = recomputed.freight - Number(originalShippingCharge)
    } else if (orderType === 'b2c' && existingOrder?.charged_slabs) {
      // Legacy fallback for historical orders before slab-range rate cards.
      const slabWeightG =
        Number(existingOrder.charged_weight ?? declaredWeight) /
        Number(existingOrder.charged_slabs || 1)
      const basePricePerSlab =
        Number(existingOrder.freight_charges ?? originalShippingCharge) /
        Number(existingOrder.charged_slabs || 1)

      const freightCalc = calculateFreight({
        actual_weight_g: chargedWeight,
        length_cm: Number(existingOrder.length ?? declaredDimensions.length ?? 0),
        width_cm: Number(existingOrder.breadth ?? declaredDimensions.breadth ?? 0),
        height_cm: Number(existingOrder.height ?? declaredDimensions.height ?? 0),
        slab_weight_g: slabWeightG,
        base_price: basePricePerSlab,
      })

      calculatedRevisedCharge = freightCalc.freight
      additionalCharge = freightCalc.freight - Number(originalShippingCharge)
    } else {
      // Fallback to proportional calculation for non-B2C or missing slab data
      const { calculateRevisedShippingCharge } = await import('./shippingChargeCalculator.service')
      const chargeCalc = await calculateRevisedShippingCharge({
        orderId,
        orderType,
        courierPartner,
        declaredWeight,
        chargedWeight,
        originalShippingCharge: Number(originalShippingCharge),
      })
      calculatedRevisedCharge = chargeCalc.revisedCharge
      additionalCharge = chargeCalc.additionalCharge
    }
  } else if (revisedShippingCharge && originalShippingCharge) {
    additionalCharge = Number(revisedShippingCharge) - Number(originalShippingCharge)
  }

  // Get user's reconciliation settings for auto-acceptance
  const [settings] = await db
    .select()
    .from(weight_reconciliation_settings)
    .where(eq(weight_reconciliation_settings.user_id, userId))

  // Determine if should auto-accept
  let autoAccepted = false
  let status: 'pending' | 'accepted' = 'pending'

  if (settings?.auto_accept_enabled) {
    const thresholdKg = Number(settings.auto_accept_threshold_kg || 0.05)
    const thresholdPercent = Number(settings.auto_accept_threshold_percent || 5)
    const percentDiff = (Math.abs(weightDifference) / declaredWeight) * 100

    if (Math.abs(weightDifference) <= thresholdKg || percentDiff <= thresholdPercent) {
      autoAccepted = true
      status = 'accepted'
    }
  }

  // Determine weight slabs (simplified - should use actual rate card logic)
  const inferredSlabWeight =
    orderType === 'b2c' && existingOrder?.charged_slabs
      ? Number(existingOrder.charged_weight ?? declaredWeight) /
        Number(existingOrder.charged_slabs || 1)
      : null
  const weightSlabOriginal = inferredSlabWeight
    ? `${(inferredSlabWeight / 1000).toFixed(3)}kg`
    : `${Math.ceil(declaredWeight * 2) / 2}kg`
  const weightSlabCharged = inferredSlabWeight
    ? `${(inferredSlabWeight / 1000).toFixed(3)}kg`
    : `${Math.ceil(chargedWeight * 2) / 2}kg`

  // Create discrepancy record
  const [discrepancy] = await db
    .insert(weight_discrepancies)
    .values({
      [orderType === 'b2c' ? 'b2c_order_id' : 'b2b_order_id']: orderId,
      order_type: orderType,
      user_id: userId,
      order_number: orderNumber,
      awb_number: awbNumber,
      courier_partner: courierPartner,
      declared_weight: declaredWeight.toString(),
      actual_weight: actualWeight?.toString(),
      volumetric_weight: volumetricWeight?.toString(),
      charged_weight: chargedWeight.toString(),
      weight_difference: weightDifference.toString(),
      declared_dimensions: declaredDimensions,
      actual_dimensions: actualDimensions,
      original_shipping_charge: originalShippingCharge?.toString(),
      revised_shipping_charge: (calculatedRevisedCharge || revisedShippingCharge)?.toString(),
      additional_charge: additionalCharge.toString(),
      weight_slab_original: weightSlabOriginal,
      weight_slab_charged: weightSlabCharged,
      status,
      auto_accepted: autoAccepted,
      acceptance_threshold: settings?.auto_accept_threshold_kg,
      courier_remarks: courierRemarks,
      courier_weight_slip_url: courierWeightSlipUrl,
      courier_weight_proof_images: courierWeightProofImages,
      weighing_metadata: weighingMetadata,
      courier_reported_at: new Date(),
      // If auto-accepted, set resolved_at immediately
      resolved_at: autoAccepted ? new Date() : null,
    })
    .returning()

  // Update order to mark weight discrepancy
  const orderTableUpdate = orderType === 'b2c' ? b2c_orders : b2b_orders
  const orderUpdateData: any = {
    actual_weight: actualWeight,
    volumetric_weight: volumetricWeight,
    charged_weight: chargedWeight,
    weight_discrepancy: true,
  }

  // If auto-accepted, also update shipping charge
  if (autoAccepted && (calculatedRevisedCharge || revisedShippingCharge)) {
    orderUpdateData.shipping_charges = calculatedRevisedCharge || revisedShippingCharge
  }

  await db
    .update(orderTableUpdate)
    .set(orderUpdateData)
    .where(eq(orderTableUpdate.id, orderId))

  // Create history entry
  await createWeightAdjustmentHistory({
    discrepancyId: discrepancy.id,
    orderId: orderType === 'b2c' ? { b2c: orderId } : { b2b: orderId },
    actionType: autoAccepted ? 'accepted' : 'discrepancy_detected',
    previousWeight: declaredWeight,
    newWeight: chargedWeight,
    weightDifference,
    chargeAdjustment: additionalCharge,
    changedByType: autoAccepted ? 'system' : 'courier',
    reason: autoAccepted
      ? `Weight discrepancy auto-accepted per seller settings (threshold: ${settings?.auto_accept_threshold_kg}kg or ${settings?.auto_accept_threshold_percent}%)`
      : `Weight discrepancy detected by ${courierPartner}`,
    source: 'webhook',
  })

  // If auto-accepted, apply wallet charges and create acceptance history entry
  if (autoAccepted && additionalCharge > 0) {
    try {
      const [userWallet] = await db
        .select()
        .from(wallets)
        .where(eq(wallets.userId, userId))
        .limit(1)

      if (userWallet) {
        await createWalletTransaction({
          walletId: userWallet.id,
          amount: additionalCharge,
          type: 'debit',
          reason: `Weight discrepancy charge (auto-accepted) for order ${orderNumber}`,
          ref: `weight_discrepancy_${discrepancy.id}`,
          meta: {
            discrepancy_id: discrepancy.id,
            order_number: orderNumber,
            weight_difference: weightDifference.toString(),
            charged_weight: chargedWeight.toString(),
            declared_weight: declaredWeight.toString(),
            auto_accepted: true,
          },
        })

        // Create acceptance history entry
        await createWeightAdjustmentHistory({
          discrepancyId: discrepancy.id,
          orderId: orderType === 'b2c' ? { b2c: orderId } : { b2b: orderId },
          actionType: 'accepted',
          previousWeight: declaredWeight,
          newWeight: chargedWeight,
          weightDifference,
          chargeAdjustment: additionalCharge,
          changedByType: 'system',
          reason: `Auto-accepted per seller settings. Additional charge: ₹${additionalCharge.toFixed(
            2,
          )}`,
          source: 'auto_accept',
        })
      }
    } catch (err) {
      console.error(
        `Failed to apply wallet charge for auto-accepted discrepancy ${discrepancy.id}:`,
        err,
      )
      // Don't fail the entire operation if wallet charge fails
    }
  }

  // Send email notification based on user preferences
  if (settings) {
    // Get user email
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1)

    if (user?.email) {
      if (autoAccepted) {
        // Always send notification for auto-accepted discrepancies to inform seller what happened
        const thresholdInfo = settings.auto_accept_threshold_kg
          ? `${settings.auto_accept_threshold_kg}kg`
          : settings.auto_accept_threshold_percent
          ? `${settings.auto_accept_threshold_percent}%`
          : undefined

        sendWeightDiscrepancyEmail({
          userEmail: user.email,
          userName: (user as any).name || 'User',
          orderNumber,
          awbNumber,
          courierPartner,
          declaredWeight,
          chargedWeight,
          weightDifference,
          additionalCharge,
          discrepancyId: discrepancy.id,
          autoAccepted: true,
          autoAcceptThreshold: thresholdInfo,
        }).catch((err) => console.error('Failed to send auto-acceptance email:', err))
      } else {
        // For non-auto-accepted discrepancies, check notification preferences
        const isLargeDiscrepancy =
          Math.abs(weightDifference) >= Number(settings.large_discrepancy_threshold_kg || 0.5)

        // Send notification if:
        // 1. General notifications are enabled (notify_on_discrepancy), OR
        // 2. It's a large discrepancy AND large discrepancy notifications are enabled
        const shouldNotify =
          settings.notify_on_discrepancy ||
          (isLargeDiscrepancy && settings.notify_on_large_discrepancy)

        if (shouldNotify) {
          sendWeightDiscrepancyEmail({
            userEmail: user.email,
            userName: (user as any).name || 'User',
            orderNumber,
            awbNumber,
            courierPartner,
            declaredWeight,
            chargedWeight,
            weightDifference,
            additionalCharge,
            discrepancyId: discrepancy.id,
            autoAccepted: false,
          }).catch((err) => console.error('Failed to send discrepancy email:', err))
        }
      }
    }
  }

  return discrepancy
}

interface WeightAdjustmentHistoryParams {
  discrepancyId?: string
  orderId?: { b2c?: string; b2b?: string }
  actionType: string
  previousWeight?: number
  newWeight?: number
  weightDifference?: number
  chargeAdjustment?: number
  changedBy?: string
  changedByType: 'system' | 'admin' | 'courier' | 'customer'
  reason?: string
  notes?: string
  source?: string
}

/**
 * Create a weight adjustment history entry
 */
export async function createWeightAdjustmentHistory(params: WeightAdjustmentHistoryParams) {
  const {
    discrepancyId,
    orderId,
    actionType,
    previousWeight,
    newWeight,
    weightDifference,
    chargeAdjustment,
    changedBy,
    changedByType,
    reason,
    notes,
    source,
  } = params

  await db.insert(weight_adjustment_history).values({
    discrepancy_id: discrepancyId,
    b2c_order_id: orderId?.b2c,
    b2b_order_id: orderId?.b2b,
    action_type: actionType,
    previous_weight: previousWeight?.toString(),
    new_weight: newWeight?.toString(),
    weight_difference: weightDifference?.toString(),
    charge_adjustment: chargeAdjustment?.toString(),
    changed_by: changedBy,
    changed_by_type: changedByType,
    reason,
    notes,
    source,
  })
}

interface GetDiscrepanciesFilters {
  userId?: string
  status?: string[]
  courierPartner?: string[]
  orderType?: 'b2c' | 'b2b'
  fromDate?: Date
  toDate?: Date
  hasDispute?: boolean
  minWeightDiff?: number
  minChargeDiff?: number
  page?: number
  limit?: number
}

/**
 * Get weight discrepancies with filters
 */
export async function getWeightDiscrepancies(filters: GetDiscrepanciesFilters = {}) {
  const {
    userId,
    status,
    courierPartner,
    orderType,
    fromDate,
    toDate,
    hasDispute,
    minWeightDiff,
    minChargeDiff,
    page = 1,
    limit = 50,
  } = filters

  const conditions: any[] = []

  if (userId) {
    conditions.push(eq(weight_discrepancies.user_id, userId))
  }

  if (status && status.length > 0) {
    conditions.push(
      sql`${weight_discrepancies.status} IN (${sql.join(
        status.map((s) => sql`${s}`),
        sql`, `,
      )})`,
    )
  }

  if (courierPartner && courierPartner.length > 0) {
    conditions.push(
      sql`${weight_discrepancies.courier_partner} IN (${sql.join(
        courierPartner.map((c) => sql`${c}`),
        sql`, `,
      )})`,
    )
  }

  if (orderType) {
    conditions.push(eq(weight_discrepancies.order_type, orderType))
  }

  if (fromDate) {
    conditions.push(gte(weight_discrepancies.detected_at, fromDate))
  }

  if (toDate) {
    conditions.push(lte(weight_discrepancies.detected_at, toDate))
  }

  if (hasDispute !== undefined) {
    conditions.push(eq(weight_discrepancies.has_dispute, hasDispute))
  }

  if (minWeightDiff) {
    conditions.push(gte(weight_discrepancies.weight_difference, minWeightDiff.toString()))
  }

  if (minChargeDiff) {
    conditions.push(gte(weight_discrepancies.additional_charge, minChargeDiff.toString()))
  }

  const offset = (page - 1) * limit

  // Get discrepancies
  const discrepancies = await db
    .select()
    .from(weight_discrepancies)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(weight_discrepancies.detected_at))
    .limit(limit)
    .offset(offset)

  // Get total count
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(weight_discrepancies)
    .where(conditions.length > 0 ? and(...conditions) : undefined)

  return {
    discrepancies,
    pagination: {
      page,
      limit,
      total: count,
      totalPages: Math.ceil(count / limit),
    },
  }
}

/**
 * Get a single discrepancy with all related data
 */
export async function getDiscrepancyById(id: string) {
  const [discrepancy] = await db
    .select()
    .from(weight_discrepancies)
    .where(eq(weight_discrepancies.id, id))

  if (!discrepancy) {
    throw new Error('Discrepancy not found')
  }

  // Get dispute if exists
  let dispute = null
  if (discrepancy.dispute_id) {
    ;[dispute] = await db
      .select()
      .from(weight_disputes)
      .where(eq(weight_disputes.id, discrepancy.dispute_id))
  }

  // Get adjustment history
  const history = await db
    .select()
    .from(weight_adjustment_history)
    .where(eq(weight_adjustment_history.discrepancy_id, id))
    .orderBy(desc(weight_adjustment_history.created_at))

  // Get order details
  let order = null
  if (discrepancy.order_type === 'b2c' && discrepancy.b2c_order_id) {
    ;[order] = await db.select().from(b2c_orders).where(eq(b2c_orders.id, discrepancy.b2c_order_id))
  } else if (discrepancy.order_type === 'b2b' && discrepancy.b2b_order_id) {
    ;[order] = await db.select().from(b2b_orders).where(eq(b2b_orders.id, discrepancy.b2b_order_id))
  }

  return {
    discrepancy,
    dispute,
    history,
    order,
  }
}

/**
 * Accept a weight discrepancy and apply charges
 */
export async function acceptWeightDiscrepancy(
  discrepancyId: string,
  userId: string,
  notes?: string,
) {
  const [discrepancy] = await db
    .select()
    .from(weight_discrepancies)
    .where(
      and(eq(weight_discrepancies.id, discrepancyId), eq(weight_discrepancies.user_id, userId)),
    )

  if (!discrepancy) {
    throw new Error('Discrepancy not found or unauthorized')
  }

  if (discrepancy.status !== 'pending') {
    throw new Error('Discrepancy cannot be accepted in current status')
  }

  const additionalCharge = Number(discrepancy.additional_charge || 0)

  // Use transaction to ensure atomicity
  await db.transaction(async (tx) => {
    // Update discrepancy status
    await tx
      .update(weight_discrepancies)
      .set({
        status: 'accepted',
        resolution_notes: notes,
        resolved_at: new Date(),
        updated_at: new Date(),
      })
      .where(eq(weight_discrepancies.id, discrepancyId))

    // Update order with final charged weight and revised shipping cost
    const orderTable = discrepancy.order_type === 'b2c' ? b2c_orders : b2b_orders
    const orderId =
      discrepancy.order_type === 'b2c' ? discrepancy.b2c_order_id : discrepancy.b2b_order_id

    if (orderId) {
      const updateData: any = {
        charged_weight: discrepancy.charged_weight,
        weight_discrepancy: true,
      }

      // Update shipping charge if revised charge is available
      if (discrepancy.revised_shipping_charge) {
        updateData.shipping_charges = discrepancy.revised_shipping_charge
      }

      await tx.update(orderTable).set(updateData).where(eq(orderTable.id, orderId))
    }

    // Deduct additional charge from wallet if > 0
    if (additionalCharge > 0) {
      const [userWallet] = await tx
        .select()
        .from(wallets)
        .where(eq(wallets.userId, userId))
        .limit(1)

      if (userWallet) {
        await createWalletTransaction({
          walletId: userWallet.id,
          amount: additionalCharge,
          type: 'debit',
          reason: `Weight discrepancy charge for order ${discrepancy.order_number}`,
          ref: `weight_discrepancy_${discrepancyId}`,
          meta: {
            discrepancy_id: discrepancyId,
            order_number: discrepancy.order_number,
            weight_difference: discrepancy.weight_difference,
            charged_weight: discrepancy.charged_weight,
            declared_weight: discrepancy.declared_weight,
          },
          tx: tx as any,
        })
      }
    }

    // Create history entry
    await tx.insert(weight_adjustment_history).values({
      discrepancy_id: discrepancyId,
      action_type: 'accepted',
      changed_by: userId,
      changed_by_type: 'customer',
      notes: notes || `Discrepancy accepted. Additional charge: ₹${additionalCharge.toFixed(2)}`,
      charge_adjustment: additionalCharge.toString(),
      reason: 'Weight discrepancy accepted by customer',
      source: 'manual_entry',
    })
  })

  return true
}

/**
 * Reject a weight discrepancy
 */
export async function rejectWeightDiscrepancy(
  discrepancyId: string,
  userId: string,
  reason: string,
) {
  const [discrepancy] = await db
    .select()
    .from(weight_discrepancies)
    .where(
      and(eq(weight_discrepancies.id, discrepancyId), eq(weight_discrepancies.user_id, userId)),
    )

  if (!discrepancy) {
    throw new Error('Discrepancy not found or unauthorized')
  }

  if (discrepancy.status !== 'pending') {
    throw new Error('Discrepancy cannot be rejected in current status')
  }

  // Update discrepancy status
  await db
    .update(weight_discrepancies)
    .set({
      status: 'rejected',
      resolution_notes: reason,
      resolved_at: new Date(),
      updated_at: new Date(),
    })
    .where(eq(weight_discrepancies.id, discrepancyId))

  // Create history entry
  await createWeightAdjustmentHistory({
    discrepancyId,
    actionType: 'dispute_raised',
    changedBy: userId,
    changedByType: 'customer',
    reason: `Discrepancy rejected: ${reason}`,
    source: 'manual_entry',
  })

  return true
}

interface CreateDisputeParams {
  discrepancyId: string
  userId: string
  disputeReason: string
  customerComment: string
  customerClaimedWeight?: number
  customerClaimedDimensions?: { length: number; breadth: number; height: number }
  evidenceUrls?: string[]
}

/**
 * Create a dispute for a weight discrepancy
 */
export async function createWeightDispute(params: CreateDisputeParams) {
  const {
    discrepancyId,
    userId,
    disputeReason,
    customerComment,
    customerClaimedWeight,
    customerClaimedDimensions,
    evidenceUrls,
  } = params

  // Check if discrepancy exists and belongs to user
  const [discrepancy] = await db
    .select()
    .from(weight_discrepancies)
    .where(
      and(eq(weight_discrepancies.id, discrepancyId), eq(weight_discrepancies.user_id, userId)),
    )

  if (!discrepancy) {
    throw new Error('Discrepancy not found or unauthorized')
  }

  if (discrepancy.has_dispute) {
    throw new Error('A dispute already exists for this discrepancy')
  }

  // Create dispute
  const [dispute] = await db
    .insert(weight_disputes)
    .values({
      discrepancy_id: discrepancyId,
      user_id: userId,
      dispute_reason: disputeReason,
      customer_comment: customerComment,
      customer_claimed_weight: customerClaimedWeight?.toString(),
      customer_claimed_dimensions: customerClaimedDimensions,
      customer_evidence_urls: evidenceUrls,
      status: 'open',
      priority: Math.abs(Number(discrepancy.additional_charge)) > 100 ? 'high' : 'medium',
    })
    .returning()

  // Update discrepancy
  await db
    .update(weight_discrepancies)
    .set({
      has_dispute: true,
      dispute_id: dispute.id,
      status: 'disputed',
      updated_at: new Date(),
    })
    .where(eq(weight_discrepancies.id, discrepancyId))

  // Create history entry
  await createWeightAdjustmentHistory({
    discrepancyId,
    actionType: 'dispute_raised',
    changedBy: userId,
    changedByType: 'customer',
    reason: `Dispute raised: ${disputeReason}`,
    notes: customerComment,
    source: 'manual_entry',
  })

  return dispute
}

/**
 * Get disputes with filters
 */
export async function getWeightDisputes(filters: {
  userId?: string
  status?: string[]
  page?: number
  limit?: number
}) {
  const { userId, status, page = 1, limit = 50 } = filters

  const conditions: any[] = []

  if (userId) {
    conditions.push(eq(weight_disputes.user_id, userId))
  }

  if (status && status.length > 0) {
    conditions.push(
      sql`${weight_disputes.status} IN (${sql.join(
        status.map((s) => sql`${s}`),
        sql`, `,
      )})`,
    )
  }

  const offset = (page - 1) * limit

  const disputes = await db
    .select({
      dispute: weight_disputes,
      discrepancy: weight_discrepancies,
    })
    .from(weight_disputes)
    .leftJoin(weight_discrepancies, eq(weight_discrepancies.id, weight_disputes.discrepancy_id))
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(desc(weight_disputes.created_at))
    .limit(limit)
    .offset(offset)

  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(weight_disputes)
    .where(conditions.length > 0 ? and(...conditions) : undefined)

  return {
    disputes,
    pagination: {
      page,
      limit,
      total: count,
      totalPages: Math.ceil(count / limit),
    },
  }
}

/**
 * Get or create weight reconciliation settings for a user
 */
export async function getWeightReconciliationSettings(userId: string) {
  const [settings] = await db
    .select()
    .from(weight_reconciliation_settings)
    .where(eq(weight_reconciliation_settings.user_id, userId))

  if (settings) {
    return settings
  }

  // Create default settings
  const [newSettings] = await db
    .insert(weight_reconciliation_settings)
    .values({
      user_id: userId,
      auto_accept_enabled: false,
      auto_accept_threshold_kg: '0.05',
      auto_accept_threshold_percent: '5',
      notify_on_discrepancy: true,
      notify_on_large_discrepancy: true,
      large_discrepancy_threshold_kg: '0.5',
      email_daily_summary: false,
      email_weekly_report: true,
    })
    .returning()

  return newSettings
}

/**
 * Update weight reconciliation settings
 */
export async function updateWeightReconciliationSettings(
  userId: string,
  updates: Partial<{
    autoAcceptEnabled: boolean
    autoAcceptThresholdKg: number
    autoAcceptThresholdPercent: number
    notifyOnDiscrepancy: boolean
    notifyOnLargeDiscrepancy: boolean
    largeDiscrepancyThresholdKg: number
    emailDailySummary: boolean
    emailWeeklyReport: boolean
  }>,
) {
  // Ensure settings exist
  await getWeightReconciliationSettings(userId)

  const updateData: any = { updated_at: new Date() }

  if (updates.autoAcceptEnabled !== undefined) {
    updateData.auto_accept_enabled = updates.autoAcceptEnabled
  }
  if (updates.autoAcceptThresholdKg !== undefined) {
    updateData.auto_accept_threshold_kg = updates.autoAcceptThresholdKg.toString()
  }
  if (updates.autoAcceptThresholdPercent !== undefined) {
    updateData.auto_accept_threshold_percent = updates.autoAcceptThresholdPercent.toString()
  }
  if (updates.notifyOnDiscrepancy !== undefined) {
    updateData.notify_on_discrepancy = updates.notifyOnDiscrepancy
  }
  if (updates.notifyOnLargeDiscrepancy !== undefined) {
    updateData.notify_on_large_discrepancy = updates.notifyOnLargeDiscrepancy
  }
  if (updates.largeDiscrepancyThresholdKg !== undefined) {
    updateData.large_discrepancy_threshold_kg = updates.largeDiscrepancyThresholdKg.toString()
  }
  if (updates.emailDailySummary !== undefined) {
    updateData.email_daily_summary = updates.emailDailySummary
  }
  if (updates.emailWeeklyReport !== undefined) {
    updateData.email_weekly_report = updates.emailWeeklyReport
  }

  const [updated] = await db
    .update(weight_reconciliation_settings)
    .set(updateData)
    .where(eq(weight_reconciliation_settings.user_id, userId))
    .returning()

  return updated
}

/**
 * Get weight reconciliation analytics/summary for a user
 */
export async function getWeightReconciliationSummary(
  userId: string,
  fromDate?: Date,
  toDate?: Date,
) {
  const conditions: any[] = [eq(weight_discrepancies.user_id, userId)]

  if (fromDate) {
    conditions.push(gte(weight_discrepancies.detected_at, fromDate))
  }
  if (toDate) {
    conditions.push(lte(weight_discrepancies.detected_at, toDate))
  }

  // Get summary stats
  const [stats] = await db
    .select({
      totalDiscrepancies: sql<number>`count(*)::int`,
      pendingCount: sql<number>`count(*) FILTER (WHERE status = 'pending')::int`,
      acceptedCount: sql<number>`count(*) FILTER (WHERE status = 'accepted')::int`,
      disputedCount: sql<number>`count(*) FILTER (WHERE status = 'disputed')::int`,
      resolvedCount: sql<number>`count(*) FILTER (WHERE status = 'resolved')::int`,
      rejectedCount: sql<number>`count(*) FILTER (WHERE status = 'rejected')::int`,
      totalAdditionalCharges: sql<number>`sum(CAST(additional_charge AS NUMERIC))`,
      avgWeightDifference: sql<number>`avg(CAST(weight_difference AS NUMERIC))`,
      maxWeightDifference: sql<number>`max(CAST(weight_difference AS NUMERIC))`,
      autoAcceptedCount: sql<number>`count(*) FILTER (WHERE auto_accepted = true)::int`,
    })
    .from(weight_discrepancies)
    .where(and(...conditions))

  // Get breakdown by courier
  const courierBreakdown = await db
    .select({
      courierPartner: weight_discrepancies.courier_partner,
      count: sql<number>`count(*)::int`,
      totalCharge: sql<number>`sum(CAST(additional_charge AS NUMERIC))`,
      avgWeightDiff: sql<number>`avg(CAST(weight_difference AS NUMERIC))`,
    })
    .from(weight_discrepancies)
    .where(and(...conditions))
    .groupBy(weight_discrepancies.courier_partner)

  return {
    summary: stats,
    courierBreakdown,
  }
}

/**
 * Bulk accept multiple discrepancies
 */
export async function bulkAcceptDiscrepancies(
  discrepancyIds: string[],
  userId: string,
  notes?: string,
) {
  const results = []

  for (const id of discrepancyIds) {
    try {
      await acceptWeightDiscrepancy(id, userId, notes)
      results.push({ id, success: true })
    } catch (error: any) {
      results.push({ id, success: false, error: error.message })
    }
  }

  return results
}

/**
 * Bulk reject multiple discrepancies
 */
export async function bulkRejectDiscrepancies(
  discrepancyIds: string[],
  userId: string,
  reason: string,
) {
  const results = []

  for (const id of discrepancyIds) {
    try {
      await rejectWeightDiscrepancy(id, userId, reason)
      results.push({ id, success: true })
    } catch (error: any) {
      results.push({ id, success: false, error: error.message })
    }
  }

  return results
}

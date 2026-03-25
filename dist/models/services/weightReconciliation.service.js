"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.createWeightDiscrepancy = createWeightDiscrepancy;
exports.createWeightAdjustmentHistory = createWeightAdjustmentHistory;
exports.getWeightDiscrepancies = getWeightDiscrepancies;
exports.getDiscrepancyById = getDiscrepancyById;
exports.acceptWeightDiscrepancy = acceptWeightDiscrepancy;
exports.rejectWeightDiscrepancy = rejectWeightDiscrepancy;
exports.createWeightDispute = createWeightDispute;
exports.getWeightDisputes = getWeightDisputes;
exports.getWeightReconciliationSettings = getWeightReconciliationSettings;
exports.updateWeightReconciliationSettings = updateWeightReconciliationSettings;
exports.getWeightReconciliationSummary = getWeightReconciliationSummary;
exports.bulkAcceptDiscrepancies = bulkAcceptDiscrepancies;
exports.bulkRejectDiscrepancies = bulkRejectDiscrepancies;
const drizzle_orm_1 = require("drizzle-orm");
const schema_1 = require("../../schema/schema");
const client_1 = require("../client");
const wallet_service_1 = require("./wallet.service");
const weightReconciliationEmail_service_1 = require("./weightReconciliationEmail.service");
const chargeableFreight_1 = require("./pricing/chargeableFreight");
const shiprocket_service_1 = require("./shiprocket.service");
/**
 * Create a weight discrepancy record when courier reports different weight
 */
async function createWeightDiscrepancy(params) {
    const { orderType, orderId, userId, orderNumber, awbNumber, courierPartner, declaredWeight, actualWeight, volumetricWeight, chargedWeight, declaredDimensions, actualDimensions, originalShippingCharge, revisedShippingCharge, courierRemarks, courierWeightSlipUrl, courierWeightProofImages, weighingMetadata, } = params;
    // Idempotency guard for webhook retries:
    // if same order is reported with same charged/declaration again, reuse latest discrepancy.
    const orderFilter = orderType === 'b2c'
        ? (0, drizzle_orm_1.eq)(schema_1.weight_discrepancies.b2c_order_id, orderId)
        : (0, drizzle_orm_1.eq)(schema_1.weight_discrepancies.b2b_order_id, orderId);
    const [existingDiscrepancy] = await client_1.db
        .select()
        .from(schema_1.weight_discrepancies)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.weight_discrepancies.order_type, orderType), orderFilter, (0, drizzle_orm_1.eq)(schema_1.weight_discrepancies.charged_weight, chargedWeight.toString()), (0, drizzle_orm_1.eq)(schema_1.weight_discrepancies.declared_weight, declaredWeight.toString())))
        .orderBy((0, drizzle_orm_1.desc)(schema_1.weight_discrepancies.created_at))
        .limit(1);
    if (existingDiscrepancy) {
        console.log(`ℹ️ Weight discrepancy already exists for order ${orderNumber} (id: ${existingDiscrepancy.id})`);
        return existingDiscrepancy;
    }
    // Calculate weight difference
    const weightDifference = Number(chargedWeight) - Number(declaredWeight);
    // Calculate additional charge
    let additionalCharge = 0;
    let calculatedRevisedCharge = revisedShippingCharge;
    // Fetch existing order to reconstruct slab/base price (B2C only)
    let existingOrder = null;
    const orderTable = orderType === 'b2c' ? schema_1.b2c_orders : schema_1.b2b_orders;
    try {
        const [row] = await client_1.db
            .select()
            .from(orderTable)
            .where((0, drizzle_orm_1.eq)(orderTable.id, orderId))
            .limit(1);
        existingOrder = row || null;
    }
    catch (e) {
        existingOrder = null;
    }
    if (!revisedShippingCharge && originalShippingCharge && weightDifference !== 0) {
        if (orderType === 'b2c' &&
            existingOrder?.courier_id &&
            existingOrder?.pincode &&
            (existingOrder?.pickup_details?.pincode || existingOrder?.rto_details?.pincode)) {
            const recomputed = await (0, shiprocket_service_1.computeB2CFreightForOrder)({
                userId,
                courierId: Number(existingOrder.courier_id),
                serviceProvider: existingOrder.integration_type ?? null,
                mode: existingOrder.shipping_mode ?? null,
                selectedMaxSlabWeight: existingOrder.selected_max_slab_weight ?? null,
                destinationPincode: String(existingOrder.pincode),
                originPincode: String(existingOrder?.pickup_details?.pincode || existingOrder?.rto_details?.pincode),
                weightG: chargedWeight,
                lengthCm: Number(existingOrder.length ?? declaredDimensions.length ?? 0),
                breadthCm: Number(existingOrder.breadth ?? declaredDimensions.breadth ?? 0),
                heightCm: Number(existingOrder.height ?? declaredDimensions.height ?? 0),
            });
            calculatedRevisedCharge = recomputed.freight;
            additionalCharge = recomputed.freight - Number(originalShippingCharge);
        }
        else if (orderType === 'b2c' && existingOrder?.charged_slabs) {
            // Legacy fallback for historical orders before slab-range rate cards.
            const slabWeightG = Number(existingOrder.charged_weight ?? declaredWeight) /
                Number(existingOrder.charged_slabs || 1);
            const basePricePerSlab = Number(existingOrder.freight_charges ?? originalShippingCharge) /
                Number(existingOrder.charged_slabs || 1);
            const freightCalc = (0, chargeableFreight_1.calculateFreight)({
                actual_weight_g: chargedWeight,
                length_cm: Number(existingOrder.length ?? declaredDimensions.length ?? 0),
                width_cm: Number(existingOrder.breadth ?? declaredDimensions.breadth ?? 0),
                height_cm: Number(existingOrder.height ?? declaredDimensions.height ?? 0),
                slab_weight_g: slabWeightG,
                base_price: basePricePerSlab,
            });
            calculatedRevisedCharge = freightCalc.freight;
            additionalCharge = freightCalc.freight - Number(originalShippingCharge);
        }
        else {
            // Fallback to proportional calculation for non-B2C or missing slab data
            const { calculateRevisedShippingCharge } = await Promise.resolve().then(() => __importStar(require('./shippingChargeCalculator.service')));
            const chargeCalc = await calculateRevisedShippingCharge({
                orderId,
                orderType,
                courierPartner,
                declaredWeight,
                chargedWeight,
                originalShippingCharge: Number(originalShippingCharge),
            });
            calculatedRevisedCharge = chargeCalc.revisedCharge;
            additionalCharge = chargeCalc.additionalCharge;
        }
    }
    else if (revisedShippingCharge && originalShippingCharge) {
        additionalCharge = Number(revisedShippingCharge) - Number(originalShippingCharge);
    }
    // Get user's reconciliation settings for auto-acceptance
    const [settings] = await client_1.db
        .select()
        .from(schema_1.weight_reconciliation_settings)
        .where((0, drizzle_orm_1.eq)(schema_1.weight_reconciliation_settings.user_id, userId));
    // Determine if should auto-accept
    let autoAccepted = false;
    let status = 'pending';
    if (settings?.auto_accept_enabled) {
        const thresholdKg = Number(settings.auto_accept_threshold_kg || 0.05);
        const thresholdPercent = Number(settings.auto_accept_threshold_percent || 5);
        const percentDiff = (Math.abs(weightDifference) / declaredWeight) * 100;
        if (Math.abs(weightDifference) <= thresholdKg || percentDiff <= thresholdPercent) {
            autoAccepted = true;
            status = 'accepted';
        }
    }
    // Determine weight slabs (simplified - should use actual rate card logic)
    const inferredSlabWeight = orderType === 'b2c' && existingOrder?.charged_slabs
        ? Number(existingOrder.charged_weight ?? declaredWeight) /
            Number(existingOrder.charged_slabs || 1)
        : null;
    const weightSlabOriginal = inferredSlabWeight
        ? `${(inferredSlabWeight / 1000).toFixed(3)}kg`
        : `${Math.ceil(declaredWeight * 2) / 2}kg`;
    const weightSlabCharged = inferredSlabWeight
        ? `${(inferredSlabWeight / 1000).toFixed(3)}kg`
        : `${Math.ceil(chargedWeight * 2) / 2}kg`;
    // Create discrepancy record
    const [discrepancy] = await client_1.db
        .insert(schema_1.weight_discrepancies)
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
        .returning();
    // Update order to mark weight discrepancy
    const orderTableUpdate = orderType === 'b2c' ? schema_1.b2c_orders : schema_1.b2b_orders;
    const orderUpdateData = {
        actual_weight: actualWeight,
        volumetric_weight: volumetricWeight,
        charged_weight: chargedWeight,
        weight_discrepancy: true,
    };
    // If auto-accepted, also update shipping charge
    if (autoAccepted && (calculatedRevisedCharge || revisedShippingCharge)) {
        orderUpdateData.shipping_charges = calculatedRevisedCharge || revisedShippingCharge;
    }
    await client_1.db
        .update(orderTableUpdate)
        .set(orderUpdateData)
        .where((0, drizzle_orm_1.eq)(orderTableUpdate.id, orderId));
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
    });
    // If auto-accepted, apply wallet charges and create acceptance history entry
    if (autoAccepted && additionalCharge > 0) {
        try {
            const [userWallet] = await client_1.db
                .select()
                .from(schema_1.wallets)
                .where((0, drizzle_orm_1.eq)(schema_1.wallets.userId, userId))
                .limit(1);
            if (userWallet) {
                await (0, wallet_service_1.createWalletTransaction)({
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
                });
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
                    reason: `Auto-accepted per seller settings. Additional charge: ₹${additionalCharge.toFixed(2)}`,
                    source: 'auto_accept',
                });
            }
        }
        catch (err) {
            console.error(`Failed to apply wallet charge for auto-accepted discrepancy ${discrepancy.id}:`, err);
            // Don't fail the entire operation if wallet charge fails
        }
    }
    // Send email notification based on user preferences
    if (settings) {
        // Get user email
        const [user] = await client_1.db.select().from(schema_1.users).where((0, drizzle_orm_1.eq)(schema_1.users.id, userId)).limit(1);
        if (user?.email) {
            if (autoAccepted) {
                // Always send notification for auto-accepted discrepancies to inform seller what happened
                const thresholdInfo = settings.auto_accept_threshold_kg
                    ? `${settings.auto_accept_threshold_kg}kg`
                    : settings.auto_accept_threshold_percent
                        ? `${settings.auto_accept_threshold_percent}%`
                        : undefined;
                (0, weightReconciliationEmail_service_1.sendWeightDiscrepancyEmail)({
                    userEmail: user.email,
                    userName: user.name || 'User',
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
                }).catch((err) => console.error('Failed to send auto-acceptance email:', err));
            }
            else {
                // For non-auto-accepted discrepancies, check notification preferences
                const isLargeDiscrepancy = Math.abs(weightDifference) >= Number(settings.large_discrepancy_threshold_kg || 0.5);
                // Send notification if:
                // 1. General notifications are enabled (notify_on_discrepancy), OR
                // 2. It's a large discrepancy AND large discrepancy notifications are enabled
                const shouldNotify = settings.notify_on_discrepancy ||
                    (isLargeDiscrepancy && settings.notify_on_large_discrepancy);
                if (shouldNotify) {
                    (0, weightReconciliationEmail_service_1.sendWeightDiscrepancyEmail)({
                        userEmail: user.email,
                        userName: user.name || 'User',
                        orderNumber,
                        awbNumber,
                        courierPartner,
                        declaredWeight,
                        chargedWeight,
                        weightDifference,
                        additionalCharge,
                        discrepancyId: discrepancy.id,
                        autoAccepted: false,
                    }).catch((err) => console.error('Failed to send discrepancy email:', err));
                }
            }
        }
    }
    return discrepancy;
}
/**
 * Create a weight adjustment history entry
 */
async function createWeightAdjustmentHistory(params) {
    const { discrepancyId, orderId, actionType, previousWeight, newWeight, weightDifference, chargeAdjustment, changedBy, changedByType, reason, notes, source, } = params;
    await client_1.db.insert(schema_1.weight_adjustment_history).values({
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
    });
}
/**
 * Get weight discrepancies with filters
 */
async function getWeightDiscrepancies(filters = {}) {
    const { userId, status, courierPartner, orderType, fromDate, toDate, hasDispute, minWeightDiff, minChargeDiff, page = 1, limit = 50, } = filters;
    const conditions = [];
    if (userId) {
        conditions.push((0, drizzle_orm_1.eq)(schema_1.weight_discrepancies.user_id, userId));
    }
    if (status && status.length > 0) {
        conditions.push((0, drizzle_orm_1.sql) `${schema_1.weight_discrepancies.status} IN (${drizzle_orm_1.sql.join(status.map((s) => (0, drizzle_orm_1.sql) `${s}`), (0, drizzle_orm_1.sql) `, `)})`);
    }
    if (courierPartner && courierPartner.length > 0) {
        conditions.push((0, drizzle_orm_1.sql) `${schema_1.weight_discrepancies.courier_partner} IN (${drizzle_orm_1.sql.join(courierPartner.map((c) => (0, drizzle_orm_1.sql) `${c}`), (0, drizzle_orm_1.sql) `, `)})`);
    }
    if (orderType) {
        conditions.push((0, drizzle_orm_1.eq)(schema_1.weight_discrepancies.order_type, orderType));
    }
    if (fromDate) {
        conditions.push((0, drizzle_orm_1.gte)(schema_1.weight_discrepancies.detected_at, fromDate));
    }
    if (toDate) {
        conditions.push((0, drizzle_orm_1.lte)(schema_1.weight_discrepancies.detected_at, toDate));
    }
    if (hasDispute !== undefined) {
        conditions.push((0, drizzle_orm_1.eq)(schema_1.weight_discrepancies.has_dispute, hasDispute));
    }
    if (minWeightDiff) {
        conditions.push((0, drizzle_orm_1.gte)(schema_1.weight_discrepancies.weight_difference, minWeightDiff.toString()));
    }
    if (minChargeDiff) {
        conditions.push((0, drizzle_orm_1.gte)(schema_1.weight_discrepancies.additional_charge, minChargeDiff.toString()));
    }
    const offset = (page - 1) * limit;
    // Get discrepancies
    const discrepancies = await client_1.db
        .select()
        .from(schema_1.weight_discrepancies)
        .where(conditions.length > 0 ? (0, drizzle_orm_1.and)(...conditions) : undefined)
        .orderBy((0, drizzle_orm_1.desc)(schema_1.weight_discrepancies.detected_at))
        .limit(limit)
        .offset(offset);
    // Get total count
    const [{ count }] = await client_1.db
        .select({ count: (0, drizzle_orm_1.sql) `count(*)::int` })
        .from(schema_1.weight_discrepancies)
        .where(conditions.length > 0 ? (0, drizzle_orm_1.and)(...conditions) : undefined);
    return {
        discrepancies,
        pagination: {
            page,
            limit,
            total: count,
            totalPages: Math.ceil(count / limit),
        },
    };
}
/**
 * Get a single discrepancy with all related data
 */
async function getDiscrepancyById(id) {
    const [discrepancy] = await client_1.db
        .select()
        .from(schema_1.weight_discrepancies)
        .where((0, drizzle_orm_1.eq)(schema_1.weight_discrepancies.id, id));
    if (!discrepancy) {
        throw new Error('Discrepancy not found');
    }
    // Get dispute if exists
    let dispute = null;
    if (discrepancy.dispute_id) {
        ;
        [dispute] = await client_1.db
            .select()
            .from(schema_1.weight_disputes)
            .where((0, drizzle_orm_1.eq)(schema_1.weight_disputes.id, discrepancy.dispute_id));
    }
    // Get adjustment history
    const history = await client_1.db
        .select()
        .from(schema_1.weight_adjustment_history)
        .where((0, drizzle_orm_1.eq)(schema_1.weight_adjustment_history.discrepancy_id, id))
        .orderBy((0, drizzle_orm_1.desc)(schema_1.weight_adjustment_history.created_at));
    // Get order details
    let order = null;
    if (discrepancy.order_type === 'b2c' && discrepancy.b2c_order_id) {
        ;
        [order] = await client_1.db.select().from(schema_1.b2c_orders).where((0, drizzle_orm_1.eq)(schema_1.b2c_orders.id, discrepancy.b2c_order_id));
    }
    else if (discrepancy.order_type === 'b2b' && discrepancy.b2b_order_id) {
        ;
        [order] = await client_1.db.select().from(schema_1.b2b_orders).where((0, drizzle_orm_1.eq)(schema_1.b2b_orders.id, discrepancy.b2b_order_id));
    }
    return {
        discrepancy,
        dispute,
        history,
        order,
    };
}
/**
 * Accept a weight discrepancy and apply charges
 */
async function acceptWeightDiscrepancy(discrepancyId, userId, notes) {
    const [discrepancy] = await client_1.db
        .select()
        .from(schema_1.weight_discrepancies)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.weight_discrepancies.id, discrepancyId), (0, drizzle_orm_1.eq)(schema_1.weight_discrepancies.user_id, userId)));
    if (!discrepancy) {
        throw new Error('Discrepancy not found or unauthorized');
    }
    if (discrepancy.status !== 'pending') {
        throw new Error('Discrepancy cannot be accepted in current status');
    }
    const additionalCharge = Number(discrepancy.additional_charge || 0);
    // Use transaction to ensure atomicity
    await client_1.db.transaction(async (tx) => {
        // Update discrepancy status
        await tx
            .update(schema_1.weight_discrepancies)
            .set({
            status: 'accepted',
            resolution_notes: notes,
            resolved_at: new Date(),
            updated_at: new Date(),
        })
            .where((0, drizzle_orm_1.eq)(schema_1.weight_discrepancies.id, discrepancyId));
        // Update order with final charged weight and revised shipping cost
        const orderTable = discrepancy.order_type === 'b2c' ? schema_1.b2c_orders : schema_1.b2b_orders;
        const orderId = discrepancy.order_type === 'b2c' ? discrepancy.b2c_order_id : discrepancy.b2b_order_id;
        if (orderId) {
            const updateData = {
                charged_weight: discrepancy.charged_weight,
                weight_discrepancy: true,
            };
            // Update shipping charge if revised charge is available
            if (discrepancy.revised_shipping_charge) {
                updateData.shipping_charges = discrepancy.revised_shipping_charge;
            }
            await tx.update(orderTable).set(updateData).where((0, drizzle_orm_1.eq)(orderTable.id, orderId));
        }
        // Deduct additional charge from wallet if > 0
        if (additionalCharge > 0) {
            const [userWallet] = await tx
                .select()
                .from(schema_1.wallets)
                .where((0, drizzle_orm_1.eq)(schema_1.wallets.userId, userId))
                .limit(1);
            if (userWallet) {
                await (0, wallet_service_1.createWalletTransaction)({
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
                    tx: tx,
                });
            }
        }
        // Create history entry
        await tx.insert(schema_1.weight_adjustment_history).values({
            discrepancy_id: discrepancyId,
            action_type: 'accepted',
            changed_by: userId,
            changed_by_type: 'customer',
            notes: notes || `Discrepancy accepted. Additional charge: ₹${additionalCharge.toFixed(2)}`,
            charge_adjustment: additionalCharge.toString(),
            reason: 'Weight discrepancy accepted by customer',
            source: 'manual_entry',
        });
    });
    return true;
}
/**
 * Reject a weight discrepancy
 */
async function rejectWeightDiscrepancy(discrepancyId, userId, reason) {
    const [discrepancy] = await client_1.db
        .select()
        .from(schema_1.weight_discrepancies)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.weight_discrepancies.id, discrepancyId), (0, drizzle_orm_1.eq)(schema_1.weight_discrepancies.user_id, userId)));
    if (!discrepancy) {
        throw new Error('Discrepancy not found or unauthorized');
    }
    if (discrepancy.status !== 'pending') {
        throw new Error('Discrepancy cannot be rejected in current status');
    }
    // Update discrepancy status
    await client_1.db
        .update(schema_1.weight_discrepancies)
        .set({
        status: 'rejected',
        resolution_notes: reason,
        resolved_at: new Date(),
        updated_at: new Date(),
    })
        .where((0, drizzle_orm_1.eq)(schema_1.weight_discrepancies.id, discrepancyId));
    // Create history entry
    await createWeightAdjustmentHistory({
        discrepancyId,
        actionType: 'dispute_raised',
        changedBy: userId,
        changedByType: 'customer',
        reason: `Discrepancy rejected: ${reason}`,
        source: 'manual_entry',
    });
    return true;
}
/**
 * Create a dispute for a weight discrepancy
 */
async function createWeightDispute(params) {
    const { discrepancyId, userId, disputeReason, customerComment, customerClaimedWeight, customerClaimedDimensions, evidenceUrls, } = params;
    // Check if discrepancy exists and belongs to user
    const [discrepancy] = await client_1.db
        .select()
        .from(schema_1.weight_discrepancies)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.weight_discrepancies.id, discrepancyId), (0, drizzle_orm_1.eq)(schema_1.weight_discrepancies.user_id, userId)));
    if (!discrepancy) {
        throw new Error('Discrepancy not found or unauthorized');
    }
    if (discrepancy.has_dispute) {
        throw new Error('A dispute already exists for this discrepancy');
    }
    // Create dispute
    const [dispute] = await client_1.db
        .insert(schema_1.weight_disputes)
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
        .returning();
    // Update discrepancy
    await client_1.db
        .update(schema_1.weight_discrepancies)
        .set({
        has_dispute: true,
        dispute_id: dispute.id,
        status: 'disputed',
        updated_at: new Date(),
    })
        .where((0, drizzle_orm_1.eq)(schema_1.weight_discrepancies.id, discrepancyId));
    // Create history entry
    await createWeightAdjustmentHistory({
        discrepancyId,
        actionType: 'dispute_raised',
        changedBy: userId,
        changedByType: 'customer',
        reason: `Dispute raised: ${disputeReason}`,
        notes: customerComment,
        source: 'manual_entry',
    });
    return dispute;
}
/**
 * Get disputes with filters
 */
async function getWeightDisputes(filters) {
    const { userId, status, page = 1, limit = 50 } = filters;
    const conditions = [];
    if (userId) {
        conditions.push((0, drizzle_orm_1.eq)(schema_1.weight_disputes.user_id, userId));
    }
    if (status && status.length > 0) {
        conditions.push((0, drizzle_orm_1.sql) `${schema_1.weight_disputes.status} IN (${drizzle_orm_1.sql.join(status.map((s) => (0, drizzle_orm_1.sql) `${s}`), (0, drizzle_orm_1.sql) `, `)})`);
    }
    const offset = (page - 1) * limit;
    const disputes = await client_1.db
        .select({
        dispute: schema_1.weight_disputes,
        discrepancy: schema_1.weight_discrepancies,
    })
        .from(schema_1.weight_disputes)
        .leftJoin(schema_1.weight_discrepancies, (0, drizzle_orm_1.eq)(schema_1.weight_discrepancies.id, schema_1.weight_disputes.discrepancy_id))
        .where(conditions.length > 0 ? (0, drizzle_orm_1.and)(...conditions) : undefined)
        .orderBy((0, drizzle_orm_1.desc)(schema_1.weight_disputes.created_at))
        .limit(limit)
        .offset(offset);
    const [{ count }] = await client_1.db
        .select({ count: (0, drizzle_orm_1.sql) `count(*)::int` })
        .from(schema_1.weight_disputes)
        .where(conditions.length > 0 ? (0, drizzle_orm_1.and)(...conditions) : undefined);
    return {
        disputes,
        pagination: {
            page,
            limit,
            total: count,
            totalPages: Math.ceil(count / limit),
        },
    };
}
/**
 * Get or create weight reconciliation settings for a user
 */
async function getWeightReconciliationSettings(userId) {
    const [settings] = await client_1.db
        .select()
        .from(schema_1.weight_reconciliation_settings)
        .where((0, drizzle_orm_1.eq)(schema_1.weight_reconciliation_settings.user_id, userId));
    if (settings) {
        return settings;
    }
    // Create default settings
    const [newSettings] = await client_1.db
        .insert(schema_1.weight_reconciliation_settings)
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
        .returning();
    return newSettings;
}
/**
 * Update weight reconciliation settings
 */
async function updateWeightReconciliationSettings(userId, updates) {
    // Ensure settings exist
    await getWeightReconciliationSettings(userId);
    const updateData = { updated_at: new Date() };
    if (updates.autoAcceptEnabled !== undefined) {
        updateData.auto_accept_enabled = updates.autoAcceptEnabled;
    }
    if (updates.autoAcceptThresholdKg !== undefined) {
        updateData.auto_accept_threshold_kg = updates.autoAcceptThresholdKg.toString();
    }
    if (updates.autoAcceptThresholdPercent !== undefined) {
        updateData.auto_accept_threshold_percent = updates.autoAcceptThresholdPercent.toString();
    }
    if (updates.notifyOnDiscrepancy !== undefined) {
        updateData.notify_on_discrepancy = updates.notifyOnDiscrepancy;
    }
    if (updates.notifyOnLargeDiscrepancy !== undefined) {
        updateData.notify_on_large_discrepancy = updates.notifyOnLargeDiscrepancy;
    }
    if (updates.largeDiscrepancyThresholdKg !== undefined) {
        updateData.large_discrepancy_threshold_kg = updates.largeDiscrepancyThresholdKg.toString();
    }
    if (updates.emailDailySummary !== undefined) {
        updateData.email_daily_summary = updates.emailDailySummary;
    }
    if (updates.emailWeeklyReport !== undefined) {
        updateData.email_weekly_report = updates.emailWeeklyReport;
    }
    const [updated] = await client_1.db
        .update(schema_1.weight_reconciliation_settings)
        .set(updateData)
        .where((0, drizzle_orm_1.eq)(schema_1.weight_reconciliation_settings.user_id, userId))
        .returning();
    return updated;
}
/**
 * Get weight reconciliation analytics/summary for a user
 */
async function getWeightReconciliationSummary(userId, fromDate, toDate) {
    const conditions = [(0, drizzle_orm_1.eq)(schema_1.weight_discrepancies.user_id, userId)];
    if (fromDate) {
        conditions.push((0, drizzle_orm_1.gte)(schema_1.weight_discrepancies.detected_at, fromDate));
    }
    if (toDate) {
        conditions.push((0, drizzle_orm_1.lte)(schema_1.weight_discrepancies.detected_at, toDate));
    }
    // Get summary stats
    const [stats] = await client_1.db
        .select({
        totalDiscrepancies: (0, drizzle_orm_1.sql) `count(*)::int`,
        pendingCount: (0, drizzle_orm_1.sql) `count(*) FILTER (WHERE status = 'pending')::int`,
        acceptedCount: (0, drizzle_orm_1.sql) `count(*) FILTER (WHERE status = 'accepted')::int`,
        disputedCount: (0, drizzle_orm_1.sql) `count(*) FILTER (WHERE status = 'disputed')::int`,
        resolvedCount: (0, drizzle_orm_1.sql) `count(*) FILTER (WHERE status = 'resolved')::int`,
        rejectedCount: (0, drizzle_orm_1.sql) `count(*) FILTER (WHERE status = 'rejected')::int`,
        totalAdditionalCharges: (0, drizzle_orm_1.sql) `sum(CAST(additional_charge AS NUMERIC))`,
        avgWeightDifference: (0, drizzle_orm_1.sql) `avg(CAST(weight_difference AS NUMERIC))`,
        maxWeightDifference: (0, drizzle_orm_1.sql) `max(CAST(weight_difference AS NUMERIC))`,
        autoAcceptedCount: (0, drizzle_orm_1.sql) `count(*) FILTER (WHERE auto_accepted = true)::int`,
    })
        .from(schema_1.weight_discrepancies)
        .where((0, drizzle_orm_1.and)(...conditions));
    // Get breakdown by courier
    const courierBreakdown = await client_1.db
        .select({
        courierPartner: schema_1.weight_discrepancies.courier_partner,
        count: (0, drizzle_orm_1.sql) `count(*)::int`,
        totalCharge: (0, drizzle_orm_1.sql) `sum(CAST(additional_charge AS NUMERIC))`,
        avgWeightDiff: (0, drizzle_orm_1.sql) `avg(CAST(weight_difference AS NUMERIC))`,
    })
        .from(schema_1.weight_discrepancies)
        .where((0, drizzle_orm_1.and)(...conditions))
        .groupBy(schema_1.weight_discrepancies.courier_partner);
    return {
        summary: stats,
        courierBreakdown,
    };
}
/**
 * Bulk accept multiple discrepancies
 */
async function bulkAcceptDiscrepancies(discrepancyIds, userId, notes) {
    const results = [];
    for (const id of discrepancyIds) {
        try {
            await acceptWeightDiscrepancy(id, userId, notes);
            results.push({ id, success: true });
        }
        catch (error) {
            results.push({ id, success: false, error: error.message });
        }
    }
    return results;
}
/**
 * Bulk reject multiple discrepancies
 */
async function bulkRejectDiscrepancies(discrepancyIds, userId, reason) {
    const results = [];
    for (const id of discrepancyIds) {
        try {
            await rejectWeightDiscrepancy(id, userId, reason);
            results.push({ id, success: true });
        }
        catch (error) {
            results.push({ id, success: false, error: error.message });
        }
    }
    return results;
}

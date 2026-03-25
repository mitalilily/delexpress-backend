"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.applyCancellationRefundOnce = applyCancellationRefundOnce;
exports.processEkartWebhookV2 = processEkartWebhookV2;
exports.processDelhiveryWebhook = processDelhiveryWebhook;
exports.processDelhiveryDocumentWebhook = processDelhiveryDocumentWebhook;
exports.processEkartWebhook = processEkartWebhook;
exports.processXpressbeesWebhook = processXpressbeesWebhook;
// services/webhookProcessor.ts
const axios_1 = __importDefault(require("axios"));
const dayjs_1 = __importDefault(require("dayjs"));
const drizzle_orm_1 = require("drizzle-orm");
const webhookDelivery_service_1 = require("../../services/webhookDelivery.service");
const client_1 = require("../client");
const b2cOrders_1 = require("../schema/b2cOrders");
const invoicePreferences_1 = require("../schema/invoicePreferences");
const rto_1 = require("../schema/rto");
const userProfile_1 = require("../schema/userProfile");
const wallet_1 = require("../schema/wallet");
const codRemittance_service_1 = require("./codRemittance.service");
const delhivery_service_1 = require("./couriers/delhivery.service");
const invoice_service_1 = require("./invoice.service");
const ndr_service_1 = require("./ndr.service");
const notifications_service_1 = require("./notifications.service");
const rto_service_1 = require("./rto.service");
const trackingEvents_service_1 = require("./trackingEvents.service");
const upload_service_1 = require("./upload.service");
const invoiceHelpers_1 = require("./invoiceHelpers");
const wallet_service_1 = require("./wallet.service");
const weightReconciliation_service_1 = require("./weightReconciliation.service");
const invoiceNumber_service_1 = require("./invoiceNumber.service");
const shopify_service_1 = require("./shopify.service");
const shiprocket_service_1 = require("./shiprocket.service");
// Helper function to generate invoice for an order
const generateInvoiceForOrderWebhook = async (order, tx) => {
    try {
        // Check if invoice already exists
        if (order.invoice_link) {
            console.log(`ℹ️ Invoice already exists for order ${order.order_number}`);
            return order.invoice_link;
        }
        const [prefs] = await tx
            .select()
            .from(invoicePreferences_1.invoicePreferences)
            .where((0, drizzle_orm_1.eq)(invoicePreferences_1.invoicePreferences.userId, order.user_id));
        const [user] = await tx
            .select({
            companyName: (0, drizzle_orm_1.sql) `(${userProfile_1.userProfiles.companyInfo} ->> 'businessName')`,
            brandName: (0, drizzle_orm_1.sql) `(${userProfile_1.userProfiles.companyInfo} ->> 'brandName')`,
            companyGST: (0, drizzle_orm_1.sql) `(${userProfile_1.userProfiles.companyInfo} ->> 'companyGst')`,
            supportEmail: (0, drizzle_orm_1.sql) `(${userProfile_1.userProfiles.companyInfo} ->> 'companyEmail')`,
            supportPhone: (0, drizzle_orm_1.sql) `(${userProfile_1.userProfiles.companyInfo} ->> 'companyContactNumber')`,
            companyLogo: (0, drizzle_orm_1.sql) `(${userProfile_1.userProfiles.companyInfo} ->> 'companyLogoUrl')`,
            companyAddress: (0, drizzle_orm_1.sql) `(${userProfile_1.userProfiles.companyInfo} ->> 'companyAddress')`,
            companyState: (0, drizzle_orm_1.sql) `(${userProfile_1.userProfiles.companyInfo} ->> 'state')`,
            panNumber: (0, drizzle_orm_1.sql) `(${userProfile_1.userProfiles.companyInfo} ->> 'panNumber')`,
        })
            .from(userProfile_1.userProfiles)
            .where((0, drizzle_orm_1.eq)(userProfile_1.userProfiles.userId, order.user_id));
        const { logoBuffer, signatureBuffer } = await (0, invoiceHelpers_1.loadInvoiceAssets)({
            companyLogoKey: user?.companyLogo,
            includeSignature: prefs?.includeSignature,
            signatureFile: prefs?.signatureFile,
        }, order.order_number || String(order.id));
        const invoiceNumber = await (0, invoiceNumber_service_1.resolveInvoiceNumber)({
            userId: order.user_id,
            existingInvoiceNumber: order?.invoice_number,
            prefix: prefs?.prefix ?? undefined,
            suffix: prefs?.suffix ?? undefined,
            tx,
        });
        const invoiceDateDisplay = (0, dayjs_1.default)().format('DD MMM YYYY');
        const invoiceDateStored = (0, dayjs_1.default)().format('YYYY-MM-DD');
        const invoiceAmount = Number(order.order_amount ?? 0) +
            Number(order.shipping_charges ?? 0) + // Already includes other_charges
            Number(order.gift_wrap ?? 0) +
            Number(order.transaction_fee ?? 0) -
            (Number(order.discount ?? 0) + Number(order.prepaid_amount ?? 0));
        const pickupDetails = (0, invoiceHelpers_1.normalizePickupDetails)(order.pickup_details);
        const pickupPincode = pickupDetails?.pincode;
        const serviceType = order.service_type ||
            order.serviceType ||
            order.integration_type ||
            order.courier_partner ||
            '';
        const pickupAddress = (0, invoiceHelpers_1.formatPickupAddress)(pickupDetails);
        const sellerAddress = pickupAddress || user?.companyAddress || '';
        const sellerStateCode = pickupDetails?.state || user?.companyState || '';
        const sellerName = pickupDetails?.warehouse_name || user?.companyName || user?.brandName || 'Seller';
        const brandName = user?.brandName ||
            user?.companyName ||
            pickupDetails?.warehouse_name ||
            '';
        const gstNumber = user?.companyGST || '';
        const panNumber = user?.panNumber || '';
        const supportPhone = pickupDetails?.phone || user?.supportPhone || '';
        const supportEmail = user?.supportEmail || prefs?.supportEmail || '';
        const invoiceBuffer = await (0, invoice_service_1.generateInvoicePDF)({
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
            products: order.products,
            shippingCharges: Number(order.shipping_charges ?? 0),
            giftWrap: Number(order.gift_wrap) ?? 0,
            transactionFee: Number(order.transaction_fee) ?? 0,
            discount: Number(order.discount) ?? 0,
            prepaidAmount: Number(order.prepaid_amount) ?? 0,
            courierName: order.courier_partner ?? '',
            courierId: order.courier_id?.toString() ?? '',
            logoBuffer,
            orderType: order?.order_type,
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
            rtoCharges: Number(order.rto_charges ?? 0),
            layout: prefs?.template ?? 'classic',
        });
        const { uploadUrl, key } = await (0, upload_service_1.presignUpload)({
            filename: `invoice-${order.id}.pdf`,
            contentType: 'application/pdf',
            userId: order.user_id,
            folderKey: 'invoices',
        });
        const finalUploadUrl = Array.isArray(uploadUrl) ? uploadUrl[0] : uploadUrl;
        const uploadResponse = await axios_1.default.put(finalUploadUrl, invoiceBuffer, {
            headers: { 'Content-Type': 'application/pdf' },
            validateStatus: (status) => status >= 200 && status < 300, // Only accept 2xx status codes
        });
        // Verify upload succeeded
        if (uploadResponse.status < 200 || uploadResponse.status >= 300) {
            throw new Error(`Invoice upload failed with status ${uploadResponse.status}`);
        }
        const finalKey = Array.isArray(key) ? key[0] : key;
        // Validate key is not empty and is a string
        if (!finalKey || typeof finalKey !== 'string' || finalKey.trim().length === 0) {
            throw new Error('Invoice key is invalid or empty after upload');
        }
        const trimmedKey = finalKey.trim();
        console.log(`✅ Invoice uploaded successfully for order ${order.order_number}: ${trimmedKey} (status: ${uploadResponse.status})`);
        return {
            key: trimmedKey,
            invoiceNumber,
            invoiceDate: invoiceDateStored,
            invoiceAmount,
        };
    }
    catch (err) {
        console.error(`⚠️ Failed to generate invoice for order ${order.order_number}:`, err?.message || err);
        return null;
    }
};
const getStoredRtoCharge = (order) => Number(order.freight_charges ?? order.shipping_charges ?? 0) || 0;
async function resolveRtoCharge(order) {
    const storedCharge = getStoredRtoCharge(order);
    if (storedCharge > 0)
        return storedCharge;
    const courierId = Number(order.courier_id ?? 0);
    const originPincode = order.pickup_details?.pincode;
    const destinationPincode = order.pincode;
    const weightG = Math.round(Number(order.weight ?? 0) * 1000);
    const lengthCm = Number(order.length ?? 0);
    const breadthCm = Number(order.breadth ?? 0);
    const heightCm = Number(order.height ?? 0);
    if (!order.user_id ||
        !courierId ||
        !originPincode ||
        !destinationPincode ||
        weightG <= 0 ||
        lengthCm <= 0 ||
        breadthCm <= 0 ||
        heightCm <= 0) {
        return 0;
    }
    try {
        const rate = await (0, shiprocket_service_1.computeB2CFreightForOrder)({
            userId: order.user_id,
            courierId,
            serviceProvider: order.integration_type ?? null,
            mode: order.shipping_mode ?? null,
            selectedMaxSlabWeight: order.selected_max_slab_weight ?? null,
            originPincode,
            destinationPincode,
            weightG,
            lengthCm,
            breadthCm,
            heightCm,
            isReverse: true,
        });
        return Number(rate.freight ?? 0) || 0;
    }
    catch (err) {
        console.error(`⚠️ Failed to resolve RTO rate from plan table for ${order.order_number}:`, err);
        return 0;
    }
}
async function applyRtoChargeOnce(tx, order, courierLabel) {
    const amount = await resolveRtoCharge(order);
    if (amount <= 0)
        return null;
    const [existingChargedEvent] = await tx
        .select({ id: rto_1.rto_events.id })
        .from(rto_1.rto_events)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(rto_1.rto_events.order_id, order.id), (0, drizzle_orm_1.isNotNull)(rto_1.rto_events.rto_charges), (0, drizzle_orm_1.gt)(rto_1.rto_events.rto_charges, 0)))
        .limit(1);
    if (existingChargedEvent) {
        return null;
    }
    try {
        const [wallet] = await tx.select().from(wallet_1.wallets).where((0, drizzle_orm_1.eq)(wallet_1.wallets.userId, order.user_id));
        if (!wallet)
            throw new Error(`Wallet not found for user ${order.user_id}`);
        await (0, wallet_service_1.createWalletTransaction)({
            walletId: wallet.id,
            amount,
            type: 'debit',
            currency: wallet.currency ?? 'INR',
            reason: `RTO freight - ${courierLabel} (${order.order_number})`,
            ref: order.id,
            meta: {
                awb: order.awb_number,
                order_number: order.order_number,
                courier_partner: order.courier_partner ?? courierLabel,
            },
            tx: tx,
        });
    }
    catch (err) {
        console.error(`⚠️ Failed RTO debit for ${courierLabel}:`, err);
    }
    return amount;
}
async function applyCancellationRefundOnce(tx, order, source) {
    const freightCharges = Number(order.freight_charges ?? 0);
    const otherCharges = Number(order.other_charges ?? 0);
    const codCharges = Number(order.cod_charges ?? 0);
    const [wallet] = await tx.select().from(wallet_1.wallets).where((0, drizzle_orm_1.eq)(wallet_1.wallets.userId, order.user_id));
    if (!wallet) {
        throw new Error(`Wallet not found for user ${order.user_id}`);
    }
    const refundReason = `Refund for cancelled order #${order.order_number}`;
    const [existingRefund] = await tx
        .select({ id: wallet_1.walletTransactions.id })
        .from(wallet_1.walletTransactions)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(wallet_1.walletTransactions.wallet_id, wallet.id), (0, drizzle_orm_1.eq)(wallet_1.walletTransactions.type, 'credit'), (0, drizzle_orm_1.eq)(wallet_1.walletTransactions.reason, refundReason)))
        .limit(1);
    if (existingRefund) {
        console.log(`ℹ️ Cancellation refund already exists for order ${order.order_number}; skipping duplicate refund`);
        return 0;
    }
    const originalDebitReasons = ['B2C Prepaid Order Payment', 'B2C COD Service Charges'];
    const debitTransactions = await tx
        .select({
        amount: wallet_1.walletTransactions.amount,
        reason: wallet_1.walletTransactions.reason,
        meta: wallet_1.walletTransactions.meta,
    })
        .from(wallet_1.walletTransactions)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(wallet_1.walletTransactions.wallet_id, wallet.id), (0, drizzle_orm_1.eq)(wallet_1.walletTransactions.type, 'debit'), (0, drizzle_orm_1.eq)(wallet_1.walletTransactions.ref, order.id)));
    const originalWalletDebit = debitTransactions
        .filter((transaction) => originalDebitReasons.includes(String(transaction.reason ?? '')))
        .reduce((sum, transaction) => sum + Number(transaction.amount ?? 0), 0);
    let refundAmount = originalWalletDebit;
    if (refundAmount <= 0) {
        if (order.order_type === 'prepaid') {
            const orderAmount = Number(order.order_amount ?? 0);
            refundAmount = orderAmount + freightCharges + otherCharges;
        }
        else {
            refundAmount = freightCharges + otherCharges + codCharges;
        }
    }
    if (refundAmount <= 0) {
        console.warn(`⚠️ No refundable amount resolved for cancelled order ${order.order_number}`, {
            source,
            order_type: order.order_type,
            order_amount: Number(order.order_amount ?? 0),
            freight_charges: freightCharges,
            other_charges: otherCharges,
            cod_charges: codCharges,
            original_wallet_debit: originalWalletDebit,
            debit_transactions_found: debitTransactions.length,
        });
        return 0;
    }
    console.log(`💰 Refunding ₹${refundAmount} for cancelled order ${order.order_number}`, {
        source,
        order_type: order.order_type,
        order_amount: order.order_type === 'prepaid' ? Number(order.order_amount ?? 0) : 0,
        freight_charges: freightCharges,
        other_charges: otherCharges,
        cod_charges: order.order_type === 'cod' ? codCharges : 0,
        original_wallet_debit: originalWalletDebit,
        total_refund: refundAmount,
    });
    await (0, wallet_service_1.createWalletTransaction)({
        walletId: wallet.id,
        amount: refundAmount,
        type: 'credit',
        ref: order.id,
        reason: refundReason,
        currency: wallet.currency ?? 'INR',
        meta: {
            source,
            order_id: order.id,
            order_number: order.order_number,
            order_type: order.order_type,
            freight_charges: freightCharges,
            other_charges: otherCharges,
            cod_charges: order.order_type === 'cod' ? codCharges : 0,
        },
        tx: tx,
    });
    console.log(`✅ Wallet refunded ₹${refundAmount} for ${order.user_id}`);
    return refundAmount;
}
// Ekart webhook: supports track_updated, shipment_created, shipment_recreated
async function processEkartWebhookV2(payload, tx = client_1.db) {
    const statusRaw = payload?.status || payload?.track_updated?.status || payload?.status_text;
    const awb = payload?.wbn || payload?.id || payload?.tracking_id || payload?.track_updated?.wbn || null;
    const orderRef = payload?.orderNumber || payload?.order_number || payload?.order_id || null;
    const normalized = (statusRaw || '').toString().toLowerCase();
    const statusMap = {
        'order placed': 'booked',
        'pickup scheduled': 'pickup_scheduled',
        'in transit': 'in_transit',
        'out for delivery': 'out_for_delivery',
        delivered: 'delivered',
        'return to origin': 'rto_initiated',
        'rto initiated': 'rto_initiated',
        'rto in transit': 'rto_in_transit',
        'rto delivered': 'rto_delivered',
        'delivery attempted': 'ndr',
        ndr: 'ndr',
        'manifest generated': 'pickup_initiated',
    };
    let mapped = statusMap[normalized] || normalized || 'unknown';
    if (mapped === 'pickup_scheduled')
        mapped = 'pickup_initiated';
    if (mapped === 'unknown' && normalized.includes('delivery'))
        mapped = 'out_for_delivery';
    if (mapped === 'unknown' && normalized.includes('attempt'))
        mapped = 'ndr';
    if (mapped === 'unknown' && normalized.includes('rto'))
        mapped = 'rto_initiated';
    // find order by awb then order_number
    let order;
    if (awb) {
        ;
        [order] = await tx.select().from(b2cOrders_1.b2c_orders).where((0, drizzle_orm_1.eq)(b2cOrders_1.b2c_orders.awb_number, awb));
    }
    if (!order && orderRef) {
        ;
        [order] = await tx.select().from(b2cOrders_1.b2c_orders).where((0, drizzle_orm_1.eq)(b2cOrders_1.b2c_orders.order_number, orderRef));
    }
    if (!order) {
        console.warn(`⚠️ Ekart webhook: order not found for AWB ${awb} or ref ${orderRef}`);
        return { success: false, reason: 'order_not_found' };
    }
    const update = {
        order_status: mapped,
        updated_at: new Date(),
    };
    const prevStatus = order.order_status || '';
    await tx.update(b2cOrders_1.b2c_orders).set(update).where((0, drizzle_orm_1.eq)(b2cOrders_1.b2c_orders.id, order.id));
    await (0, shopify_service_1.syncShopifyStatusForLocalOrder)({ ...order, ...update }, tx).catch((err) => {
        console.warn('⚠️ Failed Shopify status sync for Ekart webhook:', err);
    });
    // emit tracking webhook
    await (0, webhookDelivery_service_1.sendWebhookEvent)(order.user_id, 'tracking.updated', {
        awb_number: awb || order.awb_number,
        order_id: order.id,
        order_number: order.order_number,
        status: mapped,
        raw_status: statusRaw,
        courier_partner: order.courier_partner,
    });
    return { success: true };
}
async function processDelhiveryWebhook(payload, tx = client_1.db) {
    const shipment = payload?.Shipment;
    const statusInfo = shipment?.Status || {};
    const waybill = shipment?.AWB;
    const referenceNo = shipment?.ReferenceNo ||
        shipment?.ReferenceNumber ||
        payload?.ReferenceNo ||
        payload?.ReferenceNumber ||
        payload?.order_number ||
        payload?.orderNumber ||
        null;
    const status = statusInfo?.Status;
    const status_type = statusInfo?.StatusType;
    const location = statusInfo?.StatusLocation;
    const instructions = statusInfo?.Instructions;
    if (!waybill)
        return { success: false, reason: 'missing_awb' };
    let [order] = await tx.select().from(b2cOrders_1.b2c_orders).where((0, drizzle_orm_1.eq)(b2cOrders_1.b2c_orders.awb_number, waybill));
    if (!order && referenceNo) {
        ;
        [order] = await tx
            .select()
            .from(b2cOrders_1.b2c_orders)
            .where((0, drizzle_orm_1.eq)(b2cOrders_1.b2c_orders.order_number, String(referenceNo)));
    }
    if (!order) {
        console.warn(`⚠️ No local order found for AWB ${waybill}`);
        return { success: false, reason: 'order_not_found' };
    }
    // 🔹 Map Delhivery → internal status
    // Reference: Delhivery Webhook Documentation
    // Forward Shipment: UD (Manifested, Not Picked, In Transit, Pending, Dispatched) → DL (Delivered)
    // Return Shipment: RT (In Transit, Pending, Dispatched) → DL (RTO)
    // Reverse Shipment: PP (Open, Scheduled, Dispatched) → PU (In Transit, Pending, Dispatched) → DL (DTO)
    const mapStatus = (type, s, instructionText) => {
        const t = type?.toUpperCase();
        const st = s?.toLowerCase();
        const instruction = instructionText?.toLowerCase() || '';
        if (instruction.includes('seller cancelled') ||
            instruction.includes('seller canceled') ||
            instruction.includes('shipment has been cancelled') ||
            instruction.includes('shipment has been canceled')) {
            return 'cancelled';
        }
        // Forward Shipment Statuses (UD)
        if (t === 'UD') {
            if (st === 'manifested')
                return 'booked';
            if (st === 'not picked')
                return 'pickup_initiated';
            if (st === 'in transit')
                return 'in_transit';
            if (st === 'pending')
                return 'in_transit'; // Reached destination city, not yet dispatched
            if (st === 'dispatched')
                return 'out_for_delivery';
        }
        // Delivery Statuses (DL)
        if (t === 'DL') {
            if (st === 'delivered')
                return 'delivered'; // Forward shipment delivered
            if (st === 'dto')
                return 'delivered'; // Reverse shipment accepted (DTO = Delivered To Origin)
            if (st === 'rto')
                return 'rto_delivered'; // Return shipment delivered to origin
        }
        // Return Shipment Statuses (RT)
        if (t === 'RT') {
            if (st === 'in transit')
                return 'rto_in_transit'; // Forward shipment converted to return, in transit
            if (st === 'pending')
                return 'rto'; // Reached DC nearest to origin
            if (st === 'dispatched')
                return 'rto_in_transit'; // Dispatched for delivery to origin
        }
        // NDR handling for Delhivery
        if (t === 'ND') {
            return 'ndr';
        }
        // Reverse Shipment - Pickup Request Statuses (PP)
        if (t === 'PP') {
            if (st === 'open')
                return 'pickup_initiated'; // Pickup request created
            if (st === 'scheduled')
                return 'pickup_initiated'; // Pickup request scheduled
            if (st === 'dispatched')
                return 'out_for_delivery'; // FE out in field to collect package
        }
        // Reverse Shipment - Pickup In Transit Statuses (PU)
        if (t === 'PU') {
            if (st === 'in transit')
                return 'in_transit'; // In transit to RPC from DC after physical pickup
            if (st === 'pending')
                return 'in_transit'; // Reached RPC but not yet dispatched
            if (st === 'dispatched')
                return 'out_for_delivery'; // Dispatched for delivery to client from RPC
        }
        // Cancellation Statuses (CN)
        if (t === 'CN') {
            if (st === 'canceled' || st === 'cancelled')
                return 'cancelled'; // Canceled before pickup
            if (st === 'closed')
                return 'cancelled'; // Canceled and request closed
            return 'cancelled'; // Default for any CN status
        }
        return 'in_transit'; // Default fallback
    };
    let internalStatus = mapStatus(status_type, status, instructions);
    // Map any pending_pickup status to pickup_initiated
    if (internalStatus === 'pending_pickup') {
        internalStatus = 'pickup_initiated';
    }
    console.log(`📦 Delhivery Webhook: ${waybill} → ${status} (${status_type}) → ${internalStatus}`);
    const currentStatus = (order.order_status || '').toLowerCase();
    const currentManifestError = String(order.manifest_error || '').trim();
    if (currentStatus === 'cancelled' &&
        internalStatus !== 'cancelled' &&
        internalStatus !== 'rto' &&
        internalStatus !== 'rto_in_transit' &&
        internalStatus !== 'rto_delivered') {
        console.log(`⏭️ Ignoring Delhivery webhook status regression for cancelled order ${order.order_number}: ${status} (${status_type}) would map to ${internalStatus}`);
        return {
            success: true,
            ignored: true,
            reason: 'cancelled_order_status_regression',
        };
    }
    if (currentStatus === 'manifest_failed' &&
        currentManifestError &&
        (internalStatus === 'booked' || internalStatus === 'pickup_initiated')) {
        console.log(`⏭️ Ignoring Delhivery webhook status regression for manifest_failed order ${order.order_number}: ${status} (${status_type}) would map to ${internalStatus}`);
        return {
            success: true,
            ignored: true,
            reason: 'manifest_failed_status_regression',
        };
    }
    await tx.transaction(async (innerTx) => {
        // 1️⃣ Update base order status
        const updateData = {
            order_status: internalStatus,
            delivery_location: location || null,
            delivery_message: instructions || null,
            updated_at: new Date(),
        };
        if (!order.awb_number && waybill) {
            updateData.awb_number = String(waybill);
        }
        // 🔹 Capture courier cost if available from Delhivery webhook (for revenue calculation)
        // Check various possible field names from Delhivery webhook
        if (shipment?.Charge !== undefined ||
            shipment?.Amount !== undefined ||
            shipment?.BillingAmount !== undefined ||
            shipment?.TotalCharge !== undefined ||
            shipment?.FreightCharges !== undefined ||
            shipment?.cost !== undefined) {
            const courierCost = shipment?.Charge ||
                shipment?.Amount ||
                shipment?.BillingAmount ||
                shipment?.TotalCharge ||
                shipment?.FreightCharges ||
                shipment?.cost;
            if (courierCost !== null && courierCost !== undefined) {
                updateData.courier_cost = Number(courierCost);
                console.log(`💰 Captured Delhivery courier cost ₹${courierCost} for order ${order.order_number}`);
            }
        }
        // 🔹 Capture weight data from Delhivery webhook if available
        const scannedWeight = shipment?.Scans?.[0]?.ScanDetail?.ScannedWeight;
        const chargedWeight = shipment?.ChargedWeight || scannedWeight;
        const volumetricWeight = shipment?.VolumetricWeight;
        if (chargedWeight || volumetricWeight) {
            if (chargedWeight)
                updateData.charged_weight = Number(chargedWeight);
            if (volumetricWeight)
                updateData.volumetric_weight = Number(volumetricWeight);
            if (scannedWeight && !updateData.actual_weight)
                updateData.actual_weight = Number(scannedWeight);
            // Check for weight discrepancy
            const finalChargedWeight = Number(chargedWeight);
            const declaredWeight = Number(order.weight);
            if (finalChargedWeight &&
                declaredWeight &&
                Math.abs(finalChargedWeight - declaredWeight) > 0.01) {
                updateData.weight_discrepancy = true;
                // Create weight discrepancy record
                try {
                    await (0, weightReconciliation_service_1.createWeightDiscrepancy)({
                        orderType: 'b2c',
                        orderId: order.id,
                        userId: order.user_id,
                        orderNumber: order.order_number,
                        awbNumber: order.awb_number || undefined,
                        courierPartner: 'Delhivery',
                        declaredWeight,
                        actualWeight: scannedWeight ? Number(scannedWeight) : undefined,
                        volumetricWeight: volumetricWeight ? Number(volumetricWeight) : undefined,
                        chargedWeight: finalChargedWeight,
                        declaredDimensions: {
                            length: Number(order.length || 0),
                            breadth: Number(order.breadth || 0),
                            height: Number(order.height || 0),
                        },
                        originalShippingCharge: Number(order.shipping_charges || 0),
                        courierRemarks: shipment?.Status?.Instructions,
                    });
                    console.log(`⚖️ Weight discrepancy detected for order ${order.order_number}: ${declaredWeight}kg → ${finalChargedWeight}kg`);
                }
                catch (err) {
                    console.error(`❌ Failed to create weight discrepancy record:`, err);
                }
            }
        }
        await innerTx.update(b2cOrders_1.b2c_orders).set(updateData).where((0, drizzle_orm_1.eq)(b2cOrders_1.b2c_orders.id, order.id));
        await (0, shopify_service_1.syncShopifyStatusForLocalOrder)({ ...order, ...updateData }, innerTx).catch((err) => {
            console.warn('⚠️ Failed Shopify status sync for Delhivery webhook:', err);
        });
        // 🔔 NDR capture for Delhivery
        const statusLower = (internalStatus || '').toLowerCase();
        const isNdr = ['ndr', 'undelivered'].includes(statusLower);
        if (isNdr) {
            try {
                await (0, ndr_service_1.recordNdrEvent)({
                    orderId: order.id,
                    userId: order.user_id,
                    awbNumber: order.awb_number || undefined,
                    status: statusLower,
                    reason: shipment?.Status?.Instructions || null,
                    remarks: shipment?.Status?.Status || null,
                    attemptNo: shipment?.AttemptedCount?.toString?.() || null,
                    payload,
                });
                await (0, notifications_service_1.createNotificationService)({
                    targetRole: 'user',
                    userId: order.user_id,
                    title: 'Delivery attempt issue (Delhivery)',
                    message: `Order ${order.order_number} marked as ${statusLower}.`,
                });
                await (0, notifications_service_1.createNotificationService)({
                    targetRole: 'admin',
                    title: 'NDR captured (Delhivery)',
                    message: `User ${order.user_id} order ${order.order_number} status ${statusLower}`,
                });
            }
            catch (e) {
                console.error('❌ Failed to record NDR event (Delhivery):', e);
            }
        }
        // 🔔 RTO capture for Delhivery
        const isRto = ['rto', 'rto_in_transit', 'rto_delivered'].includes(statusLower);
        if (isRto) {
            try {
                const rtoCharge = await applyRtoChargeOnce(innerTx, order, 'Delhivery');
                await (0, rto_service_1.recordRtoEvent)({
                    orderId: order.id,
                    userId: order.user_id,
                    awbNumber: order.awb_number || undefined,
                    status: statusLower,
                    reason: shipment?.Status?.Instructions || null,
                    remarks: shipment?.Status?.Status || null,
                    rtoCharges: rtoCharge,
                    payload,
                });
                await (0, notifications_service_1.createNotificationService)({
                    targetRole: 'user',
                    userId: order.user_id,
                    title: 'RTO update (Delhivery)',
                    message: `Order ${order.order_number} status updated: ${statusLower}.`,
                });
                await (0, notifications_service_1.createNotificationService)({
                    targetRole: 'admin',
                    title: 'RTO event (Delhivery)',
                    message: `User ${order.user_id} order ${order.order_number} ${statusLower}`,
                });
            }
            catch (e) {
                console.error('❌ Failed to record RTO event (Delhivery):', e);
            }
        }
        // 2️⃣ When Manifested → generate invoice (labels will be generated during manifest)
        // Also generate invoice when status becomes pickup_initiated (auto-manifested)
        if (internalStatus === 'booked' || internalStatus === 'pickup_initiated') {
            try {
                // Fetch fresh order data
                const [freshOrder] = await innerTx
                    .select()
                    .from(b2cOrders_1.b2c_orders)
                    .where((0, drizzle_orm_1.eq)(b2cOrders_1.b2c_orders.id, order.id));
                if (!freshOrder) {
                    console.warn(`⚠️ Order ${order.order_number} not found in transaction`);
                    return;
                }
                // Labels will be generated during manifest generation, not during webhook processing
                // 📜 Log tracking event (Delhivery)
                try {
                    await (0, trackingEvents_service_1.logTrackingEvent)({
                        orderId: order.id,
                        userId: order.user_id,
                        awbNumber: order.awb_number,
                        courier: 'Delhivery',
                        statusCode: internalStatus,
                        statusText: status,
                        location,
                        raw: payload,
                    });
                }
                catch (e) {
                    console.error('Failed to log tracking event (Delhivery):', e);
                }
                // 🔸 Generate invoice using shared helper function
                let invoiceKey = freshOrder.invoice_link;
                let invoiceNumberToStore = freshOrder.invoice_number;
                let invoiceDateToStore = freshOrder.invoice_date;
                let invoiceAmountToStore = freshOrder.invoice_amount;
                if (!invoiceKey) {
                    console.log(`🧾 Generating invoice for Delhivery order ${order.order_number}`);
                    try {
                        const invoiceResult = await generateInvoiceForOrderWebhook(freshOrder, innerTx);
                        if (invoiceResult) {
                            invoiceKey = invoiceResult.key;
                            invoiceNumberToStore = invoiceResult.invoiceNumber;
                            invoiceDateToStore = invoiceResult.invoiceDate;
                            invoiceAmountToStore = invoiceResult.invoiceAmount;
                            console.log(`✅ Invoice generated successfully: ${invoiceKey}`);
                        }
                        else {
                            console.warn(`⚠️ Invoice generation returned null/undefined for order ${order.order_number}`);
                        }
                    }
                    catch (invoiceErr) {
                        console.error(`❌ Failed to generate invoice for Delhivery order ${order.order_number}:`, invoiceErr?.message || invoiceErr);
                        // Don't throw - invoice failure shouldn't prevent label from being saved
                    }
                }
                else {
                    console.log(`ℹ️ Invoice already exists for order ${order.order_number}`);
                }
                // Update order record with invoice and manifest (labels will be added during manifest)
                await innerTx
                    .update(b2cOrders_1.b2c_orders)
                    .set({
                    invoice_link: invoiceKey ?? undefined,
                    manifest: shipment?.upload_wbn ?? shipment?.UploadWBN ?? null,
                    invoice_number: invoiceNumberToStore ?? undefined,
                    invoice_date: invoiceDateToStore ?? undefined,
                    invoice_amount: invoiceAmountToStore ?? undefined,
                    updated_at: new Date(),
                })
                    .where((0, drizzle_orm_1.eq)(b2cOrders_1.b2c_orders.id, order.id));
                console.log(`✅ Invoice saved for order ${order.order_number}`);
                try {
                    const delhivery = new delhivery_service_1.DelhiveryService();
                    await delhivery.triggerDelhiveryPickupRequest(order.pickup_details?.warehouse_name ?? '', 1);
                    console.log(`🚚 Pickup request triggered for ${order.order_number}`);
                }
                catch (pickupErr) {
                    console.error(`❌ Failed to trigger pickup request for ${order.order_number}:`, pickupErr?.message || pickupErr);
                    // Don't throw - pickup request failure shouldn't prevent order update
                }
            }
            catch (err) {
                console.error(`❌ Failed to generate label/invoice/pickup for ${order.order_number}:`, err?.message || err, err?.stack);
                // Re-throw to ensure transaction is rolled back if order update fails
                throw err;
            }
        }
        // 3️⃣ Delivered → Create COD remittance (if COD order)
        if (internalStatus === 'delivered' && order.order_type === 'cod') {
            try {
                console.log(`💰 Creating COD remittance for Delhivery order ${order.order_number}`);
                const { remittance, created } = await (0, codRemittance_service_1.createCodRemittance)({
                    orderId: order.id,
                    orderType: 'b2c',
                    userId: order.user_id,
                    orderNumber: order.order_number,
                    awbNumber: order.awb_number || undefined,
                    courierPartner: order.courier_partner || 'Delhivery',
                    codAmount: Number(order.order_amount || 0),
                    codCharges: Number(order.cod_charges || 0),
                    freightCharges: Number(order.freight_charges ?? order.shipping_charges ?? 0),
                    collectedAt: new Date(),
                });
                if (created) {
                    await (0, notifications_service_1.createNotificationService)({
                        targetRole: 'admin',
                        title: 'COD remittance created',
                        message: `Order ${order.order_number} (${order.awb_number || 'no AWB'}) created pending COD remittance of ₹${Number(remittance.remittableAmount || 0).toFixed(2)}.`,
                    });
                }
                console.log(`✅ COD remittance created for Delhivery order ${order.order_number}`);
            }
            catch (err) {
                console.error(`❌ Failed to create COD remittance for order ${order.order_number}:`, err);
            }
        }
        // 4️⃣ Cancelled → Refund wallet
        if (internalStatus === 'cancelled') {
            await applyCancellationRefundOnce(innerTx, order, 'delhivery_webhook');
        }
    });
    return { success: true };
}
/**
 * Process Delhivery Document Push Webhook (POD, Sorter Image, QC Image)
 * According to Delhivery documentation, document push webhooks are separate from scan push webhooks
 */
async function processDelhiveryDocumentWebhook(payload, documentType, tx = client_1.db) {
    const shipment = payload?.Shipment || payload;
    const waybill = shipment?.AWB || payload?.AWB || payload?.waybill;
    if (!waybill) {
        return { success: false, reason: 'missing_awb' };
    }
    const [order] = await tx.select().from(b2cOrders_1.b2c_orders).where((0, drizzle_orm_1.eq)(b2cOrders_1.b2c_orders.awb_number, waybill));
    if (!order) {
        console.warn(`⚠️ No local order found for AWB ${waybill} (document webhook)`);
        return { success: false, reason: 'order_not_found' };
    }
    // Extract document URLs based on document type
    let documentUrl = null;
    const docType = (documentType || '').toLowerCase();
    if (docType === 'pod' || docType === 'poddocument') {
        documentUrl =
            shipment?.PODDocument ||
                payload?.PODDocument ||
                shipment?.POD?.DocumentURL ||
                payload?.POD?.DocumentURL ||
                shipment?.DocumentURL ||
                payload?.DocumentURL;
    }
    else if (docType === 'sorterimage' || docType === 'sorter') {
        documentUrl =
            shipment?.SorterImage ||
                payload?.SorterImage ||
                shipment?.Sorter?.ImageURL ||
                payload?.Sorter?.ImageURL ||
                shipment?.ImageURL ||
                payload?.ImageURL;
    }
    else if (docType === 'qcimage' || docType === 'qc') {
        documentUrl =
            shipment?.QCImage ||
                payload?.QCImage ||
                shipment?.QC?.ImageURL ||
                payload?.QC?.ImageURL ||
                shipment?.ImageURL ||
                payload?.ImageURL;
    }
    else {
        // Generic document URL extraction
        documentUrl =
            shipment?.DocumentURL ||
                payload?.DocumentURL ||
                shipment?.ImageURL ||
                payload?.ImageURL ||
                shipment?.URL ||
                payload?.URL;
    }
    if (!documentUrl) {
        console.warn(`⚠️ No document URL found in Delhivery document webhook for AWB ${waybill}`);
        return { success: false, reason: 'missing_document_url' };
    }
    console.log(`📄 Processing Delhivery ${documentType || 'document'} webhook for AWB ${waybill}, URL: ${documentUrl}`);
    try {
        await tx.transaction(async (innerTx) => {
            // Store document URL in order metadata or delivery_message field
            // Note: You may want to add a dedicated field for POD/document URLs in the schema
            const updateData = {
                updated_at: new Date(),
            };
            // Store in delivery_message if it's POD, otherwise append to existing message
            if (docType === 'pod' || docType === 'poddocument') {
                const existingMessage = order.delivery_message || '';
                updateData.delivery_message = existingMessage
                    ? `${existingMessage}\nPOD Document: ${documentUrl}`
                    : `POD Document: ${documentUrl}`;
            }
            // Log the document for tracking
            await (0, trackingEvents_service_1.logTrackingEvent)({
                orderId: order.id,
                userId: order.user_id,
                awbNumber: order.awb_number,
                courier: 'Delhivery',
                statusCode: 'document_received',
                statusText: `${documentType || 'Document'} received`,
                location: null,
                raw: {
                    documentType,
                    documentUrl,
                    payload,
                },
            });
            await innerTx.update(b2cOrders_1.b2c_orders).set(updateData).where((0, drizzle_orm_1.eq)(b2cOrders_1.b2c_orders.id, order.id));
            // Create notification for document received
            await (0, notifications_service_1.createNotificationService)({
                targetRole: 'user',
                userId: order.user_id,
                title: `${documentType || 'Document'} received (Delhivery)`,
                message: `Order ${order.order_number} - ${documentType || 'Document'} document is now available.`,
            });
            // Also notify admins so POD/document events are visible in admin notification center.
            await (0, notifications_service_1.createNotificationService)({
                targetRole: 'admin',
                title: `${documentType || 'Document'} received (Delhivery)`,
                message: `Order ${order.order_number} (${order.awb_number || waybill}) - ${documentType || 'Document'} document received.`,
            });
            console.log(`✅ Delhivery ${documentType || 'document'} webhook processed successfully for AWB ${waybill}`);
        });
        return { success: true };
    }
    catch (error) {
        console.error(`❌ Failed to process Delhivery document webhook for AWB ${waybill}:`, error?.message || error);
        return { success: false, reason: 'processing_error' };
    }
}
// =========================
// Ekart Webhook Processing
// =========================
const mapEkartStatus = (status) => {
    const s = (status || '').toLowerCase();
    if (!s)
        return 'in_transit';
    if (s.includes('delivered'))
        return s.includes('rto') ? 'rto_delivered' : 'delivered';
    if (s.includes('out for delivery') || s.includes('ofd'))
        return 'out_for_delivery';
    if (s.includes('pickup') || s.includes('created') || s.includes('manifest'))
        return 'booked';
    if (s.includes('ndr') || s.includes('undelivered') || s.includes('not delivered'))
        return 'ndr';
    if (s.includes('rto'))
        return 'rto_in_transit';
    return 'in_transit';
};
const unwrapXpressbeesPayload = (payload) => {
    if (payload?.__provider === 'xpressbees' && payload?.body) {
        return payload.body;
    }
    if (Array.isArray(payload?.data) && payload.data.length > 0) {
        return payload.data[0];
    }
    if (payload?.data && typeof payload.data === 'object' && !Array.isArray(payload.data)) {
        return payload.data;
    }
    return payload;
};
const mapXpressbeesStatus = (status) => {
    const s = (status || '').toLowerCase().trim();
    if (!s)
        return 'in_transit';
    if (s.includes('cancel'))
        return 'cancelled';
    if (s.includes('ndr') || s.includes('undelivered') || s.includes('attempt'))
        return 'ndr';
    if (s.includes('rto') && s.includes('deliver'))
        return 'rto_delivered';
    if (s.includes('rto'))
        return 'rto_in_transit';
    if (s.includes('deliver'))
        return 'delivered';
    if (s.includes('out for delivery') || s.includes('ofd'))
        return 'out_for_delivery';
    if (s.includes('pickup scheduled') || s.includes('pickup requested'))
        return 'pickup_initiated';
    if (s.includes('pickup') || s.includes('manifest') || s.includes('booked') || s.includes('created')) {
        return 'booked';
    }
    if (s.includes('transit') || s.includes('dispatched'))
        return 'in_transit';
    return 'in_transit';
};
async function processEkartWebhook(payload, tx = client_1.db) {
    const awb = payload?.tracking_id ||
        payload?.trackingId ||
        payload?.awb ||
        payload?.waybill ||
        payload?.wbn ||
        payload?.barcodes?.wbn ||
        null;
    const statusRaw = payload?.current_status || payload?.status || payload?.event || '';
    const remarks = payload?.remarks || payload?.remark || payload?.message || '';
    const location = payload?.current_location ||
        payload?.location ||
        payload?.scan_location ||
        payload?.last_location ||
        null;
    if (!awb)
        return { success: false, reason: 'missing_awb' };
    const [order] = await tx.select().from(b2cOrders_1.b2c_orders).where((0, drizzle_orm_1.eq)(b2cOrders_1.b2c_orders.awb_number, awb));
    if (!order) {
        console.warn(`⚠️ No local order found for Ekart AWB ${awb}`);
        return { success: false, reason: 'order_not_found' };
    }
    const internalStatus = mapEkartStatus(statusRaw);
    const statusLower = internalStatus.toLowerCase();
    const statusText = statusRaw || internalStatus;
    const updateData = {
        order_status: internalStatus,
        delivery_location: location,
        delivery_message: remarks || null,
        updated_at: new Date(),
    };
    if (payload?.courier_cost !== undefined)
        updateData.courier_cost = Number(payload.courier_cost);
    if (payload?.charged_weight !== undefined)
        updateData.charged_weight = Number(payload.charged_weight);
    if (payload?.volumetric_weight !== undefined)
        updateData.volumetric_weight = Number(payload.volumetric_weight);
    if (payload?.actual_weight !== undefined)
        updateData.actual_weight = Number(payload.actual_weight);
    await tx.transaction(async (innerTx) => {
        await innerTx.update(b2cOrders_1.b2c_orders).set(updateData).where((0, drizzle_orm_1.eq)(b2cOrders_1.b2c_orders.id, order.id));
        await (0, shopify_service_1.syncShopifyStatusForLocalOrder)({ ...order, ...updateData }, innerTx).catch((err) => {
            console.warn('⚠️ Failed Shopify status sync for Ekart webhook:', err);
        });
        try {
            await (0, trackingEvents_service_1.logTrackingEvent)({
                orderId: order.id,
                userId: order.user_id,
                awbNumber: order.awb_number,
                courier: 'Ekart Logistics',
                statusCode: internalStatus,
                statusText,
                location,
                raw: payload,
            });
        }
        catch (err) {
            console.error('❌ Failed to log Ekart tracking event:', err);
        }
        if (internalStatus === 'booked' || internalStatus === 'pickup_initiated') {
            try {
                const [freshOrder] = await innerTx
                    .select()
                    .from(b2cOrders_1.b2c_orders)
                    .where((0, drizzle_orm_1.eq)(b2cOrders_1.b2c_orders.id, order.id));
                if (!freshOrder) {
                    console.warn(`⚠️ Order ${order.order_number} not found during Ekart webhook transaction`);
                    return;
                }
                let invoiceKey = freshOrder.invoice_link;
                let invoiceNumberToStore = freshOrder.invoice_number;
                let invoiceDateToStore = freshOrder.invoice_date;
                let invoiceAmountToStore = freshOrder.invoice_amount;
                if (!invoiceKey) {
                    console.log(`🧾 Generating invoice for Ekart order ${order.order_number}`);
                    try {
                        const invoiceResult = await generateInvoiceForOrderWebhook(freshOrder, innerTx);
                        if (invoiceResult) {
                            invoiceKey = invoiceResult.key;
                            invoiceNumberToStore = invoiceResult.invoiceNumber;
                            invoiceDateToStore = invoiceResult.invoiceDate;
                            invoiceAmountToStore = invoiceResult.invoiceAmount;
                            console.log(`✅ Invoice generated for Ekart order ${order.order_number}: ${invoiceKey}`);
                        }
                        else {
                            console.warn(`⚠️ Invoice generation returned empty key for Ekart order ${order.order_number}`);
                        }
                    }
                    catch (invoiceErr) {
                        console.error(`❌ Failed to generate invoice for Ekart order ${order.order_number}:`, invoiceErr?.message || invoiceErr);
                    }
                }
                else {
                    console.log(`ℹ️ Invoice already exists for order ${order.order_number}`);
                }
                await innerTx
                    .update(b2cOrders_1.b2c_orders)
                    .set({
                    invoice_link: invoiceKey ?? undefined,
                    invoice_number: invoiceNumberToStore ?? undefined,
                    invoice_date: invoiceDateToStore ?? undefined,
                    invoice_amount: invoiceAmountToStore ?? undefined,
                    updated_at: new Date(),
                })
                    .where((0, drizzle_orm_1.eq)(b2cOrders_1.b2c_orders.id, order.id));
            }
            catch (err) {
                console.error(`❌ Ekart invoice flow error for ${order.order_number}:`, err);
            }
        }
    });
    if (['ndr', 'undelivered'].includes(statusLower)) {
        try {
            await (0, ndr_service_1.recordNdrEvent)({
                orderId: order.id,
                userId: order.user_id,
                awbNumber: order.awb_number || undefined,
                status: statusLower,
                reason: remarks || null,
                payload,
            });
            await (0, notifications_service_1.createNotificationService)({
                targetRole: 'user',
                userId: order.user_id,
                title: 'Delivery attempt issue (Ekart)',
                message: `Order ${order.order_number} marked as ${statusLower}.`,
            });
            await (0, notifications_service_1.createNotificationService)({
                targetRole: 'admin',
                title: 'NDR captured (Ekart)',
                message: `User ${order.user_id} order ${order.order_number} status ${statusLower}`,
            });
        }
        catch (err) {
            console.error('❌ Failed to record NDR event (Ekart):', err);
        }
    }
    if (statusLower.includes('rto')) {
        try {
            const rtoCharge = await applyRtoChargeOnce(tx, order, 'Ekart');
            await (0, rto_service_1.recordRtoEvent)({
                orderId: order.id,
                userId: order.user_id,
                awbNumber: order.awb_number || undefined,
                status: statusLower,
                reason: remarks || null,
                rtoCharges: rtoCharge,
                payload,
            });
            await (0, notifications_service_1.createNotificationService)({
                targetRole: 'user',
                userId: order.user_id,
                title: 'RTO update (Ekart)',
                message: `Order ${order.order_number} status ${statusLower}.`,
            });
            await (0, notifications_service_1.createNotificationService)({
                targetRole: 'admin',
                title: 'RTO event (Ekart)',
                message: `User ${order.user_id} order ${order.order_number} ${statusLower}`,
            });
        }
        catch (err) {
            console.error('❌ Failed to record RTO event (Ekart):', err);
        }
    }
    if (internalStatus === 'delivered' && order.order_type === 'cod') {
        try {
            console.log(`💰 Creating COD remittance for Ekart order ${order.order_number}`);
            const { remittance, created } = await (0, codRemittance_service_1.createCodRemittance)({
                orderId: order.id,
                orderType: 'b2c',
                userId: order.user_id,
                orderNumber: order.order_number,
                awbNumber: order.awb_number || undefined,
                courierPartner: 'Ekart Logistics',
                codAmount: Number(order.order_amount ?? 0),
                codCharges: Number(order.cod_charges ?? 0),
                freightCharges: Number(order.freight_charges ?? order.shipping_charges ?? 0),
                collectedAt: new Date(),
            });
            if (created) {
                await (0, notifications_service_1.createNotificationService)({
                    targetRole: 'admin',
                    title: 'COD remittance created',
                    message: `Order ${order.order_number} (${order.awb_number || 'no AWB'}) created pending COD remittance of ₹${Number(remittance.remittableAmount || 0).toFixed(2)}.`,
                });
            }
            console.log(`✅ COD remittance created for Ekart order ${order.order_number}`);
        }
        catch (err) {
            console.error(`❌ Failed to create COD remittance for Ekart order ${order.order_number}:`, err);
        }
    }
    return { success: true };
}
async function processXpressbeesWebhook(payload, tx = client_1.db) {
    const event = unwrapXpressbeesPayload(payload);
    const awb = event?.awb_number ||
        event?.awb ||
        event?.waybill ||
        event?.tracking_id ||
        event?.trackingId ||
        event?.shipment?.awb_number ||
        event?.shipment?.awb ||
        null;
    const orderRef = event?.order_number ||
        event?.order_id ||
        event?.reference_number ||
        event?.shipment_id ||
        null;
    const statusRaw = event?.current_status ||
        event?.shipment_status ||
        event?.status ||
        event?.event ||
        event?.event_name ||
        event?.scan_status ||
        '';
    const remarks = event?.courier_remarks ||
        event?.remarks ||
        event?.remark ||
        event?.message ||
        event?.description ||
        '';
    const location = event?.current_location ||
        event?.location ||
        event?.scan_location ||
        event?.hub_name ||
        event?.city ||
        null;
    if (!awb && !orderRef)
        return { success: false, reason: 'missing_awb' };
    let order;
    if (awb) {
        ;
        [order] = await tx.select().from(b2cOrders_1.b2c_orders).where((0, drizzle_orm_1.eq)(b2cOrders_1.b2c_orders.awb_number, String(awb)));
    }
    if (!order && orderRef) {
        ;
        [order] = await tx
            .select()
            .from(b2cOrders_1.b2c_orders)
            .where((0, drizzle_orm_1.eq)(b2cOrders_1.b2c_orders.order_number, String(orderRef)));
    }
    if (!order && orderRef) {
        ;
        [order] = await tx.select().from(b2cOrders_1.b2c_orders).where((0, drizzle_orm_1.eq)(b2cOrders_1.b2c_orders.order_id, String(orderRef)));
    }
    if (!order) {
        console.warn(`⚠️ No local order found for Xpressbees AWB ${awb || 'N/A'} ref ${orderRef || 'N/A'}`);
        return { success: false, reason: 'order_not_found' };
    }
    const internalStatus = mapXpressbeesStatus(statusRaw);
    const statusLower = internalStatus.toLowerCase();
    const statusText = statusRaw || internalStatus;
    const updateData = {
        order_status: internalStatus,
        delivery_location: location,
        delivery_message: remarks || null,
        updated_at: new Date(),
    };
    if (event?.courier_cost !== undefined)
        updateData.courier_cost = Number(event.courier_cost);
    if (event?.freight_charges !== undefined && updateData.courier_cost === undefined) {
        updateData.courier_cost = Number(event.freight_charges);
    }
    if (event?.charged_weight !== undefined)
        updateData.charged_weight = Number(event.charged_weight);
    if (event?.chargeable_weight !== undefined && updateData.charged_weight === undefined) {
        updateData.charged_weight = Number(event.chargeable_weight);
    }
    if (event?.volumetric_weight !== undefined) {
        updateData.volumetric_weight = Number(event.volumetric_weight);
    }
    if (event?.actual_weight !== undefined)
        updateData.actual_weight = Number(event.actual_weight);
    if (event?.label)
        updateData.label = String(event.label);
    if (event?.manifest)
        updateData.manifest = String(event.manifest);
    await tx.transaction(async (innerTx) => {
        await innerTx.update(b2cOrders_1.b2c_orders).set(updateData).where((0, drizzle_orm_1.eq)(b2cOrders_1.b2c_orders.id, order.id));
        await (0, shopify_service_1.syncShopifyStatusForLocalOrder)({ ...order, ...updateData }, innerTx).catch((err) => {
            console.warn('⚠️ Failed Shopify status sync for Xpressbees webhook:', err);
        });
        try {
            await (0, trackingEvents_service_1.logTrackingEvent)({
                orderId: order.id,
                userId: order.user_id,
                awbNumber: order.awb_number,
                courier: 'Xpressbees',
                statusCode: internalStatus,
                statusText,
                location,
                raw: payload,
            });
        }
        catch (err) {
            console.error('❌ Failed to log Xpressbees tracking event:', err);
        }
        if (internalStatus === 'booked' || internalStatus === 'pickup_initiated') {
            try {
                const [freshOrder] = await innerTx
                    .select()
                    .from(b2cOrders_1.b2c_orders)
                    .where((0, drizzle_orm_1.eq)(b2cOrders_1.b2c_orders.id, order.id));
                if (!freshOrder)
                    return;
                let invoiceKey = freshOrder.invoice_link;
                let invoiceNumberToStore = freshOrder.invoice_number;
                let invoiceDateToStore = freshOrder.invoice_date;
                let invoiceAmountToStore = freshOrder.invoice_amount;
                if (!invoiceKey) {
                    const invoiceResult = await generateInvoiceForOrderWebhook(freshOrder, innerTx);
                    if (invoiceResult) {
                        invoiceKey = invoiceResult.key;
                        invoiceNumberToStore = invoiceResult.invoiceNumber;
                        invoiceDateToStore = invoiceResult.invoiceDate;
                        invoiceAmountToStore = invoiceResult.invoiceAmount;
                    }
                }
                await innerTx
                    .update(b2cOrders_1.b2c_orders)
                    .set({
                    invoice_link: invoiceKey ?? undefined,
                    invoice_number: invoiceNumberToStore ?? undefined,
                    invoice_date: invoiceDateToStore ?? undefined,
                    invoice_amount: invoiceAmountToStore ?? undefined,
                    updated_at: new Date(),
                })
                    .where((0, drizzle_orm_1.eq)(b2cOrders_1.b2c_orders.id, order.id));
            }
            catch (err) {
                console.error(`❌ Xpressbees invoice flow error for ${order.order_number}:`, err);
            }
        }
    });
    if (['ndr', 'undelivered'].includes(statusLower)) {
        try {
            await (0, ndr_service_1.recordNdrEvent)({
                orderId: order.id,
                userId: order.user_id,
                awbNumber: order.awb_number || undefined,
                status: statusLower,
                reason: remarks || null,
                remarks: statusText || null,
                payload,
            });
            await (0, notifications_service_1.createNotificationService)({
                targetRole: 'user',
                userId: order.user_id,
                title: 'Delivery attempt issue (Xpressbees)',
                message: `Order ${order.order_number} marked as ${statusLower}.`,
            });
            await (0, notifications_service_1.createNotificationService)({
                targetRole: 'admin',
                title: 'NDR captured (Xpressbees)',
                message: `User ${order.user_id} order ${order.order_number} status ${statusLower}`,
            });
        }
        catch (err) {
            console.error('❌ Failed to record NDR event (Xpressbees):', err);
        }
    }
    if (statusLower.includes('rto')) {
        try {
            const rtoCharge = await applyRtoChargeOnce(tx, order, 'Xpressbees');
            await (0, rto_service_1.recordRtoEvent)({
                orderId: order.id,
                userId: order.user_id,
                awbNumber: order.awb_number || undefined,
                status: statusLower,
                reason: remarks || null,
                remarks: statusText || null,
                rtoCharges: rtoCharge,
                payload,
            });
            await (0, notifications_service_1.createNotificationService)({
                targetRole: 'user',
                userId: order.user_id,
                title: 'RTO update (Xpressbees)',
                message: `Order ${order.order_number} status ${statusLower}.`,
            });
            await (0, notifications_service_1.createNotificationService)({
                targetRole: 'admin',
                title: 'RTO event (Xpressbees)',
                message: `User ${order.user_id} order ${order.order_number} ${statusLower}`,
            });
        }
        catch (err) {
            console.error('❌ Failed to record RTO event (Xpressbees):', err);
        }
    }
    if (internalStatus === 'delivered' && order.order_type === 'cod') {
        try {
            const { remittance, created } = await (0, codRemittance_service_1.createCodRemittance)({
                orderId: order.id,
                orderType: 'b2c',
                userId: order.user_id,
                orderNumber: order.order_number,
                awbNumber: order.awb_number || undefined,
                courierPartner: 'Xpressbees',
                codAmount: Number(order.order_amount ?? 0),
                codCharges: Number(order.cod_charges ?? 0),
                freightCharges: Number(order.freight_charges ?? order.shipping_charges ?? 0),
                collectedAt: new Date(),
            });
            if (created) {
                await (0, notifications_service_1.createNotificationService)({
                    targetRole: 'admin',
                    title: 'COD remittance created',
                    message: `Order ${order.order_number} (${order.awb_number || 'no AWB'}) created pending COD remittance of ₹${Number(remittance.remittableAmount || 0).toFixed(2)}.`,
                });
            }
        }
        catch (err) {
            console.error(`❌ Failed to create COD remittance for Xpressbees order ${order.order_number}:`, err);
        }
    }
    if (internalStatus === 'cancelled') {
        await applyCancellationRefundOnce(tx, order, 'xpressbees_webhook');
    }
    return { success: true };
}

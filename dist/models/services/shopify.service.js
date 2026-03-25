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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.syncShopifyStatusForLocalOrder = exports.processShopifyWebhookOrder = exports.verifyShopifyWebhookSignatureForDomain = exports.verifyShopifyWebhookSignature = exports.syncShopifyOrdersForUser = void 0;
const axios_1 = __importDefault(require("axios"));
const crypto = __importStar(require("crypto"));
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../client");
const b2cOrders_1 = require("../schema/b2cOrders");
const stores_1 = require("../schema/stores");
const SHOPIFY_PLATFORM_ID = 1;
const SHOPIFY_API_VERSION = '2024-04';
const toNumber = (value, fallback = 0) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
};
const buildInternalOrderId = (storeId, shopifyOrderId) => {
    const safeStoreId = String(storeId || '').trim();
    const safeOrderId = String(shopifyOrderId || '').trim();
    return `shopify_${safeStoreId}_${safeOrderId}`.slice(0, 100);
};
const parseInternalShopifyOrderId = (localOrderId) => {
    const value = String(localOrderId || '');
    if (!value.startsWith('shopify_'))
        return {};
    const withStoreMatch = value.match(/^shopify_([^_]+)_(.+)$/);
    if (withStoreMatch) {
        return { storeId: withStoreMatch[1], shopifyOrderId: withStoreMatch[2] };
    }
    return { shopifyOrderId: value.replace(/^shopify_/, '') };
};
const normalizeDomain = (domain) => {
    const clean = String(domain || '')
        .trim()
        .toLowerCase()
        .replace(/^https?:\/\//, '')
        .replace(/\/+$/, '');
    return clean;
};
const parseCsvTags = (value) => String(value || '')
    .split(',')
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
const getOrderTagSet = (order) => new Set(String(order?.tags || '')
    .split(',')
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean));
const shouldIncludeByTags = (order, requiredTagsCsv) => {
    const required = parseCsvTags(requiredTagsCsv);
    if (!required.length)
        return true;
    const orderTags = getOrderTagSet(order);
    return required.some((tag) => orderTags.has(tag));
};
const resolveOrderType = (order, settings) => {
    const orderTags = getOrderTagSet(order);
    const codTags = parseCsvTags(settings?.codTags);
    const prepaidTags = parseCsvTags(settings?.prepaidTags);
    if (codTags.length && codTags.some((tag) => orderTags.has(tag)))
        return 'cod';
    if (prepaidTags.length && prepaidTags.some((tag) => orderTags.has(tag)))
        return 'prepaid';
    const gateways = Array.isArray(order?.payment_gateway_names)
        ? order.payment_gateway_names.map((g) => String(g || '').toLowerCase())
        : [];
    const codGateway = gateways.some((g) => g.includes('cod') || g.includes('cash'));
    if (codGateway)
        return 'cod';
    return String(order?.financial_status || '').toLowerCase() === 'paid' ? 'prepaid' : 'cod';
};
const mapShopifyStatus = (order) => {
    if (order?.cancelled_at)
        return 'cancelled';
    const fulfillmentStatus = String(order?.fulfillment_status || '').toLowerCase();
    if (fulfillmentStatus === 'fulfilled')
        return 'delivered';
    if (fulfillmentStatus === 'partial')
        return 'in_transit';
    return 'pending';
};
const normalizeFulfillTrigger = (value) => {
    const trigger = String(value || 'do_not_fulfill').trim().toLowerCase();
    if (trigger === 'order_booked' ||
        trigger === 'order_in_transit' ||
        trigger === 'order_out_for_delivery' ||
        trigger === 'order_delivered') {
        return trigger;
    }
    return 'do_not_fulfill';
};
const statusPriority = {
    booked: 1,
    pickup_initiated: 1,
    in_transit: 2,
    out_for_delivery: 3,
    delivered: 4,
};
const triggerPriority = {
    do_not_fulfill: Number.MAX_SAFE_INTEGER,
    order_booked: 1,
    order_in_transit: 2,
    order_out_for_delivery: 3,
    order_delivered: 4,
};
const shouldAttemptFulfillment = (orderStatus, trigger) => {
    const normalizedTrigger = normalizeFulfillTrigger(trigger);
    if (normalizedTrigger === 'do_not_fulfill')
        return false;
    const orderLevel = statusPriority[String(orderStatus || '').toLowerCase()] || 0;
    return orderLevel >= triggerPriority[normalizedTrigger];
};
const shouldNotifyCustomerOnFulfill = (settings) => {
    const value = String(settings?.customerNotifyOnFulfill ?? settings?.notifyCustomerOnFulfill ?? settings?.notifyOnFulfill ?? '')
        .trim()
        .toLowerCase();
    return ['notify', 'notify_customer', 'yes', 'true', '1'].includes(value);
};
const mapProducts = (order) => {
    const items = Array.isArray(order?.line_items) ? order.line_items : [];
    return items.map((item) => {
        const qty = Math.max(1, toNumber(item?.quantity, 1));
        const price = toNumber(item?.price, 0);
        const discount = Array.isArray(item?.discount_allocations)
            ? item.discount_allocations.reduce((sum, d) => sum + toNumber(d?.amount, 0), 0)
            : 0;
        const lineTaxRate = Array.isArray(item?.tax_lines)
            ? item.tax_lines.reduce((sum, t) => sum + toNumber(t?.rate, 0), 0) * 100
            : 0;
        return {
            name: item?.name || item?.title || 'Item',
            sku: item?.sku || 'NA',
            qty,
            price,
            discount,
            tax_rate: lineTaxRate,
            hsn: '',
        };
    });
};
const toPhone = (order) => {
    const phone = order?.phone ||
        order?.shipping_address?.phone ||
        order?.billing_address?.phone ||
        order?.customer?.phone ||
        '';
    const clean = String(phone).replace(/[^\d+]/g, '').trim();
    return clean || '0000000000';
};
const getStoreForUser = async (userId, storeId, tx = client_1.db) => {
    const whereClause = storeId
        ? (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(stores_1.stores.userId, userId), (0, drizzle_orm_1.eq)(stores_1.stores.platformId, SHOPIFY_PLATFORM_ID), (0, drizzle_orm_1.eq)(stores_1.stores.id, String(storeId)))
        : (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(stores_1.stores.userId, userId), (0, drizzle_orm_1.eq)(stores_1.stores.platformId, SHOPIFY_PLATFORM_ID));
    const [store] = await tx.select().from(stores_1.stores).where(whereClause).limit(1);
    return store;
};
const getStoresForUser = async (userId, tx = client_1.db) => {
    const rows = await tx
        .select()
        .from(stores_1.stores)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(stores_1.stores.userId, userId), (0, drizzle_orm_1.eq)(stores_1.stores.platformId, SHOPIFY_PLATFORM_ID)));
    return rows;
};
const getStoreByDomain = async (domain, tx = client_1.db) => {
    const [store] = await tx
        .select()
        .from(stores_1.stores)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(stores_1.stores.domain, normalizeDomain(domain)), (0, drizzle_orm_1.eq)(stores_1.stores.platformId, SHOPIFY_PLATFORM_ID)))
        .limit(1);
    return store;
};
const fetchShopifyOrders = async (store, limit = 50) => {
    const base = `https://${normalizeDomain(store.domain)}/admin/api/${SHOPIFY_API_VERSION}`;
    const res = await axios_1.default.get(`${base}/orders.json`, {
        headers: {
            'X-Shopify-Access-Token': String(store.adminApiAccessToken || '').trim(),
            'Content-Type': 'application/json',
        },
        params: { status: 'any', limit },
        timeout: 30000,
    });
    return Array.isArray(res?.data?.orders) ? res.data.orders : [];
};
const upsertFromShopifyOrder = async (store, order, settings, tx = client_1.db) => {
    if (!order?.id)
        return 'skipped';
    if (!shouldIncludeByTags(order, settings?.orderTagsToFetch))
        return 'skipped';
    const shopifyOrderId = String(order.id);
    const internalOrderId = buildInternalOrderId(String(store.id), shopifyOrderId);
    const legacyInternalOrderId = `shopify_${shopifyOrderId}`;
    const orderType = resolveOrderType(order, settings);
    const mappedStatus = mapShopifyStatus(order);
    const shippingAddress = order?.shipping_address || order?.billing_address || {};
    const shippingCharges = Array.isArray(order?.shipping_lines)
        ? order.shipping_lines.reduce((sum, s) => sum + toNumber(s?.price, 0), 0)
        : 0;
    const products = mapProducts(order);
    const totalWeightGrams = (Array.isArray(order?.line_items) ? order.line_items : []).reduce((sum, item) => sum + toNumber(item?.grams, 0) * Math.max(1, toNumber(item?.quantity, 1)), 0);
    const declaredWeight = totalWeightGrams > 0 ? totalWeightGrams : 500;
    const orderAmount = toNumber(order?.total_price, 0);
    const orderName = String(order?.name || order?.order_number || shopifyOrderId).trim();
    const updatePayload = {
        user_id: store.userId,
        order_number: orderName.slice(0, 50),
        order_date: String(order?.created_at || new Date().toISOString()).slice(0, 50),
        order_amount: orderAmount,
        order_id: internalOrderId,
        invoice_number: order?.name ? String(order.name).slice(0, 100) : null,
        invoice_date: order?.created_at ? String(order.created_at).slice(0, 50) : null,
        invoice_amount: orderAmount,
        buyer_name: String(shippingAddress?.name || order?.customer?.first_name || order?.email || 'Shopify Customer').slice(0, 255),
        buyer_phone: toPhone(order).slice(0, 20),
        buyer_email: String(order?.email || '').slice(0, 255) || null,
        address: String(shippingAddress?.address1 || shippingAddress?.address2 || 'Address not provided').slice(0, 500),
        city: String(shippingAddress?.city || 'NA').slice(0, 100),
        state: String(shippingAddress?.province || shippingAddress?.province_code || 'NA').slice(0, 100),
        country: String(shippingAddress?.country || 'India').slice(0, 100),
        pincode: String(shippingAddress?.zip || '000000').slice(0, 20),
        products: products.length ? products : [{ name: 'Item', sku: 'NA', qty: 1, price: orderAmount }],
        weight: declaredWeight,
        length: 10,
        breadth: 10,
        height: 10,
        order_type: orderType,
        prepaid_amount: orderType === 'prepaid' ? orderAmount : 0,
        cod_charges: 0,
        shipping_charges: shippingCharges,
        transaction_fee: 0,
        gift_wrap: 0,
        discount: 0,
        order_status: mappedStatus,
        courier_partner: 'Shopify',
        integration_type: 'shopify',
        is_external_api: false,
        tags: String(order?.tags || '').slice(0, 200) || `shopify_store:${store.id}`,
        updated_at: new Date(),
    };
    const [existing] = await tx
        .select({ id: b2cOrders_1.b2c_orders.id })
        .from(b2cOrders_1.b2c_orders)
        .where((0, drizzle_orm_1.eq)(b2cOrders_1.b2c_orders.order_id, internalOrderId))
        .limit(1);
    const [legacyExisting] = existing
        ? [undefined]
        : await tx
            .select({ id: b2cOrders_1.b2c_orders.id })
            .from(b2cOrders_1.b2c_orders)
            .where((0, drizzle_orm_1.eq)(b2cOrders_1.b2c_orders.order_id, legacyInternalOrderId))
            .limit(1);
    if (existing?.id || legacyExisting?.id) {
        const targetId = existing?.id || legacyExisting?.id;
        await tx
            .update(b2cOrders_1.b2c_orders)
            .set({ ...updatePayload, order_id: internalOrderId })
            .where((0, drizzle_orm_1.eq)(b2cOrders_1.b2c_orders.id, targetId));
        return 'updated';
    }
    await tx.insert(b2cOrders_1.b2c_orders).values({
        ...updatePayload,
        created_at: new Date(),
    });
    return 'created';
};
const syncShopifyOrdersForUser = async (userId, limit = 50, storeId, tx = client_1.db) => {
    const storesToSync = storeId ? [await getStoreForUser(userId, storeId, tx)].filter(Boolean) : await getStoresForUser(userId, tx);
    if (!storesToSync.length) {
        throw new Error('No connected Shopify store found for this user');
    }
    const result = { created: 0, updated: 0, skipped: 0 };
    for (const store of storesToSync) {
        const orders = await fetchShopifyOrders(store, limit);
        const settings = store?.settings || {};
        for (const order of orders) {
            const state = await upsertFromShopifyOrder(store, order, settings, tx);
            result[state] += 1;
        }
    }
    return result;
};
exports.syncShopifyOrdersForUser = syncShopifyOrdersForUser;
const verifyShopifyWebhookSignature = (rawBody, receivedHmac) => {
    const secret = process.env.SHOPIFY_WEBHOOK_SECRET;
    if (!secret) {
        throw new Error('SHOPIFY_WEBHOOK_SECRET is not configured');
    }
    return verifyShopifyWebhookSignatureWithSecret(rawBody, receivedHmac, secret);
};
exports.verifyShopifyWebhookSignature = verifyShopifyWebhookSignature;
const verifyShopifyWebhookSignatureWithSecret = (rawBody, receivedHmac, secret) => {
    const digest = crypto.createHmac('sha256', secret).update(rawBody).digest('base64');
    const a = Buffer.from(digest);
    const b = Buffer.from(String(receivedHmac || ''));
    if (a.length !== b.length)
        return false;
    return crypto.timingSafeEqual(a, b);
};
const getStoreWebhookSecret = (store) => {
    const metadata = (store?.metadata || {});
    const candidates = [
        metadata.shopifyWebhookSecret,
        metadata.webhookSecret,
        metadata.apiSecret,
        metadata.apiSecretKey,
        process.env.SHOPIFY_WEBHOOK_SECRET,
    ];
    for (const candidate of candidates) {
        const val = String(candidate || '').trim();
        if (val)
            return val;
    }
    return '';
};
const verifyShopifyWebhookSignatureForDomain = async (rawBody, receivedHmac, shopDomain, tx = client_1.db) => {
    const store = await getStoreByDomain(shopDomain, tx);
    if (!store)
        return false;
    const secret = getStoreWebhookSecret(store);
    if (!secret)
        return false;
    return verifyShopifyWebhookSignatureWithSecret(rawBody, receivedHmac, secret);
};
exports.verifyShopifyWebhookSignatureForDomain = verifyShopifyWebhookSignatureForDomain;
const processShopifyWebhookOrder = async (shopDomain, topic, payload, tx = client_1.db) => {
    const store = await getStoreByDomain(shopDomain, tx);
    if (!store) {
        return { success: false, reason: 'store_not_found' };
    }
    const settings = store?.settings || {};
    const normalizedTopic = String(topic || '').toLowerCase();
    if (normalizedTopic.includes('orders/create') || normalizedTopic.includes('orders/updated')) {
        const action = await upsertFromShopifyOrder(store, payload, settings, tx);
        return { success: true, action };
    }
    if (normalizedTopic.includes('orders/cancelled')) {
        const internalOrderId = buildInternalOrderId(String(store.id), String(payload?.id || ''));
        const legacyOrderId = `shopify_${String(payload?.id || '')}`;
        if (!payload?.id)
            return { success: false, reason: 'missing_order_id' };
        await tx
            .update(b2cOrders_1.b2c_orders)
            .set({ order_status: 'cancelled', updated_at: new Date() })
            .where((0, drizzle_orm_1.eq)(b2cOrders_1.b2c_orders.order_id, internalOrderId));
        await tx
            .update(b2cOrders_1.b2c_orders)
            .set({ order_status: 'cancelled', updated_at: new Date() })
            .where((0, drizzle_orm_1.eq)(b2cOrders_1.b2c_orders.order_id, legacyOrderId));
        return { success: true, action: 'cancelled' };
    }
    return { success: true, action: 'ignored_topic' };
};
exports.processShopifyWebhookOrder = processShopifyWebhookOrder;
const syncShopifyStatusForLocalOrder = async (order, tx = client_1.db) => {
    const localOrderId = String(order?.order_id || '');
    if (!localOrderId.startsWith('shopify_'))
        return;
    const parsed = parseInternalShopifyOrderId(localOrderId);
    const shopifyOrderId = parsed.shopifyOrderId || '';
    if (!shopifyOrderId)
        return;
    const store = await getStoreForUser(order.user_id, parsed.storeId, tx);
    if (!store)
        return;
    const settings = store?.settings || {};
    const base = `https://${normalizeDomain(store.domain)}/admin/api/${SHOPIFY_API_VERSION}`;
    const headers = {
        'X-Shopify-Access-Token': String(store.adminApiAccessToken || '').trim(),
        'Content-Type': 'application/json',
    };
    const orderStatus = String(order?.order_status || '').toLowerCase();
    try {
        if (shouldAttemptFulfillment(orderStatus, settings?.fulfillTrigger)) {
            const [shopifyOrderRes, fulfillmentOrdersRes] = await Promise.all([
                axios_1.default.get(`${base}/orders/${shopifyOrderId}.json`, {
                    headers,
                    params: { fields: 'id,fulfillment_status' },
                    timeout: 20000,
                }),
                axios_1.default.get(`${base}/orders/${shopifyOrderId}/fulfillment_orders.json`, {
                    headers,
                    timeout: 20000,
                }),
            ]);
            const shopifyOrder = shopifyOrderRes?.data?.order || {};
            const isAlreadyFulfilled = String(shopifyOrder?.fulfillment_status || '').toLowerCase() === 'fulfilled';
            const allFulfillmentOrders = Array.isArray(fulfillmentOrdersRes?.data?.fulfillment_orders)
                ? fulfillmentOrdersRes.data.fulfillment_orders
                : [];
            const openFulfillmentOrders = allFulfillmentOrders.filter((fo) => {
                const foStatus = String(fo?.status || '').toLowerCase();
                const reqStatus = String(fo?.request_status || '').toLowerCase();
                return foStatus === 'open' && (!reqStatus || reqStatus === 'unsubmitted' || reqStatus === 'submitted');
            });
            if (!isAlreadyFulfilled && openFulfillmentOrders.length) {
                const trackingNumber = String(order?.awb_number || '').trim();
                const fulfillmentPayload = {
                    fulfillment: {
                        line_items_by_fulfillment_order: openFulfillmentOrders.map((fo) => ({
                            fulfillment_order_id: fo.id,
                        })),
                        notify_customer: shouldNotifyCustomerOnFulfill(settings),
                    },
                };
                if (trackingNumber) {
                    fulfillmentPayload.fulfillment.tracking_info = {
                        number: trackingNumber,
                        company: String(order?.courier_partner || 'DelExpress').slice(0, 255),
                    };
                }
                await axios_1.default.post(`${base}/fulfillments.json`, fulfillmentPayload, { headers, timeout: 20000 });
            }
        }
        if (settings?.autoUpdateShipmentStatus) {
            const existingTags = String(order?.tags || '');
            const cleanTags = existingTags
                .split(',')
                .map((t) => t.trim())
                .filter(Boolean)
                .filter((t) => !/^mcw_status:/i.test(t));
            cleanTags.push(`mcw_status:${orderStatus}`);
            await axios_1.default.put(`${base}/orders/${shopifyOrderId}.json`, {
                order: {
                    id: Number(shopifyOrderId),
                    tags: cleanTags.join(', '),
                },
            }, { headers, timeout: 20000 });
        }
        if (settings?.autoCancelOrders && orderStatus === 'cancelled') {
            await axios_1.default.post(`${base}/orders/${shopifyOrderId}/cancel.json`, { reason: 'other', email: false }, { headers, timeout: 20000 });
        }
        if (settings?.markCodPaidOnDelivery &&
            String(order?.order_type || '').toLowerCase() === 'cod' &&
            orderStatus === 'delivered') {
            const amount = toNumber(order?.order_amount, 0);
            if (amount > 0) {
                await axios_1.default.post(`${base}/orders/${shopifyOrderId}/transactions.json`, {
                    transaction: {
                        kind: 'capture',
                        status: 'success',
                        amount: amount.toFixed(2),
                        currency: 'INR',
                    },
                }, { headers, timeout: 20000 });
            }
        }
    }
    catch (err) {
        console.warn(`⚠️ Shopify status sync failed for local order ${order?.order_number || order?.id}:`, err?.response?.data || err?.message || err);
    }
};
exports.syncShopifyStatusForLocalOrder = syncShopifyStatusForLocalOrder;

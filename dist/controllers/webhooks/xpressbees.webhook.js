"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.xpressbeesWebhookHandler = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const crypto_1 = __importDefault(require("crypto"));
const client_1 = require("../../models/client");
const webhookProcessor_1 = require("../../models/services/webhookProcessor");
const courierCredentials_1 = require("../../models/schema/courierCredentials");
const schema_1 = require("../../schema/schema");
const XPRESSBEES_WEBHOOK_SECRET_HEADERS = [
    'x-xpressbees-webhook-secret',
    'x-xpressbees-webhook-signature',
    'x-xpressbees-signature',
    'x-webhook-secret',
    'x-webhook-signature',
    'authorization',
];
const findSecretHeader = (headers) => {
    const normalized = headers;
    for (const header of XPRESSBEES_WEBHOOK_SECRET_HEADERS) {
        const value = normalized[header] || normalized[header.toLowerCase()];
        if (!value)
            continue;
        if (Array.isArray(value) && value.length)
            return String(value[0]).trim();
        if (typeof value === 'string' && value.trim())
            return value.trim();
    }
    return '';
};
const fetchXpressbeesWebhookSecret = async () => {
    try {
        const [row] = await client_1.db
            .select({
            webhookSecret: courierCredentials_1.courier_credentials.webhookSecret,
        })
            .from(courierCredentials_1.courier_credentials)
            .where((0, drizzle_orm_1.eq)(courierCredentials_1.courier_credentials.provider, 'xpressbees'))
            .limit(1);
        return (row?.webhookSecret || '').trim();
    }
    catch (err) {
        console.error('❌ Failed to load Xpressbees webhook secret:', err?.message || err);
        return '';
    }
};
const extractEventPayload = (payload) => {
    if (Array.isArray(payload?.data) && payload.data.length > 0)
        return payload.data[0];
    if (payload?.data && typeof payload.data === 'object' && !Array.isArray(payload.data)) {
        return payload.data;
    }
    return payload;
};
const xpressbeesWebhookHandler = async (req, res) => {
    const timestamp = new Date().toISOString();
    const payload = req.body;
    const configuredSecret = await fetchXpressbeesWebhookSecret();
    const receivedSecret = findSecretHeader(req.headers);
    const rawBody = req.rawBody || (req.body ? JSON.stringify(req.body) : '');
    const event = extractEventPayload(payload);
    const awb = event?.awb_number ||
        event?.awb ||
        event?.waybill ||
        event?.tracking_id ||
        event?.trackingId ||
        null;
    const status = event?.current_status ||
        event?.shipment_status ||
        event?.status ||
        event?.event ||
        event?.event_name ||
        'unknown';
    console.log('='.repeat(80));
    console.log(`📦 [${timestamp}] Xpressbees Webhook Received`);
    console.log(`   AWB: ${awb || 'N/A'}`);
    console.log(`   Status: ${status}`);
    console.log(`   IP: ${req.ip || req.socket.remoteAddress || 'unknown'}`);
    console.log(`   Headers:`, JSON.stringify(req.headers, null, 2));
    console.log(`   Full Payload:`, JSON.stringify(payload, null, 2));
    console.log('='.repeat(80));
    try {
        if (configuredSecret) {
            if (!receivedSecret) {
                console.warn('⚠️ Xpressbees webhook missing signature/secret header');
                return res.status(401).json({ success: false, message: 'missing webhook secret' });
            }
            const normalizedHeader = receivedSecret.startsWith('Bearer ')
                ? receivedSecret.slice('Bearer '.length).trim()
                : receivedSecret;
            const expectedHmac = 'sha256=' + crypto_1.default.createHmac('sha256', configuredSecret).update(rawBody).digest('hex');
            const candidateValues = [
                normalizedHeader,
                normalizedHeader.startsWith('sha256=') ? normalizedHeader : `sha256=${normalizedHeader}`,
            ];
            const matchesRawSecret = candidateValues.some((value) => value === configuredSecret);
            const matchesHmac = candidateValues.some((value) => {
                const expectedBuf = Buffer.from(expectedHmac);
                const providedBuf = Buffer.from(value);
                return expectedBuf.length === providedBuf.length && crypto_1.default.timingSafeEqual(expectedBuf, providedBuf);
            });
            if (!matchesRawSecret && !matchesHmac) {
                console.warn('⚠️ Xpressbees webhook rejected: invalid secret/signature');
                return res.status(401).json({ success: false, message: 'invalid webhook secret' });
            }
        }
        const result = await (0, webhookProcessor_1.processXpressbeesWebhook)(payload);
        if (!result.success && result.reason === 'missing_awb') {
            return res.status(400).json({ success: false, message: 'Missing AWB/order reference' });
        }
        if (!result.success && result.reason === 'order_not_found') {
            const dedupeWindowStart = new Date(Date.now() - 10 * 60 * 1000);
            const [existingPending] = await client_1.db
                .select({ id: schema_1.pending_webhooks.id })
                .from(schema_1.pending_webhooks)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.pending_webhooks.awb_number, String(awb || 'unknown')), (0, drizzle_orm_1.eq)(schema_1.pending_webhooks.status, `xpressbees:${String(status || 'unknown')}`), (0, drizzle_orm_1.isNull)(schema_1.pending_webhooks.processed_at), (0, drizzle_orm_1.gte)(schema_1.pending_webhooks.created_at, dedupeWindowStart)))
                .limit(1);
            if (!existingPending) {
                await client_1.db.insert(schema_1.pending_webhooks).values({
                    awb_number: awb || null,
                    status: `xpressbees:${String(status || 'unknown')}`,
                    payload: {
                        __provider: 'xpressbees',
                        body: payload,
                    },
                });
                console.warn(`⚠️ Stored Xpressbees webhook for AWB ${awb || 'N/A'} (order not yet created).`);
            }
            else {
                console.warn(`⚠️ Duplicate pending Xpressbees webhook skipped for AWB ${awb || 'N/A'} (within dedupe window).`);
            }
            return res.status(202).json({ success: true, queued: true });
        }
        if (!result.success) {
            return res.status(202).json({ success: false, reason: result.reason });
        }
        return res.status(200).json({ success: true });
    }
    catch (err) {
        console.error('❌ Xpressbees webhook processing failed:', err?.message || err);
        return res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
};
exports.xpressbeesWebhookHandler = xpressbeesWebhookHandler;

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.delhiveryUplStatusController = exports.ndrBulkActionController = exports.delhiveryPickupRescheduleController = exports.ndrChangePhoneController = exports.ndrChangeAddressController = exports.ndrReattemptController = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../models/client");
const b2cOrders_1 = require("../models/schema/b2cOrders");
const ndr_1 = require("../models/schema/ndr");
const delhivery_service_1 = require("../models/services/couriers/delhivery.service");
const ekart_service_1 = require("../models/services/couriers/ekart.service");
const xpressbees_service_1 = require("../models/services/couriers/xpressbees.service");
const ndr_service_1 = require("../models/services/ndr.service");
// Provider values are trusted from orders (integration_type: 'delhivery')
const hasDelhiveryActionAccepted = (resp) => {
    if (!resp)
        return false;
    if (resp.success === true || resp.Success === true || resp.status === true)
        return true;
    const status = String(resp.status || resp.Status || '').toLowerCase();
    if (status.includes('success') || status.includes('accepted') || status.includes('queued')) {
        return true;
    }
    const message = String(resp.message || resp.remark || '').toLowerCase();
    if (message.includes('success') || message.includes('accepted') || message.includes('queued')) {
        return true;
    }
    if (resp.upl || resp.upl_id || resp.Upl || resp.UPL)
        return true;
    if (Array.isArray(resp.data) && resp.data.length > 0) {
        const allAccepted = resp.data.every((item) => {
            if (item?.success === true || item?.status === true)
                return true;
            const s = String(item?.status || item?.Status || '').toLowerCase();
            const m = String(item?.message || item?.remark || '').toLowerCase();
            return (s.includes('success') ||
                s.includes('accepted') ||
                s.includes('queued') ||
                m.includes('success') ||
                m.includes('accepted') ||
                m.includes('queued'));
        });
        if (allAccepted)
            return true;
    }
    return false;
};
const hasXpressbeesActionAccepted = (resp) => {
    if (!resp)
        return false;
    const rows = Array.isArray(resp) ? resp : Array.isArray(resp?.data) ? resp.data : [resp];
    return rows.every((item) => {
        if (item?.status === true)
            return true;
        const message = String(item?.message || item?.remark || '').toLowerCase();
        return message.includes('success');
    });
};
/**
 * POST /ndr/reattempt
 * Body: { orderId?: string, awb?: string, nextAttemptDate: string (YYYY-MM-DD), comments?: string, alternateAddress?, alternateNumber? }
 */
const ndrReattemptController = async (req, res) => {
    try {
        const { orderId, awb, nextAttemptDate, comments, alternateAddress, alternateNumber } = req.body;
        if (!orderId && !awb) {
            return res.status(400).json({ success: false, message: 'Provide orderId or awb' });
        }
        if (!nextAttemptDate) {
            return res.status(400).json({ success: false, message: 'nextAttemptDate is required' });
        }
        // Fetch order
        const where = orderId
            ? (0, drizzle_orm_1.eq)(b2cOrders_1.b2c_orders.id, orderId)
            : (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(b2cOrders_1.b2c_orders.awb_number, awb));
        const [order] = await client_1.db.select().from(b2cOrders_1.b2c_orders).where(where);
        if (!order) {
            return res.status(404).json({ success: false, message: 'Order not found' });
        }
        // Eligibility checks from latest NDR event
        try {
            const awbLookup = awb || order.awb_number;
            if (awbLookup) {
                const rows = await client_1.db
                    .select()
                    .from(ndr_1.ndr_events)
                    .where((0, drizzle_orm_1.eq)(ndr_1.ndr_events.awb_number, awbLookup))
                    .orderBy((0, drizzle_orm_1.desc)(ndr_1.ndr_events.created_at))
                    .limit(1);
                const last = rows?.[0];
                const statusLower = String(last?.status || '').toLowerCase();
                const attempts = last?.attempt_no ? parseInt(String(last.attempt_no), 10) || 0 : 0;
                if (statusLower.includes('nsl')) {
                    return res
                        .status(400)
                        .json({ success: false, message: 'Cannot reattempt: Not serviceable (NSL)' });
                }
                if (attempts >= 3) {
                    return res.status(400).json({
                        success: false,
                        message: 'Cannot reattempt: Maximum delivery attempts reached',
                    });
                }
            }
        }
        catch (e) {
            // do not block on eligibility read error, just log
            console.warn('Eligibility read failed for reattempt:', e);
        }
        // Use integration_type as provided by orders
        let provider = (order.integration_type || '').toString().trim().toLowerCase();
        if (!provider) {
            return res.status(400).json({ success: false, message: 'Missing integration_type on order.' });
        }
        // Branch by provider
        if (provider === 'delhivery' || provider === 'delhivyery') {
            const delhivery = new delhivery_service_1.DelhiveryService();
            const wb = awb || order.awb_number;
            if (!wb)
                return res.status(400).json({ success: false, message: 'AWB is required' });
            const resp = await delhivery.submitNdrAction([
                {
                    waybill: wb,
                    act: 'RE-ATTEMPT',
                    action_data: {
                        next_attempt_date: nextAttemptDate,
                        ...(comments ? { comments } : {}),
                        ...(alternateAddress ? { alternate_address: alternateAddress } : {}),
                        ...(alternateNumber ? { alternate_number: alternateNumber } : {}),
                    },
                },
            ]);
            if (!hasDelhiveryActionAccepted(resp)) {
                return res.status(502).json({
                    success: false,
                    message: 'Delhivery did not accept reattempt action',
                    data: resp,
                });
            }
            await (0, ndr_service_1.recordNdrEvent)({
                orderId: order.id,
                userId: order.user_id,
                awbNumber: order.awb_number || undefined,
                status: 'ndr_action',
                remarks: 'reattempt',
                payload: { provider: provider, action: 'RE-ATTEMPT', response: resp },
            });
            return res.status(200).json({ success: true, data: resp });
        }
        if (provider === 'xpressbees') {
            const xpressbees = new xpressbees_service_1.XpressbeesService();
            const wb = awb || order.awb_number;
            if (!wb)
                return res.status(400).json({ success: false, message: 'AWB is required' });
            const resp = await xpressbees.submitNdrAction([
                {
                    awb: wb,
                    action: 're-attempt',
                    action_data: {
                        re_attempt_date: nextAttemptDate,
                    },
                },
            ]);
            if (!hasXpressbeesActionAccepted(resp)) {
                return res.status(502).json({
                    success: false,
                    message: 'Xpressbees did not accept reattempt action',
                    data: resp,
                });
            }
            await (0, ndr_service_1.recordNdrEvent)({
                orderId: order.id,
                userId: order.user_id,
                awbNumber: order.awb_number || undefined,
                status: 'ndr_action',
                remarks: 'reattempt',
                payload: { provider: 'xpressbees', action: 're-attempt', response: resp },
            });
            return res.status(200).json({ success: true, data: resp });
        }
        return res.status(400).json({ success: false, message: `Unsupported provider: ${provider}` });
    }
    catch (err) {
        console.error('NDR Reattempt error:', err);
        return res.status(500).json({ success: false, message: err.message || 'Internal error' });
    }
};
exports.ndrReattemptController = ndrReattemptController;
/**
 * POST /ndr/change-address
 * Body: { orderId?: string, awb?: string, name?, address_1: string, address_2?, pincode?: string }
 */
const ndrChangeAddressController = async (req, res) => {
    try {
        const { orderId, awb, name, address_1, address_2, pincode } = req.body;
        if (!orderId && !awb) {
            return res.status(400).json({ success: false, message: 'Provide orderId or awb' });
        }
        if (!address_1) {
            return res.status(400).json({ success: false, message: 'address_1 is required' });
        }
        const where = orderId
            ? (0, drizzle_orm_1.eq)(b2cOrders_1.b2c_orders.id, orderId)
            : (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(b2cOrders_1.b2c_orders.awb_number, awb));
        const [order] = await client_1.db.select().from(b2cOrders_1.b2c_orders).where(where);
        if (!order)
            return res.status(404).json({ success: false, message: 'Order not found' });
        // Eligibility checks (NSL)
        try {
            const awbLookup = awb || order.awb_number;
            if (awbLookup) {
                const rows = await client_1.db
                    .select()
                    .from(ndr_1.ndr_events)
                    .where((0, drizzle_orm_1.eq)(ndr_1.ndr_events.awb_number, awbLookup))
                    .orderBy((0, drizzle_orm_1.desc)(ndr_1.ndr_events.created_at))
                    .limit(1);
                const last = rows?.[0];
                const statusLower = String(last?.status || '').toLowerCase();
                if (statusLower.includes('nsl')) {
                    return res
                        .status(400)
                        .json({ success: false, message: 'Cannot change address: Not serviceable (NSL)' });
                }
            }
        }
        catch (e) {
            console.warn('Eligibility read failed for change-address:', e);
        }
        let provider = (order.integration_type || '').toString().trim().toLowerCase();
        if (!provider)
            return res.status(400).json({ success: false, message: 'Missing integration_type on order.' });
        // Branch by provider
        if (provider === 'delhivery' || provider === 'delhivyery') {
            const delhivery = new delhivery_service_1.DelhiveryService();
            const wb = awb || order.awb_number;
            if (!wb)
                return res.status(400).json({ success: false, message: 'AWB is required' });
            const resp = await delhivery.submitNdrAction([
                {
                    waybill: wb,
                    act: 'EDIT_DETAILS',
                    action_data: {
                        ...(name ? { name } : {}),
                        add: [address_1, address_2].filter(Boolean).join(', '),
                        ...(pincode ? { pin: String(pincode) } : {}),
                    },
                },
            ]);
            if (!hasDelhiveryActionAccepted(resp)) {
                return res.status(502).json({
                    success: false,
                    message: 'Delhivery did not accept change-address action',
                    data: resp,
                });
            }
            await (0, ndr_service_1.recordNdrEvent)({
                orderId: order.id,
                userId: order.user_id,
                awbNumber: order.awb_number || undefined,
                status: 'ndr_action',
                remarks: 'change-address',
                payload: { provider: 'delhivery', action: 'EDIT_DETAILS', response: resp },
            });
            return res.status(200).json({ success: true, data: resp });
        }
        if (provider === 'ekart') {
            const ekart = new ekart_service_1.EkartService();
            const wb = awb || order.awb_number;
            if (!wb)
                return res.status(400).json({ success: false, message: 'AWB is required' });
            const addressString = [address_1, address_2].filter(Boolean).join(', ');
            const remarksParts = [];
            if (name)
                remarksParts.push(`Name: ${name}`);
            if (pincode)
                remarksParts.push(`Pin: ${pincode}`);
            const remarks = remarksParts.filter(Boolean).join(' | ') || undefined;
            const payload = {
                waybill: wb,
                action: 'EDIT_DETAILS',
            };
            if (addressString)
                payload.alternate_address = addressString;
            if (remarks)
                payload.remarks = remarks;
            const resp = await ekart.submitNdrAction(payload);
            if (!hasDelhiveryActionAccepted(resp)) {
                return res.status(502).json({
                    success: false,
                    message: 'Ekart did not accept change-address action',
                    data: resp,
                });
            }
            await (0, ndr_service_1.recordNdrEvent)({
                orderId: order.id,
                userId: order.user_id,
                awbNumber: order.awb_number || undefined,
                status: 'ndr_action',
                remarks: 'change-address',
                payload: { provider: 'ekart', action: 'EDIT_DETAILS', response: resp },
            });
            return res.status(200).json({ success: true, data: resp });
        }
        if (provider === 'xpressbees') {
            const xpressbees = new xpressbees_service_1.XpressbeesService();
            const wb = awb || order.awb_number;
            if (!wb)
                return res.status(400).json({ success: false, message: 'AWB is required' });
            const resp = await xpressbees.submitNdrAction([
                {
                    awb: wb,
                    action: 'change_address',
                    action_data: {
                        name: name || order.buyer_name || '',
                        address_1,
                        ...(address_2 ? { address_2 } : {}),
                    },
                },
            ]);
            if (!hasXpressbeesActionAccepted(resp)) {
                return res.status(502).json({
                    success: false,
                    message: 'Xpressbees did not accept change-address action',
                    data: resp,
                });
            }
            await (0, ndr_service_1.recordNdrEvent)({
                orderId: order.id,
                userId: order.user_id,
                awbNumber: order.awb_number || undefined,
                status: 'ndr_action',
                remarks: 'change-address',
                payload: { provider: 'xpressbees', action: 'change_address', response: resp },
            });
            return res.status(200).json({ success: true, data: resp });
        }
        return res.status(400).json({ success: false, message: `Unsupported provider: ${provider}` });
    }
    catch (err) {
        console.error('NDR Change Address error:', err);
        return res.status(500).json({ success: false, message: err.message || 'Internal error' });
    }
};
exports.ndrChangeAddressController = ndrChangeAddressController;
/**
 * POST /ndr/change-phone
 * Body: { orderId?: string, awb?: string, phone: string }
 */
const ndrChangePhoneController = async (req, res) => {
    try {
        const { orderId, awb, phone } = req.body;
        if (!orderId && !awb) {
            return res.status(400).json({ success: false, message: 'Provide orderId or awb' });
        }
        if (!phone || !/^[0-9]{10,}$/.test(String(phone))) {
            return res
                .status(400)
                .json({ success: false, message: 'Valid phone (10+ digits) is required' });
        }
        const where = orderId
            ? (0, drizzle_orm_1.eq)(b2cOrders_1.b2c_orders.id, orderId)
            : (0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(b2cOrders_1.b2c_orders.awb_number, awb));
        const [order] = await client_1.db.select().from(b2cOrders_1.b2c_orders).where(where);
        if (!order)
            return res.status(404).json({ success: false, message: 'Order not found' });
        // Eligibility checks (NSL)
        try {
            const awbLookup = awb || order.awb_number;
            if (awbLookup) {
                const rows = await client_1.db
                    .select()
                    .from(ndr_1.ndr_events)
                    .where((0, drizzle_orm_1.eq)(ndr_1.ndr_events.awb_number, awbLookup))
                    .orderBy((0, drizzle_orm_1.desc)(ndr_1.ndr_events.created_at))
                    .limit(1);
                const last = rows?.[0];
                const statusLower = String(last?.status || '').toLowerCase();
                if (statusLower.includes('nsl')) {
                    return res
                        .status(400)
                        .json({ success: false, message: 'Cannot change phone: Not serviceable (NSL)' });
                }
            }
        }
        catch (e) {
            console.warn('Eligibility read failed for change-phone:', e);
        }
        let provider = (order.integration_type || '').toString().trim().toLowerCase();
        if (!provider)
            return res.status(400).json({ success: false, message: 'Missing integration_type on order.' });
        // Branch by provider
        if (provider === 'delhivery') {
            const delhivery = new delhivery_service_1.DelhiveryService();
            const wb = awb || order.awb_number;
            if (!wb)
                return res.status(400).json({ success: false, message: 'AWB is required' });
            const resp = await delhivery.submitNdrAction([
                {
                    waybill: wb,
                    act: 'EDIT_DETAILS',
                    action_data: {
                        phone: String(phone),
                    },
                },
            ]);
            if (!hasDelhiveryActionAccepted(resp)) {
                return res.status(502).json({
                    success: false,
                    message: 'Delhivery did not accept change-phone action',
                    data: resp,
                });
            }
            await (0, ndr_service_1.recordNdrEvent)({
                orderId: order.id,
                userId: order.user_id,
                awbNumber: order.awb_number || undefined,
                status: 'ndr_action',
                remarks: 'change-phone',
                payload: { provider: 'delhivery', action: 'EDIT_DETAILS', response: resp },
            });
            return res.status(200).json({ success: true, data: resp });
        }
        if (provider === 'ekart') {
            const ekart = new ekart_service_1.EkartService();
            const wb = awb || order.awb_number;
            if (!wb)
                return res.status(400).json({ success: false, message: 'AWB is required' });
            const resp = await ekart.submitNdrAction({
                waybill: wb,
                action: 'EDIT_DETAILS',
                alternate_number: String(phone),
            });
            if (!hasDelhiveryActionAccepted(resp)) {
                return res.status(502).json({
                    success: false,
                    message: 'Ekart did not accept change-phone action',
                    data: resp,
                });
            }
            await (0, ndr_service_1.recordNdrEvent)({
                orderId: order.id,
                userId: order.user_id,
                awbNumber: order.awb_number || undefined,
                status: 'ndr_action',
                remarks: 'change-phone',
                payload: { provider: 'ekart', action: 'EDIT_DETAILS', response: resp },
            });
            return res.status(200).json({ success: true, data: resp });
        }
        if (provider === 'xpressbees') {
            const xpressbees = new xpressbees_service_1.XpressbeesService();
            const wb = awb || order.awb_number;
            if (!wb)
                return res.status(400).json({ success: false, message: 'AWB is required' });
            const resp = await xpressbees.submitNdrAction([
                {
                    awb: wb,
                    action: 'change_phone',
                    action_data: {
                        phone: String(phone),
                    },
                },
            ]);
            if (!hasXpressbeesActionAccepted(resp)) {
                return res.status(502).json({
                    success: false,
                    message: 'Xpressbees did not accept change-phone action',
                    data: resp,
                });
            }
            await (0, ndr_service_1.recordNdrEvent)({
                orderId: order.id,
                userId: order.user_id,
                awbNumber: order.awb_number || undefined,
                status: 'ndr_action',
                remarks: 'change-phone',
                payload: { provider: 'xpressbees', action: 'change_phone', response: resp },
            });
            return res.status(200).json({ success: true, data: resp });
        }
        return res
            .status(400)
            .json({ success: false, message: 'Unsupported courier integration type.' });
    }
    catch (err) {
        console.error('NDR Change Phone error:', err);
        return res.status(500).json({ success: false, message: err.message || 'Internal error' });
    }
};
exports.ndrChangePhoneController = ndrChangePhoneController;
/**
 * POST /ndr/delhivery/pickup-reschedule
 * Body: { awbs: string[], defermentDate?: string }
 */
const delhiveryPickupRescheduleController = async (req, res) => {
    try {
        const { awbs, defermentDate } = req.body;
        if (!Array.isArray(awbs) || awbs.length === 0) {
            return res.status(400).json({ success: false, message: 'awbs array is required' });
        }
        const delhivery = new delhivery_service_1.DelhiveryService();
        // Backward-compatible endpoint name; internally mapped to documented Delhivery DEFER_DLV action.
        const actions = awbs.map((wb) => ({
            waybill: wb,
            act: 'PICKUP_RESCHEDULE',
            ...(defermentDate ? { action_data: { deferred_date: defermentDate } } : {}),
        }));
        const resp = await delhivery.submitNdrAction(actions);
        if (!hasDelhiveryActionAccepted(resp)) {
            return res.status(502).json({
                success: false,
                message: 'Delhivery did not accept pickup-reschedule action',
                data: resp,
            });
        }
        // No single order context, log one audit per awb to ndr_events if possible
        try {
            for (const wb of awbs) {
                const [order] = await client_1.db.select().from(b2cOrders_1.b2c_orders).where((0, drizzle_orm_1.eq)(b2cOrders_1.b2c_orders.awb_number, wb));
                if (order) {
                    await (0, ndr_service_1.recordNdrEvent)({
                        orderId: order.id,
                        userId: order.user_id,
                        awbNumber: wb,
                        status: 'ndr_action',
                        remarks: 'PICKUP_RESCHEDULE',
                        payload: {
                            provider: order.integration_type,
                            action: 'PICKUP_RESCHEDULE',
                            response: resp,
                        },
                    });
                }
            }
        }
        catch (e) {
            console.error('Audit log failure for PICKUP_RESCHEDULE:', e);
        }
        return res.status(200).json({ success: true, data: resp });
    }
    catch (err) {
        console.error('Delhivery PICKUP_RESCHEDULE error:', err);
        return res.status(500).json({ success: false, message: err.message || 'Internal error' });
    }
};
exports.delhiveryPickupRescheduleController = delhiveryPickupRescheduleController;
/**
 * POST /ndr/bulk
 * Body: { items: Array<{ awb: string, provider?: 'delhivery', action: string, data?: any }> }
 * Note: This performs provider-batched submissions respecting typical limits.
 */
const ndrBulkActionController = async (req, res) => {
    try {
        const { items } = req.body;
        if (!Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ success: false, message: 'items array is required' });
        }
        // Eligibility checks: NSL or attempts >= 3 → skip with reason
        const eligible = [];
        const ineligible = [];
        for (const it of items) {
            // fetch last NDR event for awb if present
            let last = null;
            if (it.awb) {
                const rows = await client_1.db
                    .select()
                    .from(ndr_1.ndr_events)
                    .where((0, drizzle_orm_1.eq)(ndr_1.ndr_events.awb_number, it.awb))
                    .orderBy((0, drizzle_orm_1.desc)(ndr_1.ndr_events.created_at))
                    .limit(1);
                last = rows?.[0];
            }
            const attempts = last?.attempt_no ? parseInt(String(last.attempt_no), 10) || 0 : 0;
            const status = String(last?.status || '').toLowerCase();
            if (status.includes('nsl')) {
                ineligible.push({ awb: it.awb, reason: 'Not serviceable (NSL)' });
                continue;
            }
            if (String(it.action || '').toLowerCase() === 're-attempt' && attempts >= 3) {
                ineligible.push({ awb: it.awb, reason: 'Max attempts reached' });
                continue;
            }
            eligible.push(it);
        }
        const grouped = {};
        for (const it of eligible) {
            const key = (it.provider || '').toLowerCase();
            if (!grouped[key])
                grouped[key] = [];
            grouped[key].push({ awb: it.awb, action: it.action, data: it.data });
        }
        const results = {};
        // Simple retry with backoff for transient errors
        const withRetry = async (fn, retries = 3) => {
            let attempt = 0;
            let lastErr;
            while (attempt < retries) {
                try {
                    return await fn();
                }
                catch (e) {
                    lastErr = e;
                    const status = e?.response?.status;
                    if (status && status < 500 && status !== 429)
                        break;
                    const wait = 300 * Math.pow(2, attempt);
                    await new Promise((r) => setTimeout(r, wait));
                    attempt++;
                }
            }
            throw lastErr;
        };
        // Batching for providers with approximate limits (e.g. 50 per request)
        // Delhivery batching (limit ~100 per request)
        if (grouped['delhivery']?.length) {
            const delhivery = new delhivery_service_1.DelhiveryService();
            const batchSize = 100;
            results['delhivery'] = [];
            for (let i = 0; i < grouped['delhivery'].length; i += batchSize) {
                const chunk = grouped['delhivery'].slice(i, i + batchSize);
                const payload = chunk.map((c) => {
                    if (c.action === 'RE-ATTEMPT' || c.action === 'PICKUP_RESCHEDULE')
                        return {
                            waybill: c.awb,
                            act: c.action,
                            ...(c.data ? { action_data: c.data } : {}),
                        };
                    throw new Error(`Unsupported Delhivery action: ${c.action}`);
                });
                const resp = await withRetry(() => delhivery.submitNdrAction(payload));
                if (!hasDelhiveryActionAccepted(resp)) {
                    throw new Error('Delhivery did not accept one or more bulk NDR actions');
                }
                results['delhivery'].push(resp);
                await new Promise((r) => setTimeout(r, 400));
            }
        }
        if (grouped['xpressbees']?.length) {
            const xpressbees = new xpressbees_service_1.XpressbeesService();
            const batchSize = 100;
            results['xpressbees'] = [];
            for (let i = 0; i < grouped['xpressbees'].length; i += batchSize) {
                const chunk = grouped['xpressbees'].slice(i, i + batchSize);
                const payload = chunk.map((c) => {
                    if (c.action === 'RE-ATTEMPT') {
                        return {
                            awb: c.awb,
                            action: 're-attempt',
                            action_data: {
                                re_attempt_date: c.data?.next_attempt_date || c.data?.re_attempt_date,
                            },
                        };
                    }
                    if (c.action === 'EDIT_DETAILS') {
                        if (c.data?.phone || c.data?.alternate_number) {
                            return {
                                awb: c.awb,
                                action: 'change_phone',
                                action_data: {
                                    phone: String(c.data?.phone || c.data?.alternate_number),
                                },
                            };
                        }
                        return {
                            awb: c.awb,
                            action: 'change_address',
                            action_data: {
                                name: c.data?.name || '',
                                address_1: c.data?.address_1 || c.data?.add || '',
                                ...(c.data?.address_2 ? { address_2: c.data.address_2 } : {}),
                            },
                        };
                    }
                    throw new Error(`Unsupported Xpressbees action: ${c.action}`);
                });
                const resp = await withRetry(() => xpressbees.submitNdrAction(payload));
                if (!hasXpressbeesActionAccepted(resp)) {
                    throw new Error('Xpressbees did not accept one or more bulk NDR actions');
                }
                results['xpressbees'].push(resp);
                await new Promise((r) => setTimeout(r, 400));
            }
        }
        const unsupportedProviders = Object.keys(grouped).filter((provider) => !['delhivery', 'xpressbees'].includes(provider));
        if (unsupportedProviders.length) {
            for (const provider of unsupportedProviders) {
                results[provider] = grouped[provider].map((item) => ({
                    awb: item.awb,
                    action: item.action,
                    success: false,
                    message: 'Only Delhivery is supported for NDR APIs.',
                }));
            }
        }
        return res.status(200).json({ success: true, results, ineligible });
    }
    catch (err) {
        console.error('NDR Bulk error:', err);
        return res.status(500).json({ success: false, message: err.message || 'Internal error' });
    }
};
exports.ndrBulkActionController = ndrBulkActionController;
/**
 * GET /ndr/delhivery/upl-status?uplId=...
 */
const delhiveryUplStatusController = async (req, res) => {
    try {
        const uplId = String(req.query.uplId || '');
        if (!uplId)
            return res.status(400).json({ success: false, message: 'uplId is required' });
        const delhivery = new delhivery_service_1.DelhiveryService();
        const data = await delhivery.getNdrStatus(uplId, true);
        return res.status(200).json({ success: true, data });
    }
    catch (err) {
        console.error('Delhivery UPL status error:', err);
        return res.status(500).json({ success: false, message: err.message || 'Internal error' });
    }
};
exports.delhiveryUplStatusController = delhiveryUplStatusController;

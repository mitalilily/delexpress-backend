"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const drizzle_orm_1 = require("drizzle-orm");
const codCsvUpload_admin_controller_1 = require("../controllers/admin/codCsvUpload.admin.controller");
const client_1 = require("../models/client");
const b2cOrders_1 = require("../models/schema/b2cOrders");
const codRemittance_1 = require("../models/schema/codRemittance");
const ndr_1 = require("../models/schema/ndr");
const notifications_1 = require("../models/schema/notifications");
const rto_1 = require("../models/schema/rto");
const users_1 = require("../models/schema/users");
const wallet_1 = require("../models/schema/wallet");
const weightDiscrepancies_1 = require("../models/schema/weightDiscrepancies");
const webhookProcessor_1 = require("../models/services/webhookProcessor");
const now = Date.now();
const today = new Date().toISOString().slice(0, 10);
const genAwb = (offset) => String(70000000000000 + (now % 1000000) + offset);
async function pickUserId() {
    const [customer] = await client_1.db
        .select({ id: users_1.users.id })
        .from(users_1.users)
        .where((0, drizzle_orm_1.eq)(users_1.users.role, 'customer'))
        .limit(1);
    if (customer?.id)
        return customer.id;
    const [anyNonAdmin] = await client_1.db
        .select({ id: users_1.users.id })
        .from(users_1.users)
        .where((0, drizzle_orm_1.ne)(users_1.users.role, 'admin'))
        .limit(1);
    if (anyNonAdmin?.id)
        return anyNonAdmin.id;
    const [anyUser] = await client_1.db.select({ id: users_1.users.id }).from(users_1.users).limit(1);
    if (!anyUser?.id) {
        throw new Error('No users found in database. Create at least one merchant/customer user first.');
    }
    return anyUser.id;
}
async function seedOrders(userId) {
    const orderPayloads = [
        {
            user_id: userId,
            order_number: `SIM-COD-DEL-${now}`,
            order_date: today,
            order_amount: 1299,
            order_id: `SIM-ORD-${now}-1`,
            cod_charges: 35,
            buyer_name: 'Test Buyer Delivered',
            buyer_phone: '9999990001',
            buyer_email: 'delivered.sim@example.com',
            address: '22 Test Street',
            city: 'Srinagar',
            state: 'Jammu and Kashmir',
            country: 'India',
            pincode: '190001',
            products: [{ productName: 'Sim Jacket', price: 1299, quantity: 1, sku: 'SIM-1' }],
            weight: 1,
            length: 20,
            breadth: 15,
            height: 10,
            order_type: 'cod',
            prepaid_amount: 0,
            freight_charges: 85,
            shipping_charges: 85,
            other_charges: 0,
            transaction_fee: 0,
            gift_wrap: 0,
            discount: 0,
            order_status: 'in_transit',
            courier_partner: 'Delhivery',
            courier_id: 1,
            awb_number: genAwb(1),
            pickup_details: { warehouse_name: 'Main WH' },
            integration_type: 'delhivery',
            is_external_api: false,
        },
        {
            user_id: userId,
            order_number: `SIM-NDR-${now}`,
            order_date: today,
            order_amount: 799,
            order_id: `SIM-ORD-${now}-2`,
            cod_charges: 25,
            buyer_name: 'Test Buyer NDR',
            buyer_phone: '9999990002',
            buyer_email: 'ndr.sim@example.com',
            address: '44 Retry Lane',
            city: 'Jammu',
            state: 'Jammu and Kashmir',
            country: 'India',
            pincode: '180001',
            products: [{ productName: 'Sim Shoes', price: 799, quantity: 1, sku: 'SIM-2' }],
            weight: 0.8,
            length: 16,
            breadth: 12,
            height: 9,
            order_type: 'cod',
            prepaid_amount: 0,
            freight_charges: 70,
            shipping_charges: 70,
            other_charges: 0,
            transaction_fee: 0,
            gift_wrap: 0,
            discount: 0,
            order_status: 'in_transit',
            courier_partner: 'Delhivery',
            courier_id: 1,
            awb_number: genAwb(2),
            pickup_details: { warehouse_name: 'Main WH' },
            integration_type: 'delhivery',
            is_external_api: false,
        },
        {
            user_id: userId,
            order_number: `SIM-RTO-${now}`,
            order_date: today,
            order_amount: 999,
            order_id: `SIM-ORD-${now}-3`,
            cod_charges: 30,
            buyer_name: 'Test Buyer RTO',
            buyer_phone: '9999990003',
            buyer_email: 'rto.sim@example.com',
            address: '88 Return Road',
            city: 'Leh',
            state: 'Ladakh',
            country: 'India',
            pincode: '194101',
            products: [{ productName: 'Sim Bag', price: 999, quantity: 1, sku: 'SIM-3' }],
            weight: 0.9,
            length: 18,
            breadth: 14,
            height: 8,
            order_type: 'cod',
            prepaid_amount: 0,
            freight_charges: 75,
            shipping_charges: 75,
            other_charges: 0,
            transaction_fee: 0,
            gift_wrap: 0,
            discount: 0,
            order_status: 'in_transit',
            courier_partner: 'Delhivery',
            courier_id: 1,
            awb_number: genAwb(3),
            pickup_details: { warehouse_name: 'Main WH' },
            integration_type: 'delhivery',
            is_external_api: false,
        },
    ];
    const inserted = await client_1.db.insert(b2cOrders_1.b2c_orders).values(orderPayloads).returning({
        id: b2cOrders_1.b2c_orders.id,
        order_number: b2cOrders_1.b2c_orders.order_number,
        awb_number: b2cOrders_1.b2c_orders.awb_number,
    });
    return inserted;
}
async function simulateWebhooks(orders) {
    const delivered = orders[0];
    const ndr = orders[1];
    const rto = orders[2];
    const deliveredPayload = {
        Shipment: {
            AWB: delivered.awb_number,
            Status: {
                Status: 'Delivered',
                StatusType: 'DL',
                StatusLocation: 'Srinagar Hub',
                Instructions: 'Delivered to consignee',
            },
            ChargedWeight: 2.6,
            VolumetricWeight: 2.4,
            Scans: [{ ScanDetail: { ScannedWeight: 2.5 } }],
            Charge: 112,
        },
    };
    const ndrPayload = {
        Shipment: {
            AWB: ndr.awb_number,
            Status: {
                Status: 'Undelivered',
                StatusType: 'ND',
                StatusLocation: 'Jammu Hub',
                Instructions: 'Customer not reachable',
            },
            AttemptedCount: 1,
        },
    };
    const rtoPayload = {
        Shipment: {
            AWB: rto.awb_number,
            Status: {
                Status: 'Pending',
                StatusType: 'RT',
                StatusLocation: 'Leh Return Facility',
                Instructions: 'Marked for return to origin',
            },
        },
    };
    const rtoDeliveredPayload = {
        Shipment: {
            AWB: rto.awb_number,
            Status: {
                Status: 'RTO',
                StatusType: 'DL',
                StatusLocation: 'Origin Warehouse',
                Instructions: 'Return delivered to origin',
            },
        },
    };
    const podPayload = {
        Shipment: {
            AWB: delivered.awb_number,
            PODDocument: `https://example.com/pod/${delivered.awb_number}.jpg`,
        },
        DocumentType: 'POD',
    };
    console.log('\n📨 Sending Delhivery scan webhook: Delivered + weight discrepancy');
    console.log(await (0, webhookProcessor_1.processDelhiveryWebhook)(deliveredPayload));
    console.log('\n📨 Sending Delhivery scan webhook again: Delivered idempotency check');
    console.log(await (0, webhookProcessor_1.processDelhiveryWebhook)(deliveredPayload));
    console.log('\n📨 Sending Delhivery scan webhook: NDR');
    console.log(await (0, webhookProcessor_1.processDelhiveryWebhook)(ndrPayload));
    console.log('\n📨 Sending Delhivery scan webhook: RTO pending');
    console.log(await (0, webhookProcessor_1.processDelhiveryWebhook)(rtoPayload));
    console.log('\n📨 Sending Delhivery scan webhook: RTO delivered');
    console.log(await (0, webhookProcessor_1.processDelhiveryWebhook)(rtoDeliveredPayload));
    console.log('\n📨 Sending Delhivery document webhook: POD');
    console.log(await (0, webhookProcessor_1.processDelhiveryDocumentWebhook)(podPayload, 'POD'));
}
function createMockRes() {
    return {
        statusCode: 200,
        body: null,
        headers: {},
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(payload) {
            this.body = payload;
            return payload;
        },
        send(payload) {
            this.body = payload;
            return payload;
        },
        setHeader(key, value) {
            this.headers[key] = value;
        },
    };
}
async function testSettlementControllers(orders) {
    const deliveredAwb = orders[0].awb_number;
    const [pendingRemittance] = await client_1.db
        .select()
        .from(codRemittance_1.codRemittances)
        .where((0, drizzle_orm_1.eq)(codRemittance_1.codRemittances.awbNumber, deliveredAwb))
        .limit(1);
    if (!pendingRemittance) {
        throw new Error('No pending COD remittance found for delivered order; cannot test settlement flow.');
    }
    const expectedAmount = Number(pendingRemittance.remittableAmount);
    const csvData = [
        'Waybill,Order,COD Amount,Net Payable,Bank Transaction ID,Remittance Date',
        `${deliveredAwb},${pendingRemittance.orderNumber},1299,${expectedAmount},UTR-PREVIEW-1,${today}`,
        `${deliveredAwb},${pendingRemittance.orderNumber},1299,${expectedAmount + 12},UTR-PREVIEW-2,${today}`,
        `99999999999999,MISSING-ORDER,500,450,UTR-PREVIEW-3,${today}`,
    ].join('\n');
    const previewReq = {
        body: {
            courierPartner: 'delhivery',
            csvData,
        },
    };
    const previewRes = createMockRes();
    await (0, codCsvUpload_admin_controller_1.previewCourierSettlementCsv)(previewReq, previewRes);
    if (previewRes.statusCode !== 200 || !previewRes.body?.success) {
        throw new Error(`Preview flow failed: ${JSON.stringify(previewRes.body)}`);
    }
    const previewSummary = previewRes.body?.data?.summary;
    console.log('\n📊 Settlement preview summary:', previewSummary);
    const matched = previewRes.body?.data?.results?.matched || [];
    if (!matched.length) {
        throw new Error('Preview returned zero matched rows; cannot test confirm flow.');
    }
    const confirmReq = {
        body: {
            remittances: [matched[0]],
            utrNumber: `UTR-CONFIRM-${now}`,
            settlementDate: new Date().toISOString(),
            courierPartner: 'delhivery',
        },
        user: { sub: 'admin-sim-script' },
    };
    const confirmRes = createMockRes();
    await (0, codCsvUpload_admin_controller_1.confirmCourierSettlement)(confirmReq, confirmRes);
    if (confirmRes.statusCode !== 200 || !confirmRes.body?.success) {
        throw new Error(`Confirm flow failed: ${JSON.stringify(confirmRes.body)}`);
    }
    console.log('\n💳 Settlement confirm summary:', confirmRes.body?.data);
    const [creditedRemittance] = await client_1.db
        .select()
        .from(codRemittance_1.codRemittances)
        .where((0, drizzle_orm_1.eq)(codRemittance_1.codRemittances.id, matched[0].remittanceId))
        .limit(1);
    if (!creditedRemittance || creditedRemittance.status !== 'credited') {
        throw new Error('Remittance was not marked credited after confirm flow.');
    }
    const [wallet] = await client_1.db
        .select()
        .from(wallet_1.wallets)
        .where((0, drizzle_orm_1.eq)(wallet_1.wallets.userId, creditedRemittance.userId))
        .limit(1);
    if (!wallet) {
        throw new Error('Wallet not found for credited remittance user.');
    }
    const txns = await client_1.db
        .select()
        .from(wallet_1.walletTransactions)
        .where((0, drizzle_orm_1.eq)(wallet_1.walletTransactions.wallet_id, wallet.id));
    const relatedTxn = txns.find((t) => t.ref === creditedRemittance.orderId);
    if (!relatedTxn) {
        throw new Error('Wallet transaction not found for credited remittance.');
    }
    const postPreviewReq = {
        body: {
            courierPartner: 'delhivery',
            csvData,
        },
    };
    const postPreviewRes = createMockRes();
    await (0, codCsvUpload_admin_controller_1.previewCourierSettlementCsv)(postPreviewReq, postPreviewRes);
    if (!postPreviewRes.body?.data?.summary) {
        throw new Error('Post-credit preview did not return summary.');
    }
    console.log('\n📊 Post-credit preview summary:', postPreviewRes.body.data.summary);
}
async function printVerification(orders) {
    const orderIds = orders.map((o) => o.id);
    const deliveredOrderNumber = orders[0]?.order_number;
    const codRows = await client_1.db
        .select({ id: codRemittance_1.codRemittances.id, orderId: codRemittance_1.codRemittances.orderId, status: codRemittance_1.codRemittances.status })
        .from(codRemittance_1.codRemittances)
        .where((0, drizzle_orm_1.inArray)(codRemittance_1.codRemittances.orderId, orderIds));
    const ndrRows = await client_1.db
        .select({ id: ndr_1.ndr_events.id, order_id: ndr_1.ndr_events.order_id, status: ndr_1.ndr_events.status })
        .from(ndr_1.ndr_events)
        .where((0, drizzle_orm_1.inArray)(ndr_1.ndr_events.order_id, orderIds));
    const rtoRows = await client_1.db
        .select({ id: rto_1.rto_events.id, order_id: rto_1.rto_events.order_id, status: rto_1.rto_events.status })
        .from(rto_1.rto_events)
        .where((0, drizzle_orm_1.inArray)(rto_1.rto_events.order_id, orderIds));
    const weightRows = await client_1.db
        .select({ id: weightDiscrepancies_1.weight_discrepancies.id, b2c_order_id: weightDiscrepancies_1.weight_discrepancies.b2c_order_id })
        .from(weightDiscrepancies_1.weight_discrepancies)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(weightDiscrepancies_1.weight_discrepancies.order_type, 'b2c'), (0, drizzle_orm_1.inArray)(weightDiscrepancies_1.weight_discrepancies.b2c_order_id, orderIds)));
    const podNotifications = deliveredOrderNumber
        ? await client_1.db
            .select({ id: notifications_1.notifications.id, title: notifications_1.notifications.title, message: notifications_1.notifications.message })
            .from(notifications_1.notifications)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.sql) `${notifications_1.notifications.title} ilike ${'%POD%'}`, (0, drizzle_orm_1.sql) `${notifications_1.notifications.message} ilike ${`%${deliveredOrderNumber}%`}`))
        : [];
    const finalOrders = await client_1.db
        .select({
        id: b2cOrders_1.b2c_orders.id,
        order_number: b2cOrders_1.b2c_orders.order_number,
        awb_number: b2cOrders_1.b2c_orders.awb_number,
        order_status: b2cOrders_1.b2c_orders.order_status,
        charged_weight: b2cOrders_1.b2c_orders.charged_weight,
        weight_discrepancy: b2cOrders_1.b2c_orders.weight_discrepancy,
    })
        .from(b2cOrders_1.b2c_orders)
        .where((0, drizzle_orm_1.inArray)(b2cOrders_1.b2c_orders.id, orderIds));
    console.log('\n================ FLOW VERIFICATION ================');
    console.log(`Seeded orders: ${orders.length}`);
    console.log(`COD remittances created: ${codRows.length}`);
    console.log(`COD remittances credited: ${codRows.filter((r) => r.status === 'credited').length}`);
    console.log(`NDR events created: ${ndrRows.length}`);
    console.log(`RTO events created: ${rtoRows.length}`);
    console.log(`Weight discrepancies created: ${weightRows.length}`);
    console.log(`POD notifications found: ${podNotifications.length}`);
    console.log('\nFinal order states:');
    for (const row of finalOrders) {
        console.log(`- ${row.order_number} | AWB ${row.awb_number} | status=${row.order_status} | charged_weight=${row.charged_weight ?? 'NA'} | weight_discrepancy=${row.weight_discrepancy}`);
    }
    console.log('===================================================\n');
}
async function main() {
    console.log('🚀 Seeding dummy B2C orders + simulating Delhivery webhooks...');
    const userId = await pickUserId();
    console.log(`👤 Using user_id: ${userId}`);
    const orders = await seedOrders(userId);
    console.log('\n✅ Seeded orders:');
    for (const o of orders) {
        console.log(`- ${o.order_number} | AWB ${o.awb_number} | ID ${o.id}`);
    }
    await simulateWebhooks(orders);
    await testSettlementControllers(orders);
    await printVerification(orders);
}
main()
    .then(() => {
    console.log('✅ Done');
    process.exit(0);
})
    .catch((err) => {
    console.error('❌ Failed:', err);
    process.exit(1);
});

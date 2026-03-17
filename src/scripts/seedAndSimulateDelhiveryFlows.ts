import { and, eq, inArray, ne, sql } from 'drizzle-orm'
import {
  confirmCourierSettlement,
  previewCourierSettlementCsv,
} from '../controllers/admin/codCsvUpload.admin.controller'
import { db } from '../models/client'
import { b2c_orders } from '../models/schema/b2cOrders'
import { codRemittances } from '../models/schema/codRemittance'
import { ndr_events } from '../models/schema/ndr'
import { notifications } from '../models/schema/notifications'
import { rto_events } from '../models/schema/rto'
import { users } from '../models/schema/users'
import { wallets, walletTransactions } from '../models/schema/wallet'
import { weight_discrepancies } from '../models/schema/weightDiscrepancies'
import {
  processDelhiveryDocumentWebhook,
  processDelhiveryWebhook,
} from '../models/services/webhookProcessor'

type SeededOrder = {
  id: string
  order_number: string
  awb_number: string
}

type MockRes = {
  statusCode: number
  body: any
  headers: Record<string, string>
  status: (code: number) => MockRes
  json: (payload: any) => any
  send: (payload: any) => any
  setHeader: (key: string, value: string) => void
}

const now = Date.now()
const today = new Date().toISOString().slice(0, 10)

const genAwb = (offset: number) => String(70000000000000 + (now % 1000000) + offset)

async function pickUserId(): Promise<string> {
  const [customer] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.role, 'customer'))
    .limit(1)

  if (customer?.id) return customer.id

  const [anyNonAdmin] = await db
    .select({ id: users.id })
    .from(users)
    .where(ne(users.role, 'admin'))
    .limit(1)

  if (anyNonAdmin?.id) return anyNonAdmin.id

  const [anyUser] = await db.select({ id: users.id }).from(users).limit(1)

  if (!anyUser?.id) {
    throw new Error('No users found in database. Create at least one merchant/customer user first.')
  }

  return anyUser.id
}

async function seedOrders(userId: string): Promise<SeededOrder[]> {
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
  ]

  const inserted = await db.insert(b2c_orders).values(orderPayloads as any).returning({
    id: b2c_orders.id,
    order_number: b2c_orders.order_number,
    awb_number: b2c_orders.awb_number,
  })

  return inserted as SeededOrder[]
}

async function simulateWebhooks(orders: SeededOrder[]) {
  const delivered = orders[0]
  const ndr = orders[1]
  const rto = orders[2]

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
  }

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
  }

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
  }

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
  }

  const podPayload = {
    Shipment: {
      AWB: delivered.awb_number,
      PODDocument: `https://example.com/pod/${delivered.awb_number}.jpg`,
    },
    DocumentType: 'POD',
  }

  console.log('\n📨 Sending Delhivery scan webhook: Delivered + weight discrepancy')
  console.log(await processDelhiveryWebhook(deliveredPayload))

  console.log('\n📨 Sending Delhivery scan webhook again: Delivered idempotency check')
  console.log(await processDelhiveryWebhook(deliveredPayload))

  console.log('\n📨 Sending Delhivery scan webhook: NDR')
  console.log(await processDelhiveryWebhook(ndrPayload))

  console.log('\n📨 Sending Delhivery scan webhook: RTO pending')
  console.log(await processDelhiveryWebhook(rtoPayload))

  console.log('\n📨 Sending Delhivery scan webhook: RTO delivered')
  console.log(await processDelhiveryWebhook(rtoDeliveredPayload))

  console.log('\n📨 Sending Delhivery document webhook: POD')
  console.log(await processDelhiveryDocumentWebhook(podPayload, 'POD'))
}

function createMockRes(): MockRes {
  return {
    statusCode: 200,
    body: null,
    headers: {},
    status(code: number) {
      this.statusCode = code
      return this
    },
    json(payload: any) {
      this.body = payload
      return payload
    },
    send(payload: any) {
      this.body = payload
      return payload
    },
    setHeader(key: string, value: string) {
      this.headers[key] = value
    },
  }
}

async function testSettlementControllers(orders: SeededOrder[]) {
  const deliveredAwb = orders[0].awb_number

  const [pendingRemittance] = await db
    .select()
    .from(codRemittances)
    .where(eq(codRemittances.awbNumber, deliveredAwb))
    .limit(1)

  if (!pendingRemittance) {
    throw new Error('No pending COD remittance found for delivered order; cannot test settlement flow.')
  }

  const expectedAmount = Number(pendingRemittance.remittableAmount)
  const csvData = [
    'Waybill,Order,COD Amount,Net Payable,Bank Transaction ID,Remittance Date',
    `${deliveredAwb},${pendingRemittance.orderNumber},1299,${expectedAmount},UTR-PREVIEW-1,${today}`,
    `${deliveredAwb},${pendingRemittance.orderNumber},1299,${expectedAmount + 12},UTR-PREVIEW-2,${today}`,
    `99999999999999,MISSING-ORDER,500,450,UTR-PREVIEW-3,${today}`,
  ].join('\n')

  const previewReq: any = {
    body: {
      courierPartner: 'delhivery',
      csvData,
    },
  }
  const previewRes = createMockRes()
  await previewCourierSettlementCsv(previewReq, previewRes as any)

  if (previewRes.statusCode !== 200 || !previewRes.body?.success) {
    throw new Error(`Preview flow failed: ${JSON.stringify(previewRes.body)}`)
  }

  const previewSummary = previewRes.body?.data?.summary
  console.log('\n📊 Settlement preview summary:', previewSummary)

  const matched = previewRes.body?.data?.results?.matched || []
  if (!matched.length) {
    throw new Error('Preview returned zero matched rows; cannot test confirm flow.')
  }

  const confirmReq: any = {
    body: {
      remittances: [matched[0]],
      utrNumber: `UTR-CONFIRM-${now}`,
      settlementDate: new Date().toISOString(),
      courierPartner: 'delhivery',
    },
    user: { sub: 'admin-sim-script' },
  }
  const confirmRes = createMockRes()
  await confirmCourierSettlement(confirmReq, confirmRes as any)

  if (confirmRes.statusCode !== 200 || !confirmRes.body?.success) {
    throw new Error(`Confirm flow failed: ${JSON.stringify(confirmRes.body)}`)
  }

  console.log('\n💳 Settlement confirm summary:', confirmRes.body?.data)

  const [creditedRemittance] = await db
    .select()
    .from(codRemittances)
    .where(eq(codRemittances.id, matched[0].remittanceId))
    .limit(1)

  if (!creditedRemittance || creditedRemittance.status !== 'credited') {
    throw new Error('Remittance was not marked credited after confirm flow.')
  }

  const [wallet] = await db
    .select()
    .from(wallets)
    .where(eq(wallets.userId, creditedRemittance.userId))
    .limit(1)

  if (!wallet) {
    throw new Error('Wallet not found for credited remittance user.')
  }

  const txns = await db
    .select()
    .from(walletTransactions)
    .where(eq(walletTransactions.wallet_id, wallet.id))

  const relatedTxn = txns.find((t) => t.ref === creditedRemittance.orderId)
  if (!relatedTxn) {
    throw new Error('Wallet transaction not found for credited remittance.')
  }

  const postPreviewReq: any = {
    body: {
      courierPartner: 'delhivery',
      csvData,
    },
  }
  const postPreviewRes = createMockRes()
  await previewCourierSettlementCsv(postPreviewReq, postPreviewRes as any)

  if (!postPreviewRes.body?.data?.summary) {
    throw new Error('Post-credit preview did not return summary.')
  }

  console.log('\n📊 Post-credit preview summary:', postPreviewRes.body.data.summary)
}

async function printVerification(orders: SeededOrder[]) {
  const orderIds = orders.map((o) => o.id)
  const deliveredOrderNumber = orders[0]?.order_number

  const codRows = await db
    .select({ id: codRemittances.id, orderId: codRemittances.orderId, status: codRemittances.status })
    .from(codRemittances)
    .where(inArray(codRemittances.orderId, orderIds))

  const ndrRows = await db
    .select({ id: ndr_events.id, order_id: ndr_events.order_id, status: ndr_events.status })
    .from(ndr_events)
    .where(inArray(ndr_events.order_id, orderIds))

  const rtoRows = await db
    .select({ id: rto_events.id, order_id: rto_events.order_id, status: rto_events.status })
    .from(rto_events)
    .where(inArray(rto_events.order_id, orderIds))

  const weightRows = await db
    .select({ id: weight_discrepancies.id, b2c_order_id: weight_discrepancies.b2c_order_id })
    .from(weight_discrepancies)
    .where(and(eq(weight_discrepancies.order_type, 'b2c'), inArray(weight_discrepancies.b2c_order_id, orderIds)))

  const podNotifications = deliveredOrderNumber
    ? await db
        .select({ id: notifications.id, title: notifications.title, message: notifications.message })
        .from(notifications)
        .where(
          and(
            sql`${notifications.title} ilike ${'%POD%'}`,
            sql`${notifications.message} ilike ${`%${deliveredOrderNumber}%`}`,
          ),
        )
    : []

  const finalOrders = await db
    .select({
      id: b2c_orders.id,
      order_number: b2c_orders.order_number,
      awb_number: b2c_orders.awb_number,
      order_status: b2c_orders.order_status,
      charged_weight: b2c_orders.charged_weight,
      weight_discrepancy: b2c_orders.weight_discrepancy,
    })
    .from(b2c_orders)
    .where(inArray(b2c_orders.id, orderIds))

  console.log('\n================ FLOW VERIFICATION ================')
  console.log(`Seeded orders: ${orders.length}`)
  console.log(`COD remittances created: ${codRows.length}`)
  console.log(`COD remittances credited: ${codRows.filter((r) => r.status === 'credited').length}`)
  console.log(`NDR events created: ${ndrRows.length}`)
  console.log(`RTO events created: ${rtoRows.length}`)
  console.log(`Weight discrepancies created: ${weightRows.length}`)
  console.log(`POD notifications found: ${podNotifications.length}`)
  console.log('\nFinal order states:')
  for (const row of finalOrders) {
    console.log(
      `- ${row.order_number} | AWB ${row.awb_number} | status=${row.order_status} | charged_weight=${row.charged_weight ?? 'NA'} | weight_discrepancy=${row.weight_discrepancy}`,
    )
  }
  console.log('===================================================\n')
}

async function main() {
  console.log('🚀 Seeding dummy B2C orders + simulating Delhivery webhooks...')
  const userId = await pickUserId()
  console.log(`👤 Using user_id: ${userId}`)

  const orders = await seedOrders(userId)
  console.log('\n✅ Seeded orders:')
  for (const o of orders) {
    console.log(`- ${o.order_number} | AWB ${o.awb_number} | ID ${o.id}`)
  }

  await simulateWebhooks(orders)
  await testSettlementControllers(orders)
  await printVerification(orders)
}

main()
  .then(() => {
    console.log('✅ Done')
    process.exit(0)
  })
  .catch((err) => {
    console.error('❌ Failed:', err)
    process.exit(1)
  })

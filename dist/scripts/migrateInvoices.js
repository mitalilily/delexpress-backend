"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../models/client");
const schema_1 = require("../schema/schema");
async function migrateOrdersToInvoices() {
    try {
        // 1. Fetch all orders from both tables
        const [b2b, b2c] = await Promise.all([
            client_1.db.select().from(schema_1.b2b_orders),
            client_1.db.select().from(schema_1.b2c_orders),
        ]);
        const allOrders = [
            ...b2b.map((o) => ({ ...o, _type: 'b2b' })),
            ...b2c.map((o) => ({ ...o, _type: 'b2c' })),
        ];
        console.log(`Found ${allOrders.length} total orders.`);
        // 2. Filter only orders with status = pickup_initiated
        const eligibleOrders = allOrders.filter((o) => o.order_status === 'pickup_initiated');
        console.log(`Found ${eligibleOrders.length} eligible orders.`);
        console.log('eligible', eligibleOrders);
        for (const order of eligibleOrders) {
            // 3. Check if invoice already exists for this orderId
            const existing = await client_1.db
                .select()
                .from(schema_1.invoices)
                .where((0, drizzle_orm_1.eq)(schema_1.invoices.invoiceNumber, order.id.toString()));
            if (existing.length > 0) {
                console.log(`⚠️ Skipping order ${order.id}, invoice already exists.`);
                continue;
            }
            // 4. Fetch invoice preferences for user
            const [prefs] = await client_1.db
                .select()
                .from(schema_1.invoicePreferences)
                .where((0, drizzle_orm_1.eq)(schema_1.invoicePreferences.userId, order.user_id));
            const invoiceNumber = `${prefs?.prefix ?? ''}${order?.invoice_number ?? order.id.toString()}${prefs?.suffix ?? ''}`;
            // 5. Insert new invoice
            await client_1.db.insert(schema_1.invoices).values({
                userId: order.user_id,
                type: order._type, // ✅ track b2b / b2c
                invoiceNumber,
                billingPeriodFrom: order.created_at ?? new Date(),
                billingPeriodTo: order.created_at ?? new Date(),
                totalOrders: 1,
                invoiceDate: new Date(),
                link: order?.invoice_link || null,
                netPayableAmount: order.order_amount,
                status: 'pending',
                items: [
                    {
                        orderId: order.id.toString(),
                        carrier: order.courier_partner ?? '',
                        weightSlab: order.weight ?? 'N/A',
                        shippingCharge: order.shipping_charges ?? 0,
                        discount: order.discount ?? 0,
                        finalCharge: order.order_amount,
                        awb: order?.awb_number,
                    },
                ],
            });
            console.log(`✅ Migrated order ${order.id} (${order._type}) → invoice`);
        }
        console.log('🎉 Migration completed successfully!');
    }
    catch (err) {
        console.error('❌ Migration failed:', err);
        process.exit(1);
    }
}
migrateOrdersToInvoices().then(() => process.exit(0));

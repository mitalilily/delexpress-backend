"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.b2b_orders = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const users_1 = require("./users");
exports.b2b_orders = (0, pg_core_1.pgTable)('b2b_orders', {
    id: (0, pg_core_1.uuid)('id').primaryKey(),
    // 🔹 User reference
    user_id: (0, pg_core_1.uuid)('user_id')
        .references(() => users_1.users.id)
        .notNull(),
    // 🔹 Company info (from B2B)
    company_name: (0, pg_core_1.varchar)('company_name', { length: 255 }),
    company_gst: (0, pg_core_1.varchar)('company_gst', { length: 50 }),
    // 🔹 Order info
    order_number: (0, pg_core_1.varchar)('order_number', { length: 50 }).notNull(),
    cod_charges: (0, pg_core_1.numeric)('cod_charges').$type(),
    order_id: (0, pg_core_1.varchar)('order_id', { length: 100 }).unique(),
    order_date: (0, pg_core_1.varchar)('order_date', { length: 50 }).notNull(),
    order_amount: (0, pg_core_1.numeric)('order_amount').notNull(),
    order_type: (0, pg_core_1.varchar)('order_type', { length: 20 }).notNull(), // prepaid | cod
    prepaid_amount: (0, pg_core_1.numeric)('prepaid_amount'),
    freight_charges: (0, pg_core_1.numeric)('freight_charges'), // What platform charges seller (based on rate card)
    shipping_charges: (0, pg_core_1.numeric)('shipping_charges'), // What seller shows on label (customer-facing)
    courier_cost: (0, pg_core_1.numeric)('courier_cost'), // What platform actually pays to courier (for revenue calculation)
    transaction_fee: (0, pg_core_1.numeric)('transaction_fee'),
    discount: (0, pg_core_1.numeric)('discount'),
    gift_wrap: (0, pg_core_1.numeric)('gift_wrap'),
    order_status: (0, pg_core_1.varchar)('order_status', { length: 50 }).default('pending'),
    invoice_number: (0, pg_core_1.varchar)('invoice_number', { length: 100 }),
    invoice_date: (0, pg_core_1.varchar)('invoice_date', { length: 50 }),
    invoice_amount: (0, pg_core_1.numeric)('invoice_amount'),
    // 🔹 Buyer info
    buyer_name: (0, pg_core_1.varchar)('buyer_name', { length: 255 }).notNull(),
    buyer_phone: (0, pg_core_1.varchar)('buyer_phone', { length: 20 }).notNull(),
    buyer_email: (0, pg_core_1.varchar)('buyer_email', { length: 255 }),
    address: (0, pg_core_1.varchar)('address', { length: 500 }).notNull(),
    city: (0, pg_core_1.varchar)('city', { length: 100 }).notNull(),
    state: (0, pg_core_1.varchar)('state', { length: 100 }).notNull(),
    country: (0, pg_core_1.varchar)('country', { length: 100 }).default('India'),
    pincode: (0, pg_core_1.varchar)('pincode', { length: 20 }).notNull(),
    label: (0, pg_core_1.varchar)('label', { length: 100 }),
    invoice_link: (0, pg_core_1.varchar)('invoice_link', { length: 300 }),
    manifest: (0, pg_core_1.varchar)('manifest', { length: 100 }),
    // 🔹 Products and packages
    products: (0, pg_core_1.jsonb)('products').notNull(),
    /* Example:
      [
        { productName, price, quantity, sku?, hsnCode?, discount?, taxRate? }
      ]
    */
    packages: (0, pg_core_1.jsonb)('packages'),
    /* Example:
      [
        {
          boxId,
          boxName,
          weight,
          length,
          breadth,
          height,
          price,
          taxRate,
          products: [
            { productName, price, quantity, sku?, hsnCode?, discount?, taxRate? }
          ]
        }
      ]
    */
    weight: (0, pg_core_1.numeric)('weight'), // Declared weight by customer
    length: (0, pg_core_1.numeric)('length'),
    breadth: (0, pg_core_1.numeric)('breadth'),
    height: (0, pg_core_1.numeric)('height'),
    // Actual weight (from courier)
    actual_weight: (0, pg_core_1.numeric)('actual_weight'), // Physical weight measured by courier
    volumetric_weight: (0, pg_core_1.numeric)('volumetric_weight'), // Calculated volumetric weight
    charged_weight: (0, pg_core_1.numeric)('charged_weight'), // Weight being charged (max of actual/volumetric)
    weight_discrepancy: (0, pg_core_1.boolean)('weight_discrepancy').default(false), // Flag if there's a weight mismatch
    // 🔹 Courier info
    courier_partner: (0, pg_core_1.varchar)('courier_partner', { length: 50 }),
    courier_id: (0, pg_core_1.numeric)('courier_id'),
    awb_number: (0, pg_core_1.varchar)('awb_number', { length: 100 }),
    shipment_id: (0, pg_core_1.varchar)('shipment_id', { length: 100 }),
    is_insurance: (0, pg_core_1.boolean)('is_insurance').default(false),
    // Declared/insured value and ROV charge (if insurance opted)
    declared_value: (0, pg_core_1.numeric)('declared_value'),
    rov_charge: (0, pg_core_1.numeric)('rov_charge'),
    // Detailed B2B charges breakdown (base freight + all applied overheads)
    charges_breakdown: (0, pg_core_1.jsonb)('charges_breakdown').$type(),
    delivery_location: (0, pg_core_1.varchar)('delivery_location', { length: 100 }),
    delivery_message: (0, pg_core_1.varchar)('delivery_message', { length: 100 }),
    // 🔹 Pickup & RTO info
    pickup_location_id: (0, pg_core_1.varchar)('pickup_location_id', { length: 50 }),
    pickup_details: (0, pg_core_1.jsonb)('pickup_details'), // warehouse_name, name, address, city, state, pincode, phone, gst_number
    rto_details: (0, pg_core_1.jsonb)('rto_details'),
    is_rto_different: (0, pg_core_1.boolean)('is_rto_different').default(false),
    // 🔹 Order source flag
    is_external_api: (0, pg_core_1.boolean)('is_external_api').default(false), // true if created via external API, false if created locally
    // 🔹 Tags / meta
    tags: (0, pg_core_1.varchar)('tags', { length: 200 }),
    // 🔹 Timestamps
    created_at: (0, pg_core_1.timestamp)('created_at').defaultNow(),
    updated_at: (0, pg_core_1.timestamp)('updated_at').defaultNow(),
}, (table) => ({
    merchantOrderNumberUnique: (0, pg_core_1.uniqueIndex)('b2b_orders_user_order_number_unique').on(table.user_id, table.order_number),
}));

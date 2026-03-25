"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.b2c_orders = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const users_1 = require("./users");
exports.b2c_orders = (0, pg_core_1.pgTable)('b2c_orders', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    // 🔹 User reference
    user_id: (0, pg_core_1.uuid)('user_id')
        .references(() => users_1.users.id)
        .notNull(),
    // Order info
    order_number: (0, pg_core_1.varchar)('order_number', { length: 50 }).notNull(), // unique order number from frontend
    order_date: (0, pg_core_1.varchar)('order_date', { length: 50 }).notNull(),
    order_amount: (0, pg_core_1.numeric)('order_amount').$type().notNull(), // total collectable amount
    order_id: (0, pg_core_1.varchar)('order_id', { length: 100 }).unique(), // unique order id from backend
    cod_charges: (0, pg_core_1.numeric)('cod_charges').$type(),
    invoice_number: (0, pg_core_1.varchar)('invoice_number', { length: 100 }),
    invoice_date: (0, pg_core_1.varchar)('invoice_date', { length: 50 }),
    invoice_amount: (0, pg_core_1.numeric)('invoice_amount').$type(),
    // Buyer info
    buyer_name: (0, pg_core_1.varchar)('buyer_name', { length: 255 }).notNull(),
    buyer_phone: (0, pg_core_1.varchar)('buyer_phone', { length: 20 }).notNull(),
    buyer_email: (0, pg_core_1.varchar)('buyer_email', { length: 255 }),
    address: (0, pg_core_1.varchar)('address', { length: 500 }).notNull(),
    city: (0, pg_core_1.varchar)('city', { length: 100 }).notNull(),
    state: (0, pg_core_1.varchar)('state', { length: 100 }).notNull(),
    country: (0, pg_core_1.varchar)('country', { length: 100 }).default('India'),
    pincode: (0, pg_core_1.varchar)('pincode', { length: 20 }).notNull(),
    // Product info
    products: (0, pg_core_1.jsonb)('products').notNull(), // array of { productName, price, quantity, sku?, hsnCode?, discount?, taxRate? }
    // Package info
    weight: (0, pg_core_1.numeric)('weight').$type().notNull(), // Declared weight by customer
    length: (0, pg_core_1.numeric)('length').$type().notNull(),
    breadth: (0, pg_core_1.numeric)('breadth').$type().notNull(),
    height: (0, pg_core_1.numeric)('height').$type().notNull(),
    // Actual weight (from courier)
    actual_weight: (0, pg_core_1.numeric)('actual_weight').$type(), // Physical weight measured by courier
    volumetric_weight: (0, pg_core_1.numeric)('volumetric_weight').$type(), // Calculated volumetric weight
    charged_weight: (0, pg_core_1.numeric)('charged_weight').$type(), // Weight being charged (max of actual/volumetric)
    weight_discrepancy: (0, pg_core_1.boolean)('weight_discrepancy').default(false), // Flag if there's a weight mismatch
    charged_slabs: (0, pg_core_1.numeric)('charged_slabs').$type(), // Number of slabs billed for the shipment
    // Charges
    order_type: (0, pg_core_1.varchar)('order_type', { length: 20 }).notNull(), // prepaid | cod
    prepaid_amount: (0, pg_core_1.numeric)('prepaid_amount').$type(),
    freight_charges: (0, pg_core_1.numeric)('freight_charges').$type(), // What platform charges seller (based on rate card)
    shipping_charges: (0, pg_core_1.numeric)('shipping_charges').$type(), // What seller shows on label (customer-facing)
    other_charges: (0, pg_core_1.numeric)('other_charges').$type(), // Other charges from courier serviceability API (e.g. fuel surcharge, handling, etc.)
    courier_cost: (0, pg_core_1.numeric)('courier_cost').$type(), // What platform actually pays to courier (for revenue calculation)
    transaction_fee: (0, pg_core_1.numeric)('transaction_fee').$type(),
    gift_wrap: (0, pg_core_1.numeric)('gift_wrap').$type(),
    discount: (0, pg_core_1.numeric)('discount').$type(),
    edd: (0, pg_core_1.varchar)('edd', { length: 120 }),
    // Order status
    order_status: (0, pg_core_1.varchar)('order_status', { length: 50 }).default('pending'), // pending | shipment_created | delivered | cancelled
    pickup_status: (0, pg_core_1.varchar)('pickup_status', { length: 50 }).default('pending'),
    pickup_error: (0, pg_core_1.varchar)('pickup_error', { length: 255 }),
    // Courier info
    courier_partner: (0, pg_core_1.varchar)('courier_partner', { length: 50 }),
    delivery_location: (0, pg_core_1.varchar)('delivery_location', { length: 100 }),
    delivery_message: (0, pg_core_1.varchar)('delivery_message', { length: 100 }),
    courier_id: (0, pg_core_1.numeric)('courier_id').$type(), // Nimbus courier id
    shipping_mode: (0, pg_core_1.varchar)('shipping_mode', { length: 50 }),
    selected_max_slab_weight: (0, pg_core_1.numeric)('selected_max_slab_weight').$type(),
    shipment_id: (0, pg_core_1.varchar)('shipment_id', { length: 100 }),
    is_insurance: (0, pg_core_1.boolean)('is_insurance').default(false),
    label: (0, pg_core_1.varchar)('label', { length: 100 }),
    // Sort / routing code from courier label (e.g. JBN/JBN/PA)
    sort_code: (0, pg_core_1.varchar)('sort_code', { length: 100 }),
    invoice_link: (0, pg_core_1.varchar)('invoice_link', { length: 300 }),
    manifest: (0, pg_core_1.varchar)('manifest', { length: 100 }),
    manifest_error: (0, pg_core_1.varchar)('manifest_error', { length: 255 }),
    manifest_retry_count: (0, pg_core_1.integer)('manifest_retry_count').default(0).notNull(),
    manifest_last_retry_at: (0, pg_core_1.timestamp)('manifest_last_retry_at'),
    awb_number: (0, pg_core_1.varchar)('awb_number', { length: 100 }),
    // Pickup & RTO info
    pickup_location_id: (0, pg_core_1.varchar)('pickup_location_id', { length: 50 }),
    pickup_details: (0, pg_core_1.jsonb)('pickup_details').$type(), // { warehouse_name, name, address, city, state, pincode, phone, gst_number }
    rto_details: (0, pg_core_1.jsonb)('rto_details'), // optional, same structure as pickup_details
    is_rto_different: (0, pg_core_1.boolean)('is_rto_different').default(false),
    integration_type: (0, pg_core_1.varchar)('integration_type').default('delhivery'),
    // Order source flag
    is_external_api: (0, pg_core_1.boolean)('is_external_api').default(false), // true if created via external API, false if created locally
    // Tags / meta
    tags: (0, pg_core_1.varchar)('tags', { length: 200 }),
    // Timestamps
    created_at: (0, pg_core_1.timestamp)('created_at').defaultNow(),
    updated_at: (0, pg_core_1.timestamp)('updated_at').defaultNow(),
}, (table) => ({
    merchantOrderNumberUnique: (0, pg_core_1.uniqueIndex)('b2c_orders_user_order_number_unique').on(table.user_id, table.order_number),
}));

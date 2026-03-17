import { boolean, integer, jsonb, numeric, pgTable, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core'
import { users } from './users'

export interface PickupDetails {
  warehouse_name: string
  address?: string
  city?: string
  state?: string
  pincode?: string
  phone?: string
}

export const b2c_orders = pgTable(
  'b2c_orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),

  // 🔹 User reference
  user_id: uuid('user_id')
    .references(() => users.id)
    .notNull(),

  // Order info
  order_number: varchar('order_number', { length: 50 }).notNull(), // unique order number from frontend
  order_date: varchar('order_date', { length: 50 }).notNull(),

  order_amount: numeric('order_amount').$type<number>().notNull(), // total collectable amount
  order_id: varchar('order_id', { length: 100 }).unique(), // unique order id from backend
  cod_charges: numeric('cod_charges').$type<number>(),
  invoice_number: varchar('invoice_number', { length: 100 }),
  invoice_date: varchar('invoice_date', { length: 50 }),
  invoice_amount: numeric('invoice_amount').$type<number>(),

  // Buyer info
  buyer_name: varchar('buyer_name', { length: 255 }).notNull(),
  buyer_phone: varchar('buyer_phone', { length: 20 }).notNull(),
  buyer_email: varchar('buyer_email', { length: 255 }),
  address: varchar('address', { length: 500 }).notNull(),
  city: varchar('city', { length: 100 }).notNull(),
  state: varchar('state', { length: 100 }).notNull(),
  country: varchar('country', { length: 100 }).default('India'),
  pincode: varchar('pincode', { length: 20 }).notNull(),

  // Product info
  products: jsonb('products').notNull(), // array of { productName, price, quantity, sku?, hsnCode?, discount?, taxRate? }

  // Package info
  weight: numeric('weight').$type<number>().notNull(), // Declared weight by customer
  length: numeric('length').$type<number>().notNull(),
  breadth: numeric('breadth').$type<number>().notNull(),
  height: numeric('height').$type<number>().notNull(),

  // Actual weight (from courier)
  actual_weight: numeric('actual_weight').$type<number>(), // Physical weight measured by courier
  volumetric_weight: numeric('volumetric_weight').$type<number>(), // Calculated volumetric weight
  charged_weight: numeric('charged_weight').$type<number>(), // Weight being charged (max of actual/volumetric)
  weight_discrepancy: boolean('weight_discrepancy').default(false), // Flag if there's a weight mismatch
  charged_slabs: numeric('charged_slabs').$type<number>(), // Number of slabs billed for the shipment

  // Charges
  order_type: varchar('order_type', { length: 20 }).notNull(), // prepaid | cod
  prepaid_amount: numeric('prepaid_amount').$type<number>(),
  freight_charges: numeric('freight_charges').$type<number>(), // What platform charges seller (based on rate card)
  shipping_charges: numeric('shipping_charges').$type<number>(), // What seller shows on label (customer-facing)
  other_charges: numeric('other_charges').$type<number>(), // Other charges from courier serviceability API (e.g. fuel surcharge, handling, etc.)
  courier_cost: numeric('courier_cost').$type<number>(), // What platform actually pays to courier (for revenue calculation)
  transaction_fee: numeric('transaction_fee').$type<number>(),
  gift_wrap: numeric('gift_wrap').$type<number>(),
  discount: numeric('discount').$type<number>(),
  edd: varchar('edd', { length: 120 }),

  // Order status
  order_status: varchar('order_status', { length: 50 }).default('pending'), // pending | shipment_created | delivered | cancelled
  pickup_status: varchar('pickup_status', { length: 50 }).default('pending'),
  pickup_error: varchar('pickup_error', { length: 255 }),

  // Courier info
  courier_partner: varchar('courier_partner', { length: 50 }),
  delivery_location: varchar('delivery_location', { length: 100 }),
  delivery_message: varchar('delivery_message', { length: 100 }),
  courier_id: numeric('courier_id').$type<number>(), // Nimbus courier id
  shipping_mode: varchar('shipping_mode', { length: 50 }),
  selected_max_slab_weight: numeric('selected_max_slab_weight').$type<number>(),
  shipment_id: varchar('shipment_id', { length: 100 }),
  is_insurance: boolean('is_insurance').default(false),
  label: varchar('label', { length: 100 }),
  // Sort / routing code from courier label (e.g. JBN/JBN/PA)
  sort_code: varchar('sort_code', { length: 100 }),
  invoice_link: varchar('invoice_link', { length: 300 }),
  manifest: varchar('manifest', { length: 100 }),
  manifest_error: varchar('manifest_error', { length: 255 }),
  manifest_retry_count: integer('manifest_retry_count').default(0).notNull(),
  manifest_last_retry_at: timestamp('manifest_last_retry_at'),

  awb_number: varchar('awb_number', { length: 100 }),

  // Pickup & RTO info
  pickup_location_id: varchar('pickup_location_id', { length: 50 }),
  pickup_details: jsonb('pickup_details').$type<PickupDetails>(), // { warehouse_name, name, address, city, state, pincode, phone, gst_number }
  rto_details: jsonb('rto_details'), // optional, same structure as pickup_details
  is_rto_different: boolean('is_rto_different').default(false),

  integration_type: varchar('integration_type').default('delhivery'),

  // Order source flag
  is_external_api: boolean('is_external_api').default(false), // true if created via external API, false if created locally

  // Tags / meta
  tags: varchar('tags', { length: 200 }),

  // Timestamps
  created_at: timestamp('created_at').defaultNow(),
    updated_at: timestamp('updated_at').defaultNow(),
  },
  (table) => ({
    merchantOrderNumberUnique: uniqueIndex('b2c_orders_user_order_number_unique').on(
      table.user_id,
      table.order_number,
    ),
  }),
)

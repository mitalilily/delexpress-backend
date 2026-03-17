import { boolean, jsonb, numeric, pgTable, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core'
import { users } from './users'

export const b2b_orders = pgTable(
  'b2b_orders',
  {
    id: uuid('id').primaryKey(),

  // 🔹 User reference
  user_id: uuid('user_id')
    .references(() => users.id)
    .notNull(),

  // 🔹 Company info (from B2B)
  company_name: varchar('company_name', { length: 255 }),
  company_gst: varchar('company_gst', { length: 50 }),

  // 🔹 Order info
  order_number: varchar('order_number', { length: 50 }).notNull(),
  cod_charges: numeric('cod_charges').$type<number>(),
  order_id: varchar('order_id', { length: 100 }).unique(),
  order_date: varchar('order_date', { length: 50 }).notNull(),
  order_amount: numeric('order_amount').notNull(),
  order_type: varchar('order_type', { length: 20 }).notNull(), // prepaid | cod
  prepaid_amount: numeric('prepaid_amount'),
  freight_charges: numeric('freight_charges'), // What platform charges seller (based on rate card)
  shipping_charges: numeric('shipping_charges'), // What seller shows on label (customer-facing)
  courier_cost: numeric('courier_cost'), // What platform actually pays to courier (for revenue calculation)
  transaction_fee: numeric('transaction_fee'),
  discount: numeric('discount'),
  gift_wrap: numeric('gift_wrap'),
  order_status: varchar('order_status', { length: 50 }).default('pending'),

  invoice_number: varchar('invoice_number', { length: 100 }),
  invoice_date: varchar('invoice_date', { length: 50 }),
  invoice_amount: numeric('invoice_amount'),

  // 🔹 Buyer info
  buyer_name: varchar('buyer_name', { length: 255 }).notNull(),
  buyer_phone: varchar('buyer_phone', { length: 20 }).notNull(),
  buyer_email: varchar('buyer_email', { length: 255 }),
  address: varchar('address', { length: 500 }).notNull(),
  city: varchar('city', { length: 100 }).notNull(),
  state: varchar('state', { length: 100 }).notNull(),
  country: varchar('country', { length: 100 }).default('India'),
  pincode: varchar('pincode', { length: 20 }).notNull(),
  label: varchar('label', { length: 100 }),
  invoice_link: varchar('invoice_link', { length: 300 }),
  manifest: varchar('manifest', { length: 100 }),

  // 🔹 Products and packages
  products: jsonb('products').notNull(),
  /* Example: 
    [
      { productName, price, quantity, sku?, hsnCode?, discount?, taxRate? }
    ]
  */
  packages: jsonb('packages'),
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
  weight: numeric('weight'), // Declared weight by customer
  length: numeric('length'),
  breadth: numeric('breadth'),
  height: numeric('height'),

  // Actual weight (from courier)
  actual_weight: numeric('actual_weight'), // Physical weight measured by courier
  volumetric_weight: numeric('volumetric_weight'), // Calculated volumetric weight
  charged_weight: numeric('charged_weight'), // Weight being charged (max of actual/volumetric)
  weight_discrepancy: boolean('weight_discrepancy').default(false), // Flag if there's a weight mismatch

  // 🔹 Courier info
  courier_partner: varchar('courier_partner', { length: 50 }),
  courier_id: numeric('courier_id'),
  awb_number: varchar('awb_number', { length: 100 }),
  shipment_id: varchar('shipment_id', { length: 100 }),
  is_insurance: boolean('is_insurance').default(false),
  // Declared/insured value and ROV charge (if insurance opted)
  declared_value: numeric('declared_value'),
  rov_charge: numeric('rov_charge'),
  // Detailed B2B charges breakdown (base freight + all applied overheads)
  charges_breakdown: jsonb('charges_breakdown').$type<{
    baseFreight: number
    total: number
    demurrage?: number
    overheads: {
      id: string
      code?: string
      name: string
      type: string
      amount: number
      description?: string
    }[]
  }>(),
  delivery_location: varchar('delivery_location', { length: 100 }),
  delivery_message: varchar('delivery_message', { length: 100 }),

  // 🔹 Pickup & RTO info
  pickup_location_id: varchar('pickup_location_id', { length: 50 }),
  pickup_details: jsonb('pickup_details'), // warehouse_name, name, address, city, state, pincode, phone, gst_number
  rto_details: jsonb('rto_details'),
  is_rto_different: boolean('is_rto_different').default(false),

  // 🔹 Order source flag
  is_external_api: boolean('is_external_api').default(false), // true if created via external API, false if created locally

  // 🔹 Tags / meta
  tags: varchar('tags', { length: 200 }),

  // 🔹 Timestamps
  created_at: timestamp('created_at').defaultNow(),
    updated_at: timestamp('updated_at').defaultNow(),
  },
  (table) => ({
    merchantOrderNumberUnique: uniqueIndex('b2b_orders_user_order_number_unique').on(
      table.user_id,
      table.order_number,
    ),
  }),
)

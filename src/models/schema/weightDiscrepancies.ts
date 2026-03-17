import { boolean, decimal, jsonb, numeric, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core'
import { b2b_orders } from './b2bOrders'
import { b2c_orders } from './b2cOrders'
import { users } from './users'

// Weight discrepancy status enum
export type WeightDiscrepancyStatus =
  | 'pending'
  | 'accepted'
  | 'disputed'
  | 'resolved'
  | 'rejected'
  | 'closed'

// Dispute status
export type DisputeStatus = 'open' | 'under_review' | 'approved' | 'rejected' | 'closed'

/**
 * Main table to track weight discrepancies between declared and actual/charged weight
 */
export const weight_discrepancies = pgTable('weight_discrepancies', {
  id: uuid('id').primaryKey().defaultRandom(),

  // Order references (one of these will be populated)
  b2c_order_id: uuid('b2c_order_id').references(() => b2c_orders.id, { onDelete: 'cascade' }),
  b2b_order_id: uuid('b2b_order_id').references(() => b2b_orders.id, { onDelete: 'cascade' }),
  order_type: varchar('order_type', { length: 10 }).notNull(), // 'b2c' or 'b2b'

  // User reference
  user_id: uuid('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),

  // Order details
  order_number: varchar('order_number', { length: 50 }).notNull(),
  awb_number: varchar('awb_number', { length: 100 }),
  courier_partner: varchar('courier_partner', { length: 50 }),

  // Weight information (in kg)
  declared_weight: numeric('declared_weight', { precision: 10, scale: 3 }).notNull(), // Weight customer declared
  actual_weight: numeric('actual_weight', { precision: 10, scale: 3 }), // Physical weight measured by courier
  volumetric_weight: numeric('volumetric_weight', { precision: 10, scale: 3 }), // Calculated volumetric weight
  charged_weight: numeric('charged_weight', { precision: 10, scale: 3 }).notNull(), // Weight courier is charging for (higher of actual/volumetric)
  weight_difference: numeric('weight_difference', { precision: 10, scale: 3 }).notNull(), // charged - declared

  // Dimension details (in cm)
  declared_dimensions: jsonb('declared_dimensions').$type<{
    length: number
    breadth: number
    height: number
  }>(),
  actual_dimensions: jsonb('actual_dimensions').$type<{
    length: number
    breadth: number
    height: number
  }>(),

  // Financial impact
  original_shipping_charge: numeric('original_shipping_charge', { precision: 10, scale: 2 }), // What was charged initially
  revised_shipping_charge: numeric('revised_shipping_charge', { precision: 10, scale: 2 }), // New charge based on actual weight
  additional_charge: numeric('additional_charge', { precision: 10, scale: 2 }).notNull(), // Difference (can be negative for refunds)
  weight_slab_original: varchar('weight_slab_original', { length: 50 }), // e.g., "0.5kg"
  weight_slab_charged: varchar('weight_slab_charged', { length: 50 }), // e.g., "1.0kg"

  // Status and resolution
  status: varchar('status', { length: 20 }).notNull().default('pending'), // pending | accepted | disputed | resolved | rejected | closed
  auto_accepted: boolean('auto_accepted').default(false), // If within threshold and auto-accepted
  acceptance_threshold: numeric('acceptance_threshold', { precision: 10, scale: 3 }), // Weight difference threshold for auto-acceptance (e.g., 0.05 kg)

  // Dispute information
  has_dispute: boolean('has_dispute').default(false),
  dispute_id: uuid('dispute_id'), // Reference to weight_disputes table

  // Courier provided data
  courier_remarks: varchar('courier_remarks', { length: 500 }),
  courier_weight_slip_url: varchar('courier_weight_slip_url', { length: 300 }), // Image/PDF proof from courier
  courier_weight_proof_images: jsonb('courier_weight_proof_images').$type<string[]>(), // URLs to weight proof images from courier
  weighing_metadata: jsonb('weighing_metadata').$type<{
    timestamp?: string
    location?: string
    operator?: string
    machineId?: string
  }>(), // Metadata from courier's weighing process
  courier_reported_at: timestamp('courier_reported_at'),

  // Admin/System notes
  admin_notes: varchar('admin_notes', { length: 1000 }),
  resolution_notes: varchar('resolution_notes', { length: 1000 }),
  resolved_by: uuid('resolved_by'), // Admin user ID
  resolved_at: timestamp('resolved_at'),

  // Metadata
  detected_at: timestamp('detected_at').defaultNow(), // When discrepancy was first detected
  created_at: timestamp('created_at').defaultNow(),
  updated_at: timestamp('updated_at').defaultNow(),
})

/**
 * Table to track disputes raised by customers on weight discrepancies
 */
export const weight_disputes = pgTable('weight_disputes', {
  id: uuid('id').primaryKey().defaultRandom(),

  // Reference to discrepancy
  discrepancy_id: uuid('discrepancy_id')
    .references(() => weight_discrepancies.id, { onDelete: 'cascade' })
    .notNull(),

  // User info
  user_id: uuid('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),

  // Dispute details
  dispute_reason: varchar('dispute_reason', { length: 100 }).notNull(), // 'incorrect_weight' | 'wrong_dimensions' | 'packaging_weight' | 'other'
  customer_comment: varchar('customer_comment', { length: 2000 }).notNull(),
  customer_evidence_urls: jsonb('customer_evidence_urls').$type<string[]>(), // Images/documents uploaded by customer

  // Customer's claimed correct weight
  customer_claimed_weight: numeric('customer_claimed_weight', { precision: 10, scale: 3 }),
  customer_claimed_dimensions: jsonb('customer_claimed_dimensions').$type<{
    length: number
    breadth: number
    height: number
  }>(),

  // Status and resolution
  status: varchar('status', { length: 20 }).notNull().default('open'), // open | under_review | approved | rejected | closed
  priority: varchar('priority', { length: 20 }).default('medium'), // low | medium | high | urgent

  // Admin response
  admin_response: varchar('admin_response', { length: 2000 }),
  reviewed_by: uuid('reviewed_by'), // Admin user ID
  reviewed_at: timestamp('reviewed_at'),

  // Resolution
  resolution: varchar('resolution', { length: 50 }), // 'weight_corrected' | 'charge_waived' | 'partial_refund' | 'rejected' | 'closed'
  refund_amount: numeric('refund_amount', { precision: 10, scale: 2 }), // If any refund was given
  final_weight: numeric('final_weight', { precision: 10, scale: 3 }), // Final agreed upon weight
  resolution_notes: varchar('resolution_notes', { length: 1000 }),

  // Timeline
  created_at: timestamp('created_at').defaultNow(),
  updated_at: timestamp('updated_at').defaultNow(),
  closed_at: timestamp('closed_at'),
})

/**
 * Table to track all weight-related changes and adjustments
 */
export const weight_adjustment_history = pgTable('weight_adjustment_history', {
  id: uuid('id').primaryKey().defaultRandom(),

  // Reference
  discrepancy_id: uuid('discrepancy_id').references(() => weight_discrepancies.id, { onDelete: 'cascade' }),
  b2c_order_id: uuid('b2c_order_id').references(() => b2c_orders.id, { onDelete: 'cascade' }),
  b2b_order_id: uuid('b2b_order_id').references(() => b2b_orders.id, { onDelete: 'cascade' }),

  // Change details
  action_type: varchar('action_type', { length: 50 }).notNull(), // 'discrepancy_detected' | 'weight_updated' | 'charge_applied' | 'refund_issued' | 'dispute_raised' | 'dispute_resolved'
  previous_weight: numeric('previous_weight', { precision: 10, scale: 3 }),
  new_weight: numeric('new_weight', { precision: 10, scale: 3 }),
  weight_difference: numeric('weight_difference', { precision: 10, scale: 3 }),

  // Financial impact
  charge_adjustment: numeric('charge_adjustment', { precision: 10, scale: 2 }), // Positive for additional charge, negative for refund

  // Who made the change
  changed_by: uuid('changed_by'), // User/Admin ID
  changed_by_type: varchar('changed_by_type', { length: 20 }), // 'system' | 'admin' | 'courier' | 'customer'
  
  // Context
  reason: varchar('reason', { length: 500 }),
  notes: varchar('notes', { length: 1000 }),
  source: varchar('source', { length: 100 }), // 'webhook' | 'manual_entry' | 'dispute_resolution' | 'api_sync'

  // Metadata
  created_at: timestamp('created_at').defaultNow(),
})

/**
 * User preferences for weight reconciliation
 */
export const weight_reconciliation_settings = pgTable('weight_reconciliation_settings', {
  id: uuid('id').primaryKey().defaultRandom(),
  user_id: uuid('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull()
    .unique(),

  // Auto-acceptance settings
  auto_accept_enabled: boolean('auto_accept_enabled').default(false),
  auto_accept_threshold_kg: numeric('auto_accept_threshold_kg', { precision: 10, scale: 3 }).default('0.05'), // Auto-accept if difference <= 50g
  auto_accept_threshold_percent: numeric('auto_accept_threshold_percent', { precision: 5, scale: 2 }).default('5'), // Auto-accept if difference <= 5%

  // Notification preferences
  notify_on_discrepancy: boolean('notify_on_discrepancy').default(true),
  notify_on_large_discrepancy: boolean('notify_on_large_discrepancy').default(true),
  large_discrepancy_threshold_kg: numeric('large_discrepancy_threshold_kg', { precision: 10, scale: 3 }).default('0.5'), // Alert if difference > 500g
  
  // Email preferences
  email_daily_summary: boolean('email_daily_summary').default(false),
  email_weekly_report: boolean('email_weekly_report').default(true),

  // Metadata
  created_at: timestamp('created_at').defaultNow(),
  updated_at: timestamp('updated_at').defaultNow(),
})


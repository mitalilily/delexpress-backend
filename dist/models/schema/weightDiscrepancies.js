"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.weight_reconciliation_settings = exports.weight_adjustment_history = exports.weight_disputes = exports.weight_discrepancies = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const b2bOrders_1 = require("./b2bOrders");
const b2cOrders_1 = require("./b2cOrders");
const users_1 = require("./users");
/**
 * Main table to track weight discrepancies between declared and actual/charged weight
 */
exports.weight_discrepancies = (0, pg_core_1.pgTable)('weight_discrepancies', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    // Order references (one of these will be populated)
    b2c_order_id: (0, pg_core_1.uuid)('b2c_order_id').references(() => b2cOrders_1.b2c_orders.id, { onDelete: 'cascade' }),
    b2b_order_id: (0, pg_core_1.uuid)('b2b_order_id').references(() => b2bOrders_1.b2b_orders.id, { onDelete: 'cascade' }),
    order_type: (0, pg_core_1.varchar)('order_type', { length: 10 }).notNull(), // 'b2c' or 'b2b'
    // User reference
    user_id: (0, pg_core_1.uuid)('user_id')
        .references(() => users_1.users.id, { onDelete: 'cascade' })
        .notNull(),
    // Order details
    order_number: (0, pg_core_1.varchar)('order_number', { length: 50 }).notNull(),
    awb_number: (0, pg_core_1.varchar)('awb_number', { length: 100 }),
    courier_partner: (0, pg_core_1.varchar)('courier_partner', { length: 50 }),
    // Weight information (in kg)
    declared_weight: (0, pg_core_1.numeric)('declared_weight', { precision: 10, scale: 3 }).notNull(), // Weight customer declared
    actual_weight: (0, pg_core_1.numeric)('actual_weight', { precision: 10, scale: 3 }), // Physical weight measured by courier
    volumetric_weight: (0, pg_core_1.numeric)('volumetric_weight', { precision: 10, scale: 3 }), // Calculated volumetric weight
    charged_weight: (0, pg_core_1.numeric)('charged_weight', { precision: 10, scale: 3 }).notNull(), // Weight courier is charging for (higher of actual/volumetric)
    weight_difference: (0, pg_core_1.numeric)('weight_difference', { precision: 10, scale: 3 }).notNull(), // charged - declared
    // Dimension details (in cm)
    declared_dimensions: (0, pg_core_1.jsonb)('declared_dimensions').$type(),
    actual_dimensions: (0, pg_core_1.jsonb)('actual_dimensions').$type(),
    // Financial impact
    original_shipping_charge: (0, pg_core_1.numeric)('original_shipping_charge', { precision: 10, scale: 2 }), // What was charged initially
    revised_shipping_charge: (0, pg_core_1.numeric)('revised_shipping_charge', { precision: 10, scale: 2 }), // New charge based on actual weight
    additional_charge: (0, pg_core_1.numeric)('additional_charge', { precision: 10, scale: 2 }).notNull(), // Difference (can be negative for refunds)
    weight_slab_original: (0, pg_core_1.varchar)('weight_slab_original', { length: 50 }), // e.g., "0.5kg"
    weight_slab_charged: (0, pg_core_1.varchar)('weight_slab_charged', { length: 50 }), // e.g., "1.0kg"
    // Status and resolution
    status: (0, pg_core_1.varchar)('status', { length: 20 }).notNull().default('pending'), // pending | accepted | disputed | resolved | rejected | closed
    auto_accepted: (0, pg_core_1.boolean)('auto_accepted').default(false), // If within threshold and auto-accepted
    acceptance_threshold: (0, pg_core_1.numeric)('acceptance_threshold', { precision: 10, scale: 3 }), // Weight difference threshold for auto-acceptance (e.g., 0.05 kg)
    // Dispute information
    has_dispute: (0, pg_core_1.boolean)('has_dispute').default(false),
    dispute_id: (0, pg_core_1.uuid)('dispute_id'), // Reference to weight_disputes table
    // Courier provided data
    courier_remarks: (0, pg_core_1.varchar)('courier_remarks', { length: 500 }),
    courier_weight_slip_url: (0, pg_core_1.varchar)('courier_weight_slip_url', { length: 300 }), // Image/PDF proof from courier
    courier_weight_proof_images: (0, pg_core_1.jsonb)('courier_weight_proof_images').$type(), // URLs to weight proof images from courier
    weighing_metadata: (0, pg_core_1.jsonb)('weighing_metadata').$type(), // Metadata from courier's weighing process
    courier_reported_at: (0, pg_core_1.timestamp)('courier_reported_at'),
    // Admin/System notes
    admin_notes: (0, pg_core_1.varchar)('admin_notes', { length: 1000 }),
    resolution_notes: (0, pg_core_1.varchar)('resolution_notes', { length: 1000 }),
    resolved_by: (0, pg_core_1.uuid)('resolved_by'), // Admin user ID
    resolved_at: (0, pg_core_1.timestamp)('resolved_at'),
    // Metadata
    detected_at: (0, pg_core_1.timestamp)('detected_at').defaultNow(), // When discrepancy was first detected
    created_at: (0, pg_core_1.timestamp)('created_at').defaultNow(),
    updated_at: (0, pg_core_1.timestamp)('updated_at').defaultNow(),
});
/**
 * Table to track disputes raised by customers on weight discrepancies
 */
exports.weight_disputes = (0, pg_core_1.pgTable)('weight_disputes', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    // Reference to discrepancy
    discrepancy_id: (0, pg_core_1.uuid)('discrepancy_id')
        .references(() => exports.weight_discrepancies.id, { onDelete: 'cascade' })
        .notNull(),
    // User info
    user_id: (0, pg_core_1.uuid)('user_id')
        .references(() => users_1.users.id, { onDelete: 'cascade' })
        .notNull(),
    // Dispute details
    dispute_reason: (0, pg_core_1.varchar)('dispute_reason', { length: 100 }).notNull(), // 'incorrect_weight' | 'wrong_dimensions' | 'packaging_weight' | 'other'
    customer_comment: (0, pg_core_1.varchar)('customer_comment', { length: 2000 }).notNull(),
    customer_evidence_urls: (0, pg_core_1.jsonb)('customer_evidence_urls').$type(), // Images/documents uploaded by customer
    // Customer's claimed correct weight
    customer_claimed_weight: (0, pg_core_1.numeric)('customer_claimed_weight', { precision: 10, scale: 3 }),
    customer_claimed_dimensions: (0, pg_core_1.jsonb)('customer_claimed_dimensions').$type(),
    // Status and resolution
    status: (0, pg_core_1.varchar)('status', { length: 20 }).notNull().default('open'), // open | under_review | approved | rejected | closed
    priority: (0, pg_core_1.varchar)('priority', { length: 20 }).default('medium'), // low | medium | high | urgent
    // Admin response
    admin_response: (0, pg_core_1.varchar)('admin_response', { length: 2000 }),
    reviewed_by: (0, pg_core_1.uuid)('reviewed_by'), // Admin user ID
    reviewed_at: (0, pg_core_1.timestamp)('reviewed_at'),
    // Resolution
    resolution: (0, pg_core_1.varchar)('resolution', { length: 50 }), // 'weight_corrected' | 'charge_waived' | 'partial_refund' | 'rejected' | 'closed'
    refund_amount: (0, pg_core_1.numeric)('refund_amount', { precision: 10, scale: 2 }), // If any refund was given
    final_weight: (0, pg_core_1.numeric)('final_weight', { precision: 10, scale: 3 }), // Final agreed upon weight
    resolution_notes: (0, pg_core_1.varchar)('resolution_notes', { length: 1000 }),
    // Timeline
    created_at: (0, pg_core_1.timestamp)('created_at').defaultNow(),
    updated_at: (0, pg_core_1.timestamp)('updated_at').defaultNow(),
    closed_at: (0, pg_core_1.timestamp)('closed_at'),
});
/**
 * Table to track all weight-related changes and adjustments
 */
exports.weight_adjustment_history = (0, pg_core_1.pgTable)('weight_adjustment_history', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    // Reference
    discrepancy_id: (0, pg_core_1.uuid)('discrepancy_id').references(() => exports.weight_discrepancies.id, { onDelete: 'cascade' }),
    b2c_order_id: (0, pg_core_1.uuid)('b2c_order_id').references(() => b2cOrders_1.b2c_orders.id, { onDelete: 'cascade' }),
    b2b_order_id: (0, pg_core_1.uuid)('b2b_order_id').references(() => b2bOrders_1.b2b_orders.id, { onDelete: 'cascade' }),
    // Change details
    action_type: (0, pg_core_1.varchar)('action_type', { length: 50 }).notNull(), // 'discrepancy_detected' | 'weight_updated' | 'charge_applied' | 'refund_issued' | 'dispute_raised' | 'dispute_resolved'
    previous_weight: (0, pg_core_1.numeric)('previous_weight', { precision: 10, scale: 3 }),
    new_weight: (0, pg_core_1.numeric)('new_weight', { precision: 10, scale: 3 }),
    weight_difference: (0, pg_core_1.numeric)('weight_difference', { precision: 10, scale: 3 }),
    // Financial impact
    charge_adjustment: (0, pg_core_1.numeric)('charge_adjustment', { precision: 10, scale: 2 }), // Positive for additional charge, negative for refund
    // Who made the change
    changed_by: (0, pg_core_1.uuid)('changed_by'), // User/Admin ID
    changed_by_type: (0, pg_core_1.varchar)('changed_by_type', { length: 20 }), // 'system' | 'admin' | 'courier' | 'customer'
    // Context
    reason: (0, pg_core_1.varchar)('reason', { length: 500 }),
    notes: (0, pg_core_1.varchar)('notes', { length: 1000 }),
    source: (0, pg_core_1.varchar)('source', { length: 100 }), // 'webhook' | 'manual_entry' | 'dispute_resolution' | 'api_sync'
    // Metadata
    created_at: (0, pg_core_1.timestamp)('created_at').defaultNow(),
});
/**
 * User preferences for weight reconciliation
 */
exports.weight_reconciliation_settings = (0, pg_core_1.pgTable)('weight_reconciliation_settings', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    user_id: (0, pg_core_1.uuid)('user_id')
        .references(() => users_1.users.id, { onDelete: 'cascade' })
        .notNull()
        .unique(),
    // Auto-acceptance settings
    auto_accept_enabled: (0, pg_core_1.boolean)('auto_accept_enabled').default(false),
    auto_accept_threshold_kg: (0, pg_core_1.numeric)('auto_accept_threshold_kg', { precision: 10, scale: 3 }).default('0.05'), // Auto-accept if difference <= 50g
    auto_accept_threshold_percent: (0, pg_core_1.numeric)('auto_accept_threshold_percent', { precision: 5, scale: 2 }).default('5'), // Auto-accept if difference <= 5%
    // Notification preferences
    notify_on_discrepancy: (0, pg_core_1.boolean)('notify_on_discrepancy').default(true),
    notify_on_large_discrepancy: (0, pg_core_1.boolean)('notify_on_large_discrepancy').default(true),
    large_discrepancy_threshold_kg: (0, pg_core_1.numeric)('large_discrepancy_threshold_kg', { precision: 10, scale: 3 }).default('0.5'), // Alert if difference > 500g
    // Email preferences
    email_daily_summary: (0, pg_core_1.boolean)('email_daily_summary').default(false),
    email_weekly_report: (0, pg_core_1.boolean)('email_weekly_report').default(true),
    // Metadata
    created_at: (0, pg_core_1.timestamp)('created_at').defaultNow(),
    updated_at: (0, pg_core_1.timestamp)('updated_at').defaultNow(),
});

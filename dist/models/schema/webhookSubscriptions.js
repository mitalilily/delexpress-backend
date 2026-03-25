"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.webhook_deliveries = exports.webhook_subscriptions = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const users_1 = require("./users");
exports.webhook_subscriptions = (0, pg_core_1.pgTable)('webhook_subscriptions', {
    id: (0, pg_core_1.uuid)('id').defaultRandom().primaryKey(),
    user_id: (0, pg_core_1.uuid)('user_id')
        .references(() => users_1.users.id, { onDelete: 'cascade' })
        .notNull(),
    // Webhook endpoint details
    url: (0, pg_core_1.varchar)('url', { length: 512 }).notNull(), // Webhook URL
    name: (0, pg_core_1.varchar)('name', { length: 255 }), // User-friendly name
    // Events to subscribe to
    events: (0, pg_core_1.jsonb)('events').$type().notNull(), // JSON array of event types
    // Security
    secret: (0, pg_core_1.varchar)('secret', { length: 255 }).notNull(), // Secret for HMAC signing
    // Status
    is_active: (0, pg_core_1.boolean)('is_active').default(true).notNull(),
    // Retry configuration
    max_retries: (0, pg_core_1.integer)('max_retries').default(3).notNull(),
    retry_delay_ms: (0, pg_core_1.integer)('retry_delay_ms').default(1000).notNull(), // Delay between retries in ms
    // Statistics
    total_attempts: (0, pg_core_1.integer)('total_attempts').default(0).notNull(),
    successful_deliveries: (0, pg_core_1.integer)('successful_deliveries').default(0).notNull(),
    failed_deliveries: (0, pg_core_1.integer)('failed_deliveries').default(0).notNull(),
    last_delivery_at: (0, pg_core_1.timestamp)('last_delivery_at', { withTimezone: true }),
    last_success_at: (0, pg_core_1.timestamp)('last_success_at', { withTimezone: true }),
    last_failure_at: (0, pg_core_1.timestamp)('last_failure_at', { withTimezone: true }),
    // Metadata
    created_at: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true })
        .defaultNow()
        .$onUpdate(() => new Date()),
});
exports.webhook_deliveries = (0, pg_core_1.pgTable)('webhook_deliveries', {
    id: (0, pg_core_1.uuid)('id').defaultRandom().primaryKey(),
    subscription_id: (0, pg_core_1.uuid)('subscription_id')
        .references(() => exports.webhook_subscriptions.id, { onDelete: 'cascade' })
        .notNull(),
    // Event details
    event_type: (0, pg_core_1.varchar)('event_type', { length: 100 }).notNull(),
    event_id: (0, pg_core_1.varchar)('event_id', { length: 255 }), // Order ID, AWB, etc.
    payload: (0, pg_core_1.jsonb)('payload').$type().notNull(), // JSON payload
    // Delivery status
    status: (0, pg_core_1.varchar)('status', { length: 50 }).notNull(), // 'pending', 'delivered', 'failed'
    http_status: (0, pg_core_1.integer)('http_status'), // HTTP status code from webhook endpoint
    response_body: (0, pg_core_1.text)('response_body'), // Response from webhook endpoint
    // Retry tracking
    attempt_count: (0, pg_core_1.integer)('attempt_count').default(0).notNull(),
    max_attempts: (0, pg_core_1.integer)('max_attempts').default(3).notNull(),
    next_retry_at: (0, pg_core_1.timestamp)('next_retry_at', { withTimezone: true }),
    // Error tracking
    error_message: (0, pg_core_1.text)('error_message'),
    // Timestamps
    created_at: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).defaultNow().notNull(),
    delivered_at: (0, pg_core_1.timestamp)('delivered_at', { withTimezone: true }),
    failed_at: (0, pg_core_1.timestamp)('failed_at', { withTimezone: true }),
});

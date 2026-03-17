import {
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'
import { users } from './users'

export const webhook_subscriptions = pgTable('webhook_subscriptions', {
  id: uuid('id').defaultRandom().primaryKey(),
  user_id: uuid('user_id')
    .references(() => users.id, { onDelete: 'cascade' })
    .notNull(),

  // Webhook endpoint details
  url: varchar('url', { length: 512 }).notNull(), // Webhook URL
  name: varchar('name', { length: 255 }), // User-friendly name

  // Events to subscribe to
  events: jsonb('events').$type<string[]>().notNull(), // JSON array of event types

  // Security
  secret: varchar('secret', { length: 255 }).notNull(), // Secret for HMAC signing

  // Status
  is_active: boolean('is_active').default(true).notNull(),

  // Retry configuration
  max_retries: integer('max_retries').default(3).notNull(),
  retry_delay_ms: integer('retry_delay_ms').default(1000).notNull(), // Delay between retries in ms

  // Statistics
  total_attempts: integer('total_attempts').default(0).notNull(),
  successful_deliveries: integer('successful_deliveries').default(0).notNull(),
  failed_deliveries: integer('failed_deliveries').default(0).notNull(),
  last_delivery_at: timestamp('last_delivery_at', { withTimezone: true }),
  last_success_at: timestamp('last_success_at', { withTimezone: true }),
  last_failure_at: timestamp('last_failure_at', { withTimezone: true }),

  // Metadata
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updated_at: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date()),
})

export const webhook_deliveries = pgTable('webhook_deliveries', {
  id: uuid('id').defaultRandom().primaryKey(),
  subscription_id: uuid('subscription_id')
    .references(() => webhook_subscriptions.id, { onDelete: 'cascade' })
    .notNull(),

  // Event details
  event_type: varchar('event_type', { length: 100 }).notNull(),
  event_id: varchar('event_id', { length: 255 }), // Order ID, AWB, etc.
  payload: jsonb('payload').$type<Record<string, any>>().notNull(), // JSON payload

  // Delivery status
  status: varchar('status', { length: 50 }).notNull(), // 'pending', 'delivered', 'failed'
  http_status: integer('http_status'), // HTTP status code from webhook endpoint
  response_body: text('response_body'), // Response from webhook endpoint

  // Retry tracking
  attempt_count: integer('attempt_count').default(0).notNull(),
  max_attempts: integer('max_attempts').default(3).notNull(),
  next_retry_at: timestamp('next_retry_at', { withTimezone: true }),

  // Error tracking
  error_message: text('error_message'),

  // Timestamps
  created_at: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  delivered_at: timestamp('delivered_at', { withTimezone: true }),
  failed_at: timestamp('failed_at', { withTimezone: true }),
})

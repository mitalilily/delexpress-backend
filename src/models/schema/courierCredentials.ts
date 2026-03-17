import { pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core'

export const courier_credentials = pgTable('courier_credentials', {
  id: uuid('id').primaryKey().defaultRandom(),
  provider: varchar('provider', { length: 100 }).notNull().unique(),
  apiBase: varchar('api_base', { length: 255 }).notNull().default(''),
  clientName: varchar('client_name', { length: 255 }).notNull().default(''),
  apiKey: varchar('api_key', { length: 255 }).notNull().default(''),
  clientId: varchar('client_id', { length: 255 }).notNull().default(''),
  username: varchar('username', { length: 255 }).notNull().default(''),
  password: varchar('password', { length: 255 }).notNull().default(''),
  webhookSecret: varchar('webhook_secret', { length: 255 }).notNull().default(''),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true })
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
})

export const courierCredentials = courier_credentials

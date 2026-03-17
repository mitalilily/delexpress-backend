import { relations } from 'drizzle-orm'
import { boolean, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core'

// Assuming you already have a users table
import { users } from './users'

export const invoicePreferences = pgTable('invoice_preferences', {
  id: uuid('id').defaultRandom().primaryKey(),

  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),

  prefix: varchar('prefix', { length: 10 }).notNull().default('INV'),
  suffix: varchar('suffix', { length: 10 }).default(''),

  template: varchar('template', { length: 20 }).notNull().default('classic'), // classic | thermal

  includeLogo: boolean('include_logo').notNull().default(true),
  includeSignature: boolean('include_signature').notNull().default(true),

  logoFile: varchar('logo_file', { length: 255 }), // store file key or URL
  signatureFile: varchar('signature_file', { length: 255 }),
  sellerName: varchar('seller_name', { length: 255 }),
  brandName: varchar('brand_name', { length: 255 }),
  gstNumber: varchar('gst_number', { length: 32 }),
  panNumber: varchar('pan_number', { length: 32 }),
  sellerAddress: text('seller_address'),
  stateCode: varchar('state_code', { length: 10 }),
  supportEmail: varchar('support_email', { length: 150 }),
  supportPhone: varchar('support_phone', { length: 50 }),
  invoiceNotes: text('invoice_notes'),
  termsAndConditions: text('terms_and_conditions'),

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

// Optional relation if you want to query with user data
export const invoicePreferencesRelations = relations(invoicePreferences, ({ one }) => ({
  user: one(users, {
    fields: [invoicePreferences.userId],
    references: [users.id],
  }),
}))

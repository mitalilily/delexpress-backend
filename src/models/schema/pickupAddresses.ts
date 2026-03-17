// drizzle/schema/pickupAddresses.ts

import { boolean, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core'
import { users } from './users'

export const addresses = pgTable('addresses', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('userId').references(() => users.id, { onDelete: 'cascade' }),
  type: varchar('type', { length: 20 }).notNull(), // 'pickup' | 'rto' | 'billing'

  contactName: varchar('contactName', { length: 100 }).notNull(),
  contactPhone: varchar('contactPhone', { length: 20 }).notNull(),
  contactEmail: varchar('contactEmail', { length: 100 }),

  addressLine1: text('addressLine1').notNull(),
  addressLine2: text('addressLine2'),
  landmark: varchar('landmark', { length: 100 }),
  addressNickname: varchar('addressNickname', { length: 100 }),

  city: varchar('city', { length: 50 }).notNull(),
  state: varchar('state', { length: 50 }).notNull(),
  country: varchar('country', { length: 50 }).default('India').notNull(),
  pincode: varchar('pincode', { length: 10 }).notNull(),

  latitude: varchar('latitude', { length: 10 }),
  longitude: varchar('longitude', { length: 100 }),

  gstNumber: varchar('gstNumber', { length: 100 }),
  createdAt: timestamp('createdAt', { withTimezone: true }).defaultNow(),
  updatedAt: timestamp('updatedAt', { withTimezone: true }).defaultNow(),
})

// pickup_addresses table just becomes a link
export const pickupAddresses = pgTable('pickup_addresses', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('userId').references(() => users.id, { onDelete: 'cascade' }),
  addressId: uuid('addressId').references(() => addresses.id, { onDelete: 'cascade' }),
  rtoAddressId: uuid('rtoAddressId').references(() => addresses.id, { onDelete: 'set null' }),
  isPrimary: boolean('isPrimary').default(false).notNull(),
  isPickupEnabled: boolean('isPickupEnabled').default(true),
  isRTOSame: boolean('isRTOSame').default(true),
})

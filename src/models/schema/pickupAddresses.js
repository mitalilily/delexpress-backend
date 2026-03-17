"use strict";
// drizzle/schema/pickupAddresses.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.pickupAddresses = exports.addresses = void 0;
var pg_core_1 = require("drizzle-orm/pg-core");
var users_1 = require("./users");
exports.addresses = (0, pg_core_1.pgTable)('addresses', {
    id: (0, pg_core_1.uuid)('id').defaultRandom().primaryKey(),
    userId: (0, pg_core_1.uuid)('userId').references(function () { return users_1.users.id; }, { onDelete: 'cascade' }),
    type: (0, pg_core_1.varchar)('type', { length: 20 }).notNull(), // 'pickup' | 'rto' | 'billing'
    contactName: (0, pg_core_1.varchar)('contactName', { length: 100 }).notNull(),
    contactPhone: (0, pg_core_1.varchar)('contactPhone', { length: 20 }).notNull(),
    contactEmail: (0, pg_core_1.varchar)('contactEmail', { length: 100 }),
    addressLine1: (0, pg_core_1.text)('addressLine1').notNull(),
    addressLine2: (0, pg_core_1.text)('addressLine2'),
    landmark: (0, pg_core_1.varchar)('landmark', { length: 100 }),
    addressNickname: (0, pg_core_1.varchar)('addressNickname', { length: 100 }),
    city: (0, pg_core_1.varchar)('city', { length: 50 }).notNull(),
    state: (0, pg_core_1.varchar)('state', { length: 50 }).notNull(),
    country: (0, pg_core_1.varchar)('country', { length: 50 }).default('India').notNull(),
    pincode: (0, pg_core_1.varchar)('pincode', { length: 10 }).notNull(),
    latitude: (0, pg_core_1.varchar)('latitude', { length: 10 }),
    longitude: (0, pg_core_1.varchar)('longitude', { length: 100 }),
    gstNumber: (0, pg_core_1.varchar)('gstNumber', { length: 100 }),
    createdAt: (0, pg_core_1.timestamp)('createdAt', { withTimezone: true }).defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)('updatedAt', { withTimezone: true }).defaultNow(),
});
// pickup_addresses table just becomes a link
exports.pickupAddresses = (0, pg_core_1.pgTable)('pickup_addresses', {
    id: (0, pg_core_1.uuid)('id').defaultRandom().primaryKey(),
    userId: (0, pg_core_1.uuid)('userId').references(function () { return users_1.users.id; }, { onDelete: 'cascade' }),
    addressId: (0, pg_core_1.uuid)('addressId').references(function () { return exports.addresses.id; }, { onDelete: 'cascade' }),
    rtoAddressId: (0, pg_core_1.uuid)('rtoAddressId').references(function () { return exports.addresses.id; }, { onDelete: 'set null' }),
    isPrimary: (0, pg_core_1.boolean)('isPrimary').default(false).notNull(),
    isPickupEnabled: (0, pg_core_1.boolean)('isPickupEnabled').default(true),
    isRTOSame: (0, pg_core_1.boolean)('isRTOSame').default(true),
});

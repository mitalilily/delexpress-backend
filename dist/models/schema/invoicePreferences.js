"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.invoicePreferencesRelations = exports.invoicePreferences = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const pg_core_1 = require("drizzle-orm/pg-core");
// Assuming you already have a users table
const users_1 = require("./users");
exports.invoicePreferences = (0, pg_core_1.pgTable)('invoice_preferences', {
    id: (0, pg_core_1.uuid)('id').defaultRandom().primaryKey(),
    userId: (0, pg_core_1.uuid)('user_id')
        .notNull()
        .references(() => users_1.users.id, { onDelete: 'cascade' }),
    prefix: (0, pg_core_1.varchar)('prefix', { length: 10 }).notNull().default('INV'),
    suffix: (0, pg_core_1.varchar)('suffix', { length: 10 }).default(''),
    template: (0, pg_core_1.varchar)('template', { length: 20 }).notNull().default('classic'), // classic | thermal
    includeLogo: (0, pg_core_1.boolean)('include_logo').notNull().default(true),
    includeSignature: (0, pg_core_1.boolean)('include_signature').notNull().default(true),
    logoFile: (0, pg_core_1.varchar)('logo_file', { length: 255 }), // store file key or URL
    signatureFile: (0, pg_core_1.varchar)('signature_file', { length: 255 }),
    sellerName: (0, pg_core_1.varchar)('seller_name', { length: 255 }),
    brandName: (0, pg_core_1.varchar)('brand_name', { length: 255 }),
    gstNumber: (0, pg_core_1.varchar)('gst_number', { length: 32 }),
    panNumber: (0, pg_core_1.varchar)('pan_number', { length: 32 }),
    sellerAddress: (0, pg_core_1.text)('seller_address'),
    stateCode: (0, pg_core_1.varchar)('state_code', { length: 10 }),
    supportEmail: (0, pg_core_1.varchar)('support_email', { length: 150 }),
    supportPhone: (0, pg_core_1.varchar)('support_phone', { length: 50 }),
    invoiceNotes: (0, pg_core_1.text)('invoice_notes'),
    termsAndConditions: (0, pg_core_1.text)('terms_and_conditions'),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
// Optional relation if you want to query with user data
exports.invoicePreferencesRelations = (0, drizzle_orm_1.relations)(exports.invoicePreferences, ({ one }) => ({
    user: one(users_1.users, {
        fields: [exports.invoicePreferences.userId],
        references: [users_1.users.id],
    }),
}));

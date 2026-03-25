"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.labelPreferences = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const pg_core_1 = require("drizzle-orm/pg-core");
const users_1 = require("./users");
const createTable = (0, pg_core_1.pgTableCreator)((name) => `meracourierwala_${name}`);
exports.labelPreferences = createTable('label_preferences', {
    id: (0, pg_core_1.uuid)('id').defaultRandom().primaryKey(),
    user_id: (0, pg_core_1.uuid)('user_id')
        .notNull()
        .references(() => users_1.users.id, { onDelete: 'cascade' }),
    printer_type: (0, pg_core_1.varchar)('printer_type', { length: 20 }).notNull().default('thermal'),
    order_info: (0, pg_core_1.jsonb)('order_info')
        .default((0, drizzle_orm_1.sql) `'{
        "orderId": true,
        "invoiceNumber": true,
        "orderDate": false,
        "invoiceDate": false,
        "orderBarcode": true,
        "invoiceBarcode": true,
        "rtoRoutingCode": true,
        "declaredValue": true,
        "cod": true,
        "awb": true,
        "terms": true
      }'::jsonb`)
        .notNull(),
    shipper_info: (0, pg_core_1.jsonb)('shipper_info')
        .default((0, drizzle_orm_1.sql) `'{
        "shipperPhone": true,
        "gstin": true,
        "shipperAddress": true,
        "rtoAddress": false,
        "sellerBrandName": true,
        "brandLogo": true
      }'::jsonb`)
        .notNull(),
    product_info: (0, pg_core_1.jsonb)('product_info')
        .default((0, drizzle_orm_1.sql) `'{
        "itemName": true,
        "productCost": true,
        "productQuantity": true,
        "skuCode": false,
        "dimension": false,
        "deadWeight": false,
        "otherCharges": true
      }'::jsonb`)
        .notNull(),
    char_limit: (0, pg_core_1.integer)('char_limit').default(25).notNull(),
    max_items: (0, pg_core_1.integer)('max_items').default(3).notNull(),
    brand_logo: (0, pg_core_1.text)('brand_logo'), // S3 key or URL
    powered_by: (0, pg_core_1.varchar)('powered_by', { length: 120 }).default('DelExpress'),
    created_at: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true })
        .defaultNow()
        .$onUpdate(() => new Date())
        .notNull(),
});

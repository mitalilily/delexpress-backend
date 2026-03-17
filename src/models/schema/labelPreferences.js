'use strict'
var __makeTemplateObject =
  (this && this.__makeTemplateObject) ||
  function (cooked, raw) {
    if (Object.defineProperty) {
      Object.defineProperty(cooked, 'raw', { value: raw })
    } else {
      cooked.raw = raw
    }
    return cooked
  }
Object.defineProperty(exports, '__esModule', { value: true })
exports.labelPreferences = void 0
var drizzle_orm_1 = require('drizzle-orm')
var pg_core_1 = require('drizzle-orm/pg-core')
var users_1 = require('./users')
var createTable = (0, pg_core_1.pgTableCreator)(function (name) {
  return 'meracourierwala_'.concat(name)
})
exports.labelPreferences = createTable('label_preferences', {
  id: (0, pg_core_1.uuid)('id').defaultRandom().primaryKey(),
  user_id: (0, pg_core_1.uuid)('user_id')
    .notNull()
    .references(
      function () {
        return users_1.users.id
      },
      { onDelete: 'cascade' },
    ),
  printer_type: (0, pg_core_1.varchar)('printer_type', { length: 20 }).notNull().default('thermal'),
  order_info: (0, pg_core_1.jsonb)('order_info')
    .default(
      (0, drizzle_orm_1.sql)(
        templateObject_1 ||
          (templateObject_1 = __makeTemplateObject(
            [
              '\'{\n        "orderId": true,\n        "invoiceNumber": true,\n        "orderDate": false,\n        "invoiceDate": false,\n        "orderBarcode": true,\n        "invoiceBarcode": true,\n        "rtoRoutingCode": true,\n        "declaredValue": true,\n        "cod": true,\n        "awb": true,\n        "terms": true\n      }\'::jsonb',
            ],
            [
              '\'{\n        "orderId": true,\n        "invoiceNumber": true,\n        "orderDate": false,\n        "invoiceDate": false,\n        "orderBarcode": true,\n        "invoiceBarcode": true,\n        "rtoRoutingCode": true,\n        "declaredValue": true,\n        "cod": true,\n        "awb": true,\n        "terms": true\n      }\'::jsonb',
            ],
          )),
      ),
    )
    .notNull(),
  shipper_info: (0, pg_core_1.jsonb)('shipper_info')
    .default(
      (0, drizzle_orm_1.sql)(
        templateObject_2 ||
          (templateObject_2 = __makeTemplateObject(
            [
              '\'{\n        "shipperPhone": true,\n        "gstin": true,\n        "shipperAddress": true,\n        "rtoAddress": false,\n        "sellerBrandName": true,\n        "brandLogo": true\n      }\'::jsonb',
            ],
            [
              '\'{\n        "shipperPhone": true,\n        "gstin": true,\n        "shipperAddress": true,\n        "rtoAddress": false,\n        "sellerBrandName": true,\n        "brandLogo": true\n      }\'::jsonb',
            ],
          )),
      ),
    )
    .notNull(),
  product_info: (0, pg_core_1.jsonb)('product_info')
    .default(
      (0, drizzle_orm_1.sql)(
        templateObject_3 ||
          (templateObject_3 = __makeTemplateObject(
            [
              '\'{\n        "itemName": true,\n        "productCost": true,\n        "productQuantity": true,\n        "skuCode": false,\n        "dimension": false,\n        "deadWeight": false,\n        "otherCharges": true\n      }\'::jsonb',
            ],
            [
              '\'{\n        "itemName": true,\n        "productCost": true,\n        "productQuantity": true,\n        "skuCode": false,\n        "dimension": false,\n        "deadWeight": false,\n        "otherCharges": true\n      }\'::jsonb',
            ],
          )),
      ),
    )
    .notNull(),
  char_limit: (0, pg_core_1.integer)('char_limit').default(25).notNull(),
  max_items: (0, pg_core_1.integer)('max_items').default(3).notNull(),
  brand_logo: (0, pg_core_1.text)('brand_logo'), // S3 key or URL
  powered_by: (0, pg_core_1.varchar)('powered_by', { length: 120 }).default('Mera Courier Wala'),
  created_at: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).defaultNow().notNull(),
  updated_at: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true })
    .defaultNow()
    .$onUpdate(function () {
      return new Date()
    })
    .notNull(),
})
var templateObject_1, templateObject_2, templateObject_3

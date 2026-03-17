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
exports.locations = void 0
var drizzle_orm_1 = require('drizzle-orm')
var pg_core_1 = require('drizzle-orm/pg-core')
var createTable = (0, pg_core_1.pgTableCreator)(function (name) {
  return 'meracourierwala_'.concat(name)
})
exports.locations = createTable('locations', {
  id: (0, pg_core_1.uuid)('id').defaultRandom().primaryKey(),
  pincode: (0, pg_core_1.varchar)('pincode', { length: 15 }).notNull(),
  city: (0, pg_core_1.varchar)('city', { length: 120 }).notNull(),
  state: (0, pg_core_1.varchar)('state', { length: 120 }).notNull(),
  country: (0, pg_core_1.varchar)('country', { length: 120 }).default('India').notNull(),
  // Use jsonb for flexibility of multiple tags (metro, regional, special, etc.)
  tags: (0, pg_core_1.jsonb)('tags')
    .default(
      (0, drizzle_orm_1.sql)(
        templateObject_1 ||
          (templateObject_1 = __makeTemplateObject(["'[]'::jsonb"], ["'[]'::jsonb"])),
      ),
    )
    .notNull(),
  created_at: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).defaultNow().notNull(),
})
var templateObject_1

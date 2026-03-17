"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.stores = void 0;
var pg_core_1 = require("drizzle-orm/pg-core");
var platform_1 = require("./platform");
var users_1 = require("./users");
exports.stores = (0, pg_core_1.pgTable)("stores", {
    id: (0, pg_core_1.varchar)("id", { length: 50 }).primaryKey(), // platform store ID (e.g., Shopify shop id or Woo store uuid)
    name: (0, pg_core_1.varchar)("name", { length: 255 }),
    userId: (0, pg_core_1.uuid)("userId")
        .references(function () { return users_1.users.id; }, { onDelete: "cascade" })
        .unique()
        .notNull(),
    domain: (0, pg_core_1.varchar)("domain", { length: 255 }).notNull(),
    platformId: (0, pg_core_1.integer)("platformId")
        .notNull()
        .references(function () { return platform_1.platforms.id; }),
    apiKey: (0, pg_core_1.varchar)("apiKey", { length: 255 }).notNull(),
    adminApiAccessToken: (0, pg_core_1.varchar)("adminApiAccessToken", {
        length: 255,
    }).notNull(),
    settings: (0, pg_core_1.jsonb)("settings").default({}).notNull(),
    timezone: (0, pg_core_1.varchar)("timezone", { length: 100 }),
    country: (0, pg_core_1.varchar)("country", { length: 100 }),
    currency: (0, pg_core_1.varchar)("currency", { length: 10 }),
    metadata: (0, pg_core_1.jsonb)("metadata"), // store full JSON if needed
    createdAt: (0, pg_core_1.timestamp)("createdAt", { withTimezone: true }).defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)("updatedAt", { withTimezone: true }).defaultNow(),
});

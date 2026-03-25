"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.courierCredentials = exports.courier_credentials = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
exports.courier_credentials = (0, pg_core_1.pgTable)('courier_credentials', {
    id: (0, pg_core_1.uuid)('id').primaryKey().defaultRandom(),
    provider: (0, pg_core_1.varchar)('provider', { length: 100 }).notNull().unique(),
    apiBase: (0, pg_core_1.varchar)('api_base', { length: 255 }).notNull().default(''),
    clientName: (0, pg_core_1.varchar)('client_name', { length: 255 }).notNull().default(''),
    apiKey: (0, pg_core_1.varchar)('api_key', { length: 255 }).notNull().default(''),
    clientId: (0, pg_core_1.varchar)('client_id', { length: 255 }).notNull().default(''),
    username: (0, pg_core_1.varchar)('username', { length: 255 }).notNull().default(''),
    password: (0, pg_core_1.varchar)('password', { length: 255 }).notNull().default(''),
    webhookSecret: (0, pg_core_1.varchar)('webhook_secret', { length: 255 }).notNull().default(''),
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true })
        .defaultNow()
        .$onUpdate(() => new Date())
        .notNull(),
});
exports.courierCredentials = exports.courier_credentials;

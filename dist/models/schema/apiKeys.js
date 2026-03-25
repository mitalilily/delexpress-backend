"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.api_keys = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const pg_core_1 = require("drizzle-orm/pg-core");
const users_1 = require("./users");
exports.api_keys = (0, pg_core_1.pgTable)('api_keys', {
    id: (0, pg_core_1.uuid)('id').defaultRandom().primaryKey(),
    user_id: (0, pg_core_1.uuid)('user_id')
        .references(() => users_1.users.id, { onDelete: 'cascade' })
        .notNull(),
    // API Key details
    key_name: (0, pg_core_1.varchar)('key_name', { length: 255 }).notNull(), // User-friendly name for the key
    api_key: (0, pg_core_1.varchar)('api_key', { length: 255 }).notNull().unique(), // The actual API key (hashed)
    api_secret: (0, pg_core_1.varchar)('api_secret', { length: 255 }).notNull(), // Secret for webhook signing
    // Permissions
    permissions: (0, pg_core_1.jsonb)('permissions')
        .$type()
        .default((0, drizzle_orm_1.sql) `'[]'::jsonb`), // JSON array of permissions
    // Status
    is_active: (0, pg_core_1.boolean)('is_active').default(true).notNull(),
    last_used_at: (0, pg_core_1.timestamp)('last_used_at', { withTimezone: true }),
    // Metadata
    created_at: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).defaultNow().notNull(),
    updated_at: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true })
        .defaultNow()
        .$onUpdate(() => new Date()),
});

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.billingPreferences = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
const users_1 = require("./users");
exports.billingPreferences = (0, pg_core_1.pgTable)('billing_preferences', {
    id: (0, pg_core_1.uuid)('id').defaultRandom().primaryKey(),
    userId: (0, pg_core_1.uuid)('user_id')
        .notNull()
        .references(() => users_1.users.id, { onDelete: 'cascade' }),
    // 'weekly' | 'monthly' | 'manual' | 'custom'
    frequency: (0, pg_core_1.varchar)('frequency', { length: 20 }).default('weekly'),
    autoGenerate: (0, pg_core_1.boolean)('auto_generate').default(true),
    // Used only if frequency = 'custom'
    customFrequencyDays: (0, pg_core_1.integer)('custom_frequency_days'),
    createdAt: (0, pg_core_1.timestamp)('created_at').defaultNow(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at').defaultNow(),
});

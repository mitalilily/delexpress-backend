"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.paymentOptions = void 0;
const pg_core_1 = require("drizzle-orm/pg-core");
/**
 * Global payment options settings
 * This table stores a single row with global payment options configuration
 */
exports.paymentOptions = (0, pg_core_1.pgTable)('payment_options', {
    id: (0, pg_core_1.uuid)('id').defaultRandom().primaryKey(),
    // Payment type availability
    codEnabled: (0, pg_core_1.boolean)('cod_enabled').default(true).notNull(),
    prepaidEnabled: (0, pg_core_1.boolean)('prepaid_enabled').default(true).notNull(),
    // Minimum wallet recharge amount in smallest currency unit (e.g. INR rupees)
    // 0 = no minimum enforced
    minWalletRecharge: (0, pg_core_1.integer)('min_wallet_recharge').default(0).notNull(),
    // Metadata
    createdAt: (0, pg_core_1.timestamp)('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: (0, pg_core_1.timestamp)('updated_at', { withTimezone: true })
        .defaultNow()
        .$onUpdate(() => new Date())
        .notNull(),
});

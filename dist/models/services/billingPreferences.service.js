"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BillingPreferencesService = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../client");
const billingPreferences_1 = require("../schema/billingPreferences");
class BillingPreferencesService {
    // Fetch a user's billing preference
    static async getByUserId(userId) {
        const rows = await client_1.db
            .select()
            .from(billingPreferences_1.billingPreferences)
            .where((0, drizzle_orm_1.eq)(billingPreferences_1.billingPreferences.userId, userId))
            .limit(1);
        // rows is an array; return first element or null
        return rows.length ? rows[0] : null;
    }
    // Create or update a user's billing preference
    static async upsert(userId, data) {
        const existing = await client_1.db
            .select()
            .from(billingPreferences_1.billingPreferences)
            .where((0, drizzle_orm_1.eq)(billingPreferences_1.billingPreferences.userId, userId))
            .limit(1);
        if (existing) {
            await client_1.db
                .update(billingPreferences_1.billingPreferences)
                .set({
                frequency: data.frequency,
                autoGenerate: data.autoGenerate,
                customFrequencyDays: data.frequency === 'custom' ? data.customFrequencyDays : null,
                updatedAt: new Date(),
            })
                .where((0, drizzle_orm_1.eq)(billingPreferences_1.billingPreferences.userId, userId));
            return 'updated';
        }
        else {
            await client_1.db.insert(billingPreferences_1.billingPreferences).values({
                userId,
                frequency: data.frequency,
                autoGenerate: data.autoGenerate,
                customFrequencyDays: data.frequency === 'custom' ? data.customFrequencyDays : null,
            });
            return 'created';
        }
    }
}
exports.BillingPreferencesService = BillingPreferencesService;

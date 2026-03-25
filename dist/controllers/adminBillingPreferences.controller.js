"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdminBillingPreferencesController = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const billingPreferences_service_1 = require("../models/services/billingPreferences.service");
const client_1 = require("../models/client");
const schema_1 = require("../schema/schema");
class AdminBillingPreferencesController {
    /**
     * POST /api/admin/billing-preferences/user
     * Update billing preference for a specific user
     */
    static async upsertForUser(req, res) {
        try {
            const { userId, frequency, autoGenerate, customFrequencyDays } = req.body;
            if (!userId) {
                res.status(400).json({ message: 'userId is required' });
                return;
            }
            if (!['weekly', 'monthly', 'manual', 'custom'].includes(frequency)) {
                res.status(400).json({ message: 'Invalid frequency type' });
                return;
            }
            // Ensure user exists
            const [user] = await client_1.db
                .select({ id: schema_1.users.id })
                .from(schema_1.users)
                .where((0, drizzle_orm_1.eq)(schema_1.users.id, userId));
            if (!user) {
                res.status(404).json({ message: 'User not found' });
                return;
            }
            await billingPreferences_service_1.BillingPreferencesService.upsert(userId, {
                frequency,
                autoGenerate,
                customFrequencyDays,
            });
            res.json({ message: 'Billing preference updated successfully for user' });
        }
        catch (error) {
            console.error('Error updating billing preference for user:', error);
            res.status(500).json({ message: 'Internal server error' });
        }
    }
    /**
     * POST /api/admin/billing-preferences/all
     * Apply a billing preference to all users
     */
    static async applyToAllUsers(req, res) {
        try {
            const { frequency, autoGenerate, customFrequencyDays } = req.body;
            if (!['weekly', 'monthly', 'manual', 'custom'].includes(frequency)) {
                res.status(400).json({ message: 'Invalid frequency type' });
                return;
            }
            const allUsers = await client_1.db.select({ id: schema_1.users.id }).from(schema_1.users);
            for (const u of allUsers) {
                await billingPreferences_service_1.BillingPreferencesService.upsert(u.id, {
                    frequency,
                    autoGenerate,
                    customFrequencyDays,
                });
            }
            res.json({ message: 'Billing preferences applied to all users successfully' });
        }
        catch (error) {
            console.error('Error applying billing preference to all users:', error);
            res.status(500).json({ message: 'Internal server error' });
        }
    }
}
exports.AdminBillingPreferencesController = AdminBillingPreferencesController;

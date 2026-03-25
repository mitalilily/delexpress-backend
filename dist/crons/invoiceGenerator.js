"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateAutoBillingInvoices = void 0;
const dayjs_1 = __importDefault(require("dayjs"));
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../models/client");
const billingInvoices_1 = require("../models/schema/billingInvoices");
const invoiceGeneration_service_1 = require("../models/services/invoiceGeneration.service");
const schema_1 = require("../schema/schema");
// 🕑 Runs every day at 2 AM
const generateAutoBillingInvoices = async ({ force = false } = {}) => {
    console.log('🧾 Running automated invoice generation cron:', new Date().toISOString());
    try {
        const allUsers = await client_1.db.select().from(schema_1.users);
        for (const user of allUsers) {
            const userId = user.id;
            // Fetch preference
            const [pref] = await client_1.db
                .select()
                .from(schema_1.billingPreferences)
                .where((0, drizzle_orm_1.eq)(schema_1.billingPreferences.userId, userId))
                .limit(1);
            const autoGenerate = pref?.autoGenerate ?? true;
            const frequency = pref?.frequency ?? 'monthly';
            const customFrequencyDays = pref?.customFrequencyDays ?? null;
            // Skip if auto-generate is disabled (unless force)
            if (!autoGenerate && !force) {
                console.log(`⏭️ Skipping user ${userId}: auto-generate disabled`);
                continue;
            }
            // Skip if frequency is 'manual' (unless force)
            if (frequency === 'manual' && !force) {
                console.log(`⏭️ Skipping user ${userId}: manual billing frequency`);
                continue;
            }
            // Calculate interval days based on frequency
            let intervalDays = 30; // default monthly
            if (frequency === 'weekly')
                intervalDays = 7;
            else if (frequency === 'monthly')
                intervalDays = 30;
            else if (frequency === 'custom' && customFrequencyDays)
                intervalDays = customFrequencyDays;
            else if (frequency === 'custom' && !customFrequencyDays) {
                console.log(`⚠️ Skipping user ${userId}: custom frequency but no customFrequencyDays set`);
                continue;
            }
            // Get last invoice to determine next billing period
            const [lastInvoice] = await client_1.db
                .select()
                .from(billingInvoices_1.billingInvoices)
                .where((0, drizzle_orm_1.eq)(billingInvoices_1.billingInvoices.sellerId, userId))
                .orderBy((0, drizzle_orm_1.desc)(billingInvoices_1.billingInvoices.billingEnd))
                .limit(1);
            const today = (0, dayjs_1.default)().startOf('day');
            let startDate;
            let endDate;
            let shouldGenerate = false;
            if (lastInvoice?.billingEnd) {
                // Use the billing end date of the last invoice to determine the next period
                const lastBillingEnd = (0, dayjs_1.default)(lastInvoice.billingEnd).startOf('day');
                const nextBillingStart = lastBillingEnd.add(1, 'day').startOf('day');
                const nextBillingEnd = nextBillingStart.add(intervalDays - 1, 'day').endOf('day');
                // Generate if today is on or after the next billing end date
                shouldGenerate = today.isAfter(nextBillingEnd) || today.isSame(nextBillingEnd, 'day');
                if (shouldGenerate || force) {
                    startDate = nextBillingStart.toDate();
                    endDate = today.endOf('day').toDate();
                }
                else {
                    console.log(`⏭️ Skipping user ${userId}: next billing period ends ${nextBillingEnd.format('DD MMM YYYY')} (today: ${today.format('DD MMM YYYY')})`);
                    continue;
                }
            }
            else {
                // No previous invoice - generate from intervalDays ago to today
                startDate = today.subtract(intervalDays, 'day').startOf('day').toDate();
                endDate = today.endOf('day').toDate();
                shouldGenerate = true;
            }
            // ✅ allow force regenerate
            if (!shouldGenerate && !force)
                continue;
            // Check orders...
            const [b2cCount] = await client_1.db
                .select({ count: (0, drizzle_orm_1.sql) `COUNT(*)` })
                .from(schema_1.b2c_orders)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.b2c_orders.user_id, userId), (0, drizzle_orm_1.between)(schema_1.b2c_orders.created_at, startDate, endDate), (0, drizzle_orm_1.eq)(schema_1.b2c_orders.order_status, 'pickup_initiated')));
            const [b2bCount] = await client_1.db
                .select({ count: (0, drizzle_orm_1.sql) `COUNT(*)` })
                .from(schema_1.b2b_orders)
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(schema_1.b2b_orders.user_id, userId), (0, drizzle_orm_1.between)(schema_1.b2b_orders.created_at, startDate, endDate), (0, drizzle_orm_1.eq)(schema_1.b2b_orders.order_status, 'pickup_initiated')));
            const totalOrders = (b2cCount?.count ?? 0) + (b2bCount?.count ?? 0);
            if (totalOrders === 0) {
                console.log(`⚠️ Skipping user ${userId}: no delivered orders in this period.`);
                continue;
            }
            console.log(`🧾 Generating invoice for user ${userId} (${totalOrders} orders, ${frequency} frequency, period: ${(0, dayjs_1.default)(startDate).format('DD MMM YYYY')} → ${(0, dayjs_1.default)(endDate).format('DD MMM YYYY')})`);
            // 🧹 Optional: if forcing, delete previous invoice in same range
            if (force && lastInvoice) {
                await client_1.db.delete(billingInvoices_1.billingInvoices).where((0, drizzle_orm_1.eq)(billingInvoices_1.billingInvoices.id, lastInvoice.id));
                console.log(`🗑️ Deleted old invoice ${lastInvoice.invoiceNo} for ${userId}`);
            }
            await (0, invoiceGeneration_service_1.generateInvoiceForUser)(userId, { startDate, endDate });
        }
        console.log('✅ Invoice generation cron completed successfully');
    }
    catch (err) {
        console.error('❌ Invoice cron failed:', err);
    }
};
exports.generateAutoBillingInvoices = generateAutoBillingInvoices;

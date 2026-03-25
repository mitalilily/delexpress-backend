"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * Seed Ekart courier row and B2C slab rates from forwardRateCardData.json.
 * - Creates courier (serviceProvider='ekart') if missing.
 * - Uses first available plan as target plan (or PLAN_ID env override).
 * - Inserts/updates shipping_rates for zones A-E (forward/rto) for Ekart entries.
 *
 * Run with:  npx tsx src/scripts/seedEkartRates.ts
 */
const forwardRateCardData_json_1 = __importDefault(require("./forwardRateCardData.json"));
const client_1 = require("../models/client");
const couriers_1 = require("../models/schema/couriers");
const plans_1 = require("../models/schema/plans");
const shippingRates_1 = require("../models/schema/shippingRates");
const zones_1 = require("../models/schema/zones");
const drizzle_orm_1 = require("drizzle-orm");
const crypto_1 = __importDefault(require("crypto"));
const EKART_PROVIDER = 'ekart';
async function ensureEkartCourier() {
    const existing = await client_1.db
        .select()
        .from(couriers_1.couriers)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(couriers_1.couriers.serviceProvider, EKART_PROVIDER), (0, drizzle_orm_1.eq)(couriers_1.couriers.id, couriers_1.couriers.id)));
    if (existing.length) {
        return existing[0];
    }
    // Pick next available ID
    const [maxRow] = await client_1.db
        .select({ max: (0, drizzle_orm_1.sql) `COALESCE(MAX(${couriers_1.couriers.id}), 0)` })
        .from(couriers_1.couriers);
    const nextId = Number(maxRow?.max ?? 0) + 1;
    const [inserted] = await client_1.db
        .insert(couriers_1.couriers)
        .values({
        id: nextId,
        name: 'Ekart',
        serviceProvider: EKART_PROVIDER,
        businessType: ['b2c'],
        isEnabled: true,
    })
        .returning();
    return inserted;
}
async function pickPlanId() {
    if (process.env.PLAN_ID)
        return process.env.PLAN_ID;
    const [plan] = await client_1.db.select().from(plans_1.plans).limit(1);
    if (!plan)
        throw new Error('No plans found; set PLAN_ID env or create a plan first.');
    return plan.id;
}
async function loadZones() {
    const rows = await client_1.db.select({ id: zones_1.zones.id, code: zones_1.zones.code }).from(zones_1.zones);
    const map = {};
    rows.forEach((z) => {
        const key = (z.code || '').trim().toUpperCase().replace('ZONE ', '');
        if (key)
            map[key] = z.id;
    });
    return map;
}
async function upsertRate(opts) {
    const existing = await client_1.db
        .select({ id: shippingRates_1.shippingRates.id })
        .from(shippingRates_1.shippingRates)
        .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(shippingRates_1.shippingRates.courier_id, opts.courierId), (0, drizzle_orm_1.eq)(shippingRates_1.shippingRates.plan_id, opts.planId), (0, drizzle_orm_1.eq)(shippingRates_1.shippingRates.business_type, 'b2c'), (0, drizzle_orm_1.eq)(shippingRates_1.shippingRates.zone_id, opts.zoneId), (0, drizzle_orm_1.eq)(shippingRates_1.shippingRates.type, opts.type)))
        .limit(1);
    const payload = {
        plan_id: opts.planId,
        courier_id: opts.courierId,
        courier_name: opts.courierName,
        service_provider: EKART_PROVIDER,
        mode: opts.mode ?? '',
        business_type: 'b2c',
        min_weight: opts.minWeight.toString(),
        zone_id: opts.zoneId,
        type: opts.type,
        rate: opts.rate.toString(),
        cod_charges: opts.codCharges?.toString() ?? null,
        cod_percent: opts.codPercent?.toString() ?? null,
        other_charges: opts.otherCharges?.toString() ?? null,
        last_updated: new Date(),
    };
    if (existing.length) {
        await client_1.db.update(shippingRates_1.shippingRates).set(payload).where((0, drizzle_orm_1.eq)(shippingRates_1.shippingRates.id, existing[0].id));
        console.log(`↻ Updated ${opts.type} rate for zone ${opts.zoneId}`);
    }
    else {
        await client_1.db.insert(shippingRates_1.shippingRates).values({ id: crypto_1.default.randomUUID(), ...payload });
        console.log(`➕ Inserted ${opts.type} rate for zone ${opts.zoneId}`);
    }
}
async function main() {
    const courier = await ensureEkartCourier();
    const planId = await pickPlanId();
    const zoneMap = await loadZones();
    const ekartRows = forwardRateCardData_json_1.default.filter((r) => (r.courier_name || '').toLowerCase().includes('ekart'));
    if (!ekartRows.length) {
        throw new Error('No Ekart rows found in forwardRateCardData.json');
    }
    for (const row of ekartRows) {
        const mode = row.mode || '';
        const minWeight = Number(row.min_weight || 0);
        const zoneKeys = ['A', 'B', 'C', 'D', 'E'];
        for (const z of zoneKeys) {
            const zoneId = zoneMap[z];
            if (!zoneId) {
                console.warn(`⚠️ Zone ${z} not found in DB, skipping`);
                continue;
            }
            const forwardRate = row[`zone_${z.toLowerCase()}_forward`];
            const rtoRate = row[`zone_${z.toLowerCase()}_rto`];
            if (forwardRate != null) {
                await upsertRate({
                    courierId: courier.id,
                    courierName: row.courier_name,
                    planId,
                    zoneId,
                    type: 'forward',
                    rate: Number(forwardRate),
                    mode,
                    minWeight,
                    codCharges: row.cod_charges ?? null,
                    codPercent: row.cod_percent ?? null,
                    otherCharges: row.other_charges ?? null,
                });
            }
            if (rtoRate != null) {
                await upsertRate({
                    courierId: courier.id,
                    courierName: row.courier_name,
                    planId,
                    zoneId,
                    type: 'rto',
                    rate: Number(rtoRate),
                    mode,
                    minWeight,
                    codCharges: row.cod_charges ?? null,
                    codPercent: row.cod_percent ?? null,
                    otherCharges: row.other_charges ?? null,
                });
            }
        }
    }
    console.log('✅ Ekart courier and rates seeded.');
    process.exit(0);
}
main().catch((err) => {
    console.error('❌ Ekart seed failed:', err);
    process.exit(1);
});

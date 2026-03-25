"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../models/client");
const couriers_1 = require("../models/schema/couriers");
const xpressbees_service_1 = require("../models/services/couriers/xpressbees.service");
const SERVICE_PROVIDER = 'xpressbees';
async function main() {
    const xpressbees = new xpressbees_service_1.XpressbeesService();
    const response = await xpressbees.listCouriers();
    if (response?.status !== true || !Array.isArray(response?.data)) {
        throw new Error('Invalid Xpressbees courier list response');
    }
    const rows = response.data;
    if (!rows.length) {
        console.log('No Xpressbees couriers returned by API.');
        return;
    }
    let created = 0;
    let updated = 0;
    let skipped = 0;
    for (const row of rows) {
        const courierId = Number(String(row?.id || '').trim());
        const courierName = String(row?.name || '').trim();
        if (!Number.isFinite(courierId) || !courierName) {
            skipped += 1;
            console.warn('Skipping invalid Xpressbees courier row:', row);
            continue;
        }
        const [existing] = await client_1.db
            .select()
            .from(couriers_1.couriers)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(couriers_1.couriers.id, courierId), (0, drizzle_orm_1.eq)(couriers_1.couriers.serviceProvider, SERVICE_PROVIDER)))
            .limit(1);
        if (existing) {
            const shouldUpdate = existing.name !== courierName ||
                existing.isEnabled !== true ||
                JSON.stringify(existing.businessType || []) !== JSON.stringify(['b2c']);
            if (shouldUpdate) {
                await client_1.db
                    .update(couriers_1.couriers)
                    .set({
                    name: courierName,
                    isEnabled: true,
                    businessType: ['b2c'],
                    updatedAt: new Date(),
                })
                    .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(couriers_1.couriers.id, courierId), (0, drizzle_orm_1.eq)(couriers_1.couriers.serviceProvider, SERVICE_PROVIDER)));
                updated += 1;
                console.log(`↻ Updated Xpressbees courier ${courierId} ${courierName}`);
            }
            else {
                skipped += 1;
            }
            continue;
        }
        await client_1.db
            .insert(couriers_1.couriers)
            .values({
            id: courierId,
            name: courierName,
            serviceProvider: SERVICE_PROVIDER,
            businessType: ['b2c'],
            isEnabled: true,
        });
        created += 1;
        console.log(`➕ Inserted Xpressbees courier ${courierId} ${courierName}`);
    }
    console.log(`✅ Xpressbees courier sync complete. created=${created} updated=${updated} skipped=${skipped}`);
}
main().catch((error) => {
    console.error('❌ Xpressbees courier sync failed:', error);
    process.exit(1);
});

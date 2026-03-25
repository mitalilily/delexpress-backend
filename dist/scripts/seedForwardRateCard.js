"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const client_1 = require("../models/client");
const schema_1 = require("../schema/schema");
async function seedShippingRates() {
    try {
        // Fetch zones, plans, and couriers from DB
        const zoneRows = await client_1.db.select().from(schema_1.zones);
        const planRows = await client_1.db.select().from(schema_1.plans);
        const courierRows = await client_1.db.select().from(schema_1.couriers);
        const courierNames = courierRows.map((c) => ({ name: c.name, id: c?.id }));
        const businessTypes = ['b2b', 'b2c'];
        console.log('Seeding shipping rates...');
        for (const plan of planRows) {
            for (const businessType of businessTypes) {
                if (businessType === 'b2b') {
                    // Each zone has a single courier
                    for (const [i, zone] of zoneRows.entries()) {
                        const courier = courierNames[i % courierNames.length]; // assign courier in round-robin
                        // Forward rate
                        await client_1.db.insert(schema_1.shippingRates).values({
                            plan_id: plan.id,
                            courier_name: courier?.name,
                            courier_id: courier?.id,
                            mode: 'air',
                            business_type: businessType,
                            min_weight: '0.5',
                            zone_id: zone.id,
                            type: 'forward',
                            rate: '100.00',
                            cod_charges: '50.00',
                            cod_percent: '2.00',
                            other_charges: '20.00',
                        });
                        // RTO rate
                        await client_1.db.insert(schema_1.shippingRates).values({
                            plan_id: plan.id,
                            courier_name: courier?.name,
                            courier_id: courier?.id,
                            mode: 'air',
                            business_type: businessType,
                            min_weight: '0.5',
                            zone_id: zone.id,
                            type: 'rto',
                            rate: '60.00',
                            cod_charges: '50.00',
                            cod_percent: '2.00',
                            other_charges: '20.00',
                        });
                    }
                }
                else {
                    // B2C: each zone can have multiple couriers
                    for (const zone of zoneRows) {
                        for (const courier of courierNames) {
                            // Forward rate
                            await client_1.db.insert(schema_1.shippingRates).values({
                                plan_id: plan.id,
                                courier_name: courier?.name,
                                courier_id: courier?.id,
                                mode: 'air',
                                business_type: businessType,
                                min_weight: '0.5',
                                zone_id: zone.id,
                                type: 'forward',
                                rate: '120.00',
                                cod_charges: '50.00',
                                cod_percent: '2.00',
                                other_charges: '20.00',
                            });
                            // RTO rate
                            await client_1.db.insert(schema_1.shippingRates).values({
                                plan_id: plan.id,
                                courier_name: courier?.name,
                                courier_id: courier?.id,
                                mode: 'air',
                                business_type: businessType,
                                min_weight: '0.5',
                                zone_id: zone.id,
                                type: 'rto',
                                rate: '70.00',
                                cod_charges: '50.00',
                                cod_percent: '2.00',
                                other_charges: '20.00',
                            });
                        }
                    }
                }
            }
        }
        console.log('✅ Shipping rates seeded successfully!');
    }
    catch (err) {
        console.error('❌ Error seeding shipping rates:', err);
    }
    finally {
        process.exit(0);
    }
}
seedShippingRates();

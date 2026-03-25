"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../models/client");
const schema_1 = require("../schema/schema");
async function seedZones() {
    try {
        console.log('🌍 Seeding zones for B2B and B2C...');
        const baseZones = [
            { code: 'A', name: 'Zone A', description: 'Covers primary metro cities' },
            { code: 'B', name: 'Zone B', description: 'Tier 2 cities coverage' },
            { code: 'C', name: 'Zone C', description: 'Tier 3 cities coverage' },
            { code: 'D', name: 'Zone D', description: 'Remote and rural areas' },
            { code: 'E', name: 'Zone E', description: 'Special handling required' },
            { code: 'SPECIAL', name: 'Special Zone', description: 'Custom rules and exceptions' },
        ];
        // create entries for both business types
        const allZones = [];
        for (const businessType of ['B2B', 'B2C']) {
            for (const zone of baseZones) {
                allZones.push({
                    code: `${zone.code}_${businessType}`, // ensure uniqueness in "code"
                    name: `${zone.name} (${businessType})`,
                    description: zone.description,
                    business_type: businessType,
                    created_at: (0, drizzle_orm_1.sql) `NOW()`,
                });
            }
        }
        for (const zone of allZones) {
            await client_1.db.insert(schema_1.zones).values(zone).onConflictDoNothing({ target: schema_1.zones.code }); // avoid duplicates
        }
        console.log('✅ Zones seeded successfully for both B2B and B2C');
        process.exit(0);
    }
    catch (err) {
        console.error('❌ Error seeding zones:', err);
        process.exit(1);
    }
}
seedZones();

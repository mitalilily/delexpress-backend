"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.seedZoneMappingsFromAPI = seedZoneMappingsFromAPI;
const axios_1 = __importDefault(require("axios"));
const client_1 = require("../models/client");
const schema_1 = require("../schema/schema");
const CHUNK_SIZE = 2000; // DB insert chunk size
const FETCH_LIMIT = 5000; // API fetch limit per request
function determineZone(record) {
    const state = record.statename.toUpperCase();
    const pincodePrefix = record.pincode?.toString().charAt(0);
    // Zone A – Local / nearby
    const zoneA = ['DELHI', 'HARYANA', 'HIMACHAL PRADESH', 'PUNJAB'];
    // Zone B – Within state
    const zoneB = ['MAHARASHTRA', 'GOA'];
    // Zone C – Within region
    const zoneC = ['WEST BENGAL', 'BIHAR', 'JHARKHAND', 'ODISHA'];
    // Zone D – Metro to Metro or Northern & North-East
    const zoneD = [
        'RAJASTHAN',
        'GUJARAT',
        'ASSAM',
        'MEGHALAYA',
        'NAGALAND',
        'MANIPUR',
        'TRIPURA',
        'MIZORAM',
        'SIKKIM',
        'ARUNACHAL PRADESH',
    ];
    // Zone E – Rest of India (southern / central)
    const zoneE = [
        'ANDHRA PRADESH',
        'TELANGANA',
        'KARNATAKA',
        'TAMIL NADU',
        'KERALA',
        'MADHYA PRADESH',
        'CHHATTISGARH',
        'UTTAR PRADESH',
        'UTTARAKHAND',
    ];
    // Zone S – Special handling (UTs)
    const zoneS = [
        'JAMMU & KASHMIR',
        'LADAKH',
        'ANDAMAN & NICOBAR',
        'CHANDIGARH',
        'DADRA & NAGAR HAVELI & DAMAN & DIU',
        'LAKSHADWEEP',
        'PUDUCHERRY',
        'DELHI',
    ];
    if (zoneA.includes(state))
        return 'A';
    if (zoneB.includes(state))
        return 'B';
    if (zoneC.includes(state))
        return 'C';
    if (zoneD.includes(state))
        return 'D';
    if (zoneE.includes(state))
        return 'E';
    if (zoneS.includes(state))
        return 'S';
    // fallback: use pincode prefix
    switch (pincodePrefix) {
        case '1':
            return 'A';
        case '2':
            return 'B';
        case '3':
            return 'C';
        case '4':
            return 'D';
        case '5':
            return 'E';
        case '6':
            return 'S';
        default:
            return 'E';
    }
}
async function seedZoneMappingsFromAPI() {
    try {
        console.log('Fetching zone mapping data...');
        const zonesArray = await client_1.db.select({ id: schema_1.zones.id, code: schema_1.zones.code }).from(schema_1.zones);
        let offset = 0;
        let insertedCount = 0;
        const startTime = Date.now();
        const existingKeys = new Set(); // deduplicate by pincode+city
        while (true) {
            const response = await axios_1.default.get('https://api.data.gov.in/resource/5c2f62fe-5afa-4119-a499-fec9d604d5bd', {
                params: {
                    'api-key': '579b464db66ec23bdd000001cdc3b564546246a772a26393094f5645',
                    offset,
                    limit: FETCH_LIMIT,
                    format: 'json',
                },
                timeout: 60000,
            });
            const records = response.data.records || [];
            if (records.length === 0)
                break; // stop when no more records
            console.log(`Fetched ${records.length} records (offset ${offset})`);
            // for (let i = 0; i < records.length; i += CHUNK_SIZE) {
            //   const chunk = records.slice(i, i + CHUNK_SIZE)
            //   const insertValues: {
            //     id: string
            //     zone_id: string
            //     pincode: string
            //     city: string
            //     state: string
            //     created_at: Date
            //   }[] = chunk
            //     .map((record: any) => {
            //       const zoneCode = determineZone(record)
            //       const matchedZone = zonesArray.find((z) => z.code === zoneCode)
            //       if (!matchedZone) return null
            //       const cityName = record.district || record.officename
            //       const key = `${record.pincode}-${cityName}`
            //       if (existingKeys.has(key)) return null
            //       existingKeys.add(key)
            //       return {
            //         id: uuidv4(),
            //         zone_id: matchedZone.id,
            //         pincode: record.pincode.toString(),
            //         city: cityName,
            //         state: record.statename,
            //         created_at: new Date(),
            //       }
            //     })
            //     .filter(
            //       (
            //         v,
            //       ): v is {
            //         id: string
            //         zone_id: string
            //         pincode: string
            //         city: string
            //         state: string
            //         created_at: Date
            //       } => v !== null,
            //     )
            //   if (insertValues.length) {
            //     await db.insert(zoneMappings).values(insertValues)
            //     insertedCount += insertValues.length
            //     // Progress logging (approximate ETA)
            //     const elapsed = (Date.now() - startTime) / 1000
            //     const progress = insertedCount
            //     const eta = Math.round((elapsed / progress) * (165628 - progress))
            //     console.log(`Inserted ${insertedCount}/165628, ETA: ${eta}s`)
            //   }
            // }
            offset += FETCH_LIMIT;
        }
        console.log(`All ${insertedCount} zone mappings seeded successfully!`);
    }
    catch (err) {
        if (err instanceof Error)
            console.error('Error seeding zone mappings:', err.message);
        else
            console.error('Unknown error seeding zone mappings:', err);
    }
}
seedZoneMappingsFromAPI().then(() => process.exit(0));

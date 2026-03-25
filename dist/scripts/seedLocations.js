"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// src/scripts/seedLocations.ts
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const xlsx_1 = __importDefault(require("xlsx"));
const client_1 = require("../models/client");
const schema_1 = require("../schema/schema");
const DATA_DIR = path_1.default.resolve('src/scripts/data');
const CHUNK_SIZE = 10;
// ---------- Helpers ----------
function normalize(x) {
    return (x ?? '').toString().trim();
}
const SPECIAL_ZONE_STATES = new Set([
    'Arunachal Pradesh',
    'Assam',
    'Manipur',
    'Meghalaya',
    'Mizoram',
    'Nagaland',
    'Tripura',
    'Jammu and Kashmir',
].map((s) => s.toLowerCase()));
function mapRow(raw) {
    const pincode = normalize(raw['Pincode']);
    if (!pincode || !/^\d{6}$/.test(pincode))
        return null;
    const state = normalize(raw['HubState']);
    const city = normalize(raw['BillingCity']);
    const billingZone = normalize(raw['BillingZone']);
    const cityType = normalize(raw['City Type']);
    const tags = [];
    if (billingZone)
        tags.push(billingZone.toLowerCase());
    if (cityType)
        tags.push(cityType.toLowerCase());
    if (state && SPECIAL_ZONE_STATES.has(state.toLowerCase())) {
        tags.push('special_zone');
    }
    return { pincode, city, state, country: 'India', tags };
}
// ---------- Insert helper ----------
async function insertBatch(rows) {
    if (!rows.length)
        return;
    const values = rows.map((r) => ({
        pincode: r.pincode,
        city: r.city,
        state: r.state,
        country: r.country,
        tags: Array.isArray(r.tags) ? r.tags : [], // force array
        created_at: new Date(),
    }));
    for (const zone of values) {
        console.log('inserting:', zone.pincode, 'tags:', JSON.stringify(zone.tags));
        await client_1.db.insert(schema_1.locations).values(zone); // Drizzle insert
    }
    console.log(`✅ Inserted ${rows.length} rows`);
}
// ---------- Main import ----------
async function importXlsx(filename) {
    const fullPath = path_1.default.join(DATA_DIR, filename);
    if (!fs_1.default.existsSync(fullPath)) {
        console.error('File not found:', fullPath);
        return;
    }
    console.log('📂 Reading XLSX:', fullPath);
    const wb = xlsx_1.default.readFile(fullPath);
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const jsonRows = xlsx_1.default.utils.sheet_to_json(sheet, { defval: '' });
    console.log('Total rows parsed:', jsonRows.length);
    let batch = [];
    let processed = 0;
    for (const raw of jsonRows) {
        const mapped = mapRow(raw);
        if (!mapped)
            continue;
        batch.push(mapped);
        if (batch.length >= CHUNK_SIZE) {
            await insertBatch(batch);
            processed += batch.length;
            if (processed % 1000 === 0)
                console.log(`➡️  Processed ${processed} rows...`);
            batch = [];
        }
    }
    if (batch.length) {
        await insertBatch(batch);
        processed += batch.length;
    }
    console.log(`✅ Import finished. Total inserted: ${processed}`);
}
// ---------- CLI ----------
;
(async () => {
    const arg = process.argv[2];
    if (!arg) {
        console.error('Usage: node dist/scripts/seedLocations.js <file.xlsx>');
        process.exit(1);
    }
    try {
        await importXlsx(arg);
    }
    catch (err) {
        console.error('Import failed:', err.message);
        process.exitCode = 1;
    }
})();

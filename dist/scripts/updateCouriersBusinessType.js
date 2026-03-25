"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const dotenv = __importStar(require("dotenv"));
require("dotenv/config");
const drizzle_orm_1 = require("drizzle-orm");
const path = __importStar(require("path"));
const client_1 = require("../models/client");
const couriers_1 = require("../models/schema/couriers");
// Load environment file based on NODE_ENV
const env = process.env.NODE_ENV || 'development';
const envFilePath = path.resolve(__dirname, `../../.env.${env}`);
console.log(`🔍 Loading env file: ${envFilePath}`);
dotenv.config({ path: envFilePath });
async function updateCouriersBusinessType() {
    try {
        console.log('🔄 Starting courier business type update...');
        // First, check how many couriers exist
        const allCouriers = await client_1.db
            .select({
            id: couriers_1.couriers.id,
            name: couriers_1.couriers.name,
            serviceProvider: couriers_1.couriers.serviceProvider,
            businessType: couriers_1.couriers.businessType,
        })
            .from(couriers_1.couriers);
        console.log(`📊 Found ${allCouriers.length} courier(s) in the database`);
        if (allCouriers.length === 0) {
            console.log('ℹ️ No couriers found to update');
            return;
        }
        // Show current state
        console.log('\n📋 Current courier business types:');
        allCouriers.forEach((c) => {
            console.log(`  - ${c.name} (ID: ${c.id}, Provider: ${c.serviceProvider}): ${JSON.stringify(c.businessType)}`);
        });
        // Update all couriers to support both B2C and B2B
        // Since couriers table has composite primary key (id, serviceProvider),
        // we need to update each courier individually
        let updateCount = 0;
        for (const courier of allCouriers) {
            await client_1.db
                .update(couriers_1.couriers)
                .set({
                businessType: ['b2c', 'b2b'],
                updatedAt: new Date(),
            })
                .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(couriers_1.couriers.id, courier.id), (0, drizzle_orm_1.eq)(couriers_1.couriers.serviceProvider, courier.serviceProvider)));
            updateCount++;
            console.log(`  ✓ Updated: ${courier.name} (ID: ${courier.id}, Provider: ${courier.serviceProvider})`);
        }
        console.log(`\n✅ Updated ${updateCount} courier(s) to support both B2C and B2B`);
        // Verify the update
        const updatedCouriers = await client_1.db
            .select({ id: couriers_1.couriers.id, name: couriers_1.couriers.name, businessType: couriers_1.couriers.businessType })
            .from(couriers_1.couriers);
        console.log('\n✅ Verification - Updated courier business types:');
        updatedCouriers.forEach((c) => {
            console.log(`  - ${c.name} (ID: ${c.id}): ${JSON.stringify(c.businessType)}`);
        });
        console.log('\n🎉 All couriers have been successfully updated!');
    }
    catch (error) {
        console.error('❌ Error updating courier business types:', error.message);
        console.error(error.stack);
        throw error;
    }
    finally {
        // Close the database connection pool
        await client_1.pool.end();
        console.log('\n🔌 Database connection closed');
    }
}
// Run the script
updateCouriersBusinessType()
    .then(() => {
    console.log('\n✨ Script completed successfully');
    process.exit(0);
})
    .catch((err) => {
    console.error('\n💥 Fatal error:', err);
    process.exit(1);
});

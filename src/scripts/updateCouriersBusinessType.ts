import * as dotenv from 'dotenv'
import 'dotenv/config'
import { and, eq } from 'drizzle-orm'
import * as path from 'path'
import { db, pool } from '../models/client'
import { couriers } from '../models/schema/couriers'

// Load environment file based on NODE_ENV
const env = process.env.NODE_ENV || 'development'
const envFilePath = path.resolve(__dirname, `../../.env.${env}`)
console.log(`🔍 Loading env file: ${envFilePath}`)
dotenv.config({ path: envFilePath })

async function updateCouriersBusinessType() {
  try {
    console.log('🔄 Starting courier business type update...')

    // First, check how many couriers exist
    const allCouriers = await db
      .select({
        id: couriers.id,
        name: couriers.name,
        serviceProvider: couriers.serviceProvider,
        businessType: couriers.businessType,
      })
      .from(couriers)

    console.log(`📊 Found ${allCouriers.length} courier(s) in the database`)

    if (allCouriers.length === 0) {
      console.log('ℹ️ No couriers found to update')
      return
    }

    // Show current state
    console.log('\n📋 Current courier business types:')
    allCouriers.forEach((c) => {
      console.log(
        `  - ${c.name} (ID: ${c.id}, Provider: ${c.serviceProvider}): ${JSON.stringify(
          c.businessType,
        )}`,
      )
    })

    // Update all couriers to support both B2C and B2B
    // Since couriers table has composite primary key (id, serviceProvider),
    // we need to update each courier individually
    let updateCount = 0
    for (const courier of allCouriers) {
      await db
        .update(couriers)
        .set({
          businessType: ['b2c', 'b2b'] as any,
          updatedAt: new Date(),
        })
        .where(
          and(eq(couriers.id, courier.id), eq(couriers.serviceProvider, courier.serviceProvider)),
        )
      updateCount++
      console.log(
        `  ✓ Updated: ${courier.name} (ID: ${courier.id}, Provider: ${courier.serviceProvider})`,
      )
    }

    console.log(`\n✅ Updated ${updateCount} courier(s) to support both B2C and B2B`)

    // Verify the update
    const updatedCouriers = await db
      .select({ id: couriers.id, name: couriers.name, businessType: couriers.businessType })
      .from(couriers)

    console.log('\n✅ Verification - Updated courier business types:')
    updatedCouriers.forEach((c) => {
      console.log(`  - ${c.name} (ID: ${c.id}): ${JSON.stringify(c.businessType)}`)
    })

    console.log('\n🎉 All couriers have been successfully updated!')
  } catch (error: any) {
    console.error('❌ Error updating courier business types:', error.message)
    console.error(error.stack)
    throw error
  } finally {
    // Close the database connection pool
    await pool.end()
    console.log('\n🔌 Database connection closed')
  }
}

// Run the script
updateCouriersBusinessType()
  .then(() => {
    console.log('\n✨ Script completed successfully')
    process.exit(0)
  })
  .catch((err) => {
    console.error('\n💥 Fatal error:', err)
    process.exit(1)
  })

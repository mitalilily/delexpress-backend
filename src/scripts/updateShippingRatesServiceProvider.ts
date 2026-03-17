/**
 * Script to auto-fill service_provider column in shipping_rates table
 * from couriers table based on courier_id matching
 */

import { eq } from 'drizzle-orm'
import { db, pool } from '../models/client'
import { couriers } from '../models/schema/couriers'

async function updateShippingRatesServiceProvider() {
  try {
    console.log('🔄 Starting correction of service_provider in shipping_rates table...')

    // Get all shipping_rates to check and correct service_provider values
    // Using raw SQL via pool since the service_provider column might not be in the compiled schema yet
    // Include both courier_id and courier_name for accurate matching
    const result = await pool.query<{
      id: string
      courier_id: number
      courier_name: string
      service_provider: string | null
    }>('SELECT id, courier_id, courier_name, service_provider FROM shipping_rates')

    const ratesArray = result.rows || []
    console.log(`📊 Found ${ratesArray.length} shipping_rates to check`)

    if (ratesArray.length === 0) {
      console.log('✅ No shipping_rates found.')
      return
    }

    let updatedCount = 0
    let correctCount = 0
    let skippedCount = 0
    const errors: Array<{ courier_id: number; courier_name: string; error: string }> = []

    // Check and correct each shipping_rate
    for (const rate of ratesArray) {
      try {
        // Find matching courier - match on both courier_id AND courier_name
        // to get the correct service_provider (couriers table has composite PK: id, serviceProvider)
        const matchingCouriers = await db
          .select({
            serviceProvider: couriers.serviceProvider,
            name: couriers.name,
          })
          .from(couriers)
          .where(eq(couriers.id, rate.courier_id))

        if (matchingCouriers.length === 0) {
          console.warn(
            `⚠️  No courier found for courier_id: ${rate.courier_id} (shipping_rate id: ${rate.id})`,
          )
          skippedCount++
          errors.push({
            courier_id: rate.courier_id,
            courier_name: rate.courier_name,
            error: 'No matching courier found',
          })
          continue
        }

        // If multiple matches, try to match by courier_name as well
        let matchedCourier = matchingCouriers.find((c) => c.name === rate.courier_name)

        // If no exact name match, take the first one (fallback)
        if (!matchedCourier) {
          matchedCourier = matchingCouriers[0]
          console.warn(
            `⚠️  Courier name mismatch for courier_id ${rate.courier_id}: shipping_rate has "${rate.courier_name}", courier has "${matchedCourier.name}". Using first match.`,
          )
        }

        const correctServiceProvider = matchedCourier.serviceProvider
        const currentServiceProvider = rate.service_provider

        // Check if service_provider needs to be updated
        if (currentServiceProvider === correctServiceProvider) {
          correctCount++
          continue // Already correct, skip
        }

        // Update the shipping_rate using raw SQL to avoid schema compilation issues
        await pool.query('UPDATE shipping_rates SET service_provider = $1 WHERE id = $2', [
          correctServiceProvider,
          rate.id,
        ])

        updatedCount++
        if (updatedCount <= 10 || updatedCount % 100 === 0) {
          console.log(
            `✅ Corrected shipping_rate ${rate.id}: courier_id=${rate.courier_id}, courier_name="${
              rate.courier_name
            }" → service_provider changed from "${
              currentServiceProvider || 'NULL'
            }" to "${correctServiceProvider}"`,
          )
        }
        if (updatedCount % 100 === 0) {
          console.log(`📝 Progress: ${updatedCount} corrected, ${correctCount} already correct...`)
        }
      } catch (error) {
        console.error(
          `❌ Error updating shipping_rate ${rate.id} (courier_id: ${rate.courier_id}):`,
          error,
        )
        skippedCount++
        errors.push({
          courier_id: rate.courier_id,
          courier_name: rate.courier_name,
          error: error instanceof Error ? error.message : String(error),
        })
      }
    }

    console.log('\n📊 Correction Summary:')
    console.log(`✅ Corrected/Updated: ${updatedCount}`)
    console.log(`✓  Already correct: ${correctCount}`)
    console.log(`⚠️  Skipped/Failed: ${skippedCount}`)
    console.log(`📈 Total processed: ${ratesArray.length}`)

    if (errors.length > 0) {
      console.log('\n❌ Errors encountered:')
      errors.slice(0, 10).forEach((err) => {
        console.log(
          `  - courier_id ${err.courier_id}, courier_name "${err.courier_name}": ${err.error}`,
        )
      })
      if (errors.length > 10) {
        console.log(`  ... and ${errors.length - 10} more errors`)
      }
    }

    console.log('\n✅ Script completed!')
  } catch (error) {
    console.error('❌ Fatal error:', error)
    throw error
  }
}

// Run the script
updateShippingRatesServiceProvider()
  .then(() => {
    console.log('🎉 Script finished successfully')
    process.exit(0)
  })
  .catch((error) => {
    console.error('💥 Script failed:', error)
    process.exit(1)
  })

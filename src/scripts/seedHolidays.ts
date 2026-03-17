import 'dotenv/config'
import { seedDefaultNationalHolidays } from '../models/services/holiday.service'

/**
 * Script to seed Indian national holidays for the current year and next year
 * Run this once to populate the holidays table with default national holidays
 *
 * Usage: npx ts-node src/scripts/seedHolidays.ts [year]
 * Example: npx ts-node src/scripts/seedHolidays.ts 2024
 */
async function seedHolidays() {
  const args = process.argv.slice(2)
  const year = args[0] ? parseInt(args[0], 10) : undefined

  if (year && (isNaN(year) || year < 2020 || year > 2100)) {
    console.error('❌ Invalid year. Please provide a year between 2020 and 2100')
    process.exit(1)
  }

  try {
    console.log('🌍 Seeding Indian national holidays...')
    console.log(`📅 Year: ${year || 'Current year and next year'}`)
    console.log('')

    if (year) {
      // Seed for specific year
      const result = await seedDefaultNationalHolidays(year)
      console.log(`✅ Seeded holidays for ${year}`)
      console.log(`   Created: ${result.created.length} new holidays`)
      console.log(`   Skipped: ${result.skipped.length} existing holidays`)
      console.log(`   Total: ${result.total} holidays processed`)
    } else {
      // Seed for current year and next year
      const currentYear = new Date().getFullYear()
      const nextYear = currentYear + 1

      console.log(`📅 Seeding ${currentYear}...`)
      const currentResult = await seedDefaultNationalHolidays(currentYear)
      console.log(
        `   ✅ Created: ${currentResult.created.length}, Skipped: ${currentResult.skipped.length}`,
      )
      console.log('')

      console.log(`📅 Seeding ${nextYear}...`)
      const nextResult = await seedDefaultNationalHolidays(nextYear)
      console.log(
        `   ✅ Created: ${nextResult.created.length}, Skipped: ${nextResult.skipped.length}`,
      )
      console.log('')

      const totalCreated = currentResult.created.length + nextResult.created.length
      const totalSkipped = currentResult.skipped.length + nextResult.skipped.length

      console.log('📊 Summary:')
      console.log(`   Total Created: ${totalCreated} holidays`)
      console.log(`   Total Skipped: ${totalSkipped} holidays`)
    }

    console.log('')
    console.log('🎉 Holiday seeding completed successfully!')
  } catch (error: any) {
    console.error('❌ Error seeding holidays:', error.message)
    console.error(error)
    process.exit(1)
  }
}

seedHolidays().then(() => process.exit(0))

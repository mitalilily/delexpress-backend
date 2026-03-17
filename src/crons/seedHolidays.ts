import { seedDefaultNationalHolidays } from '../models/services/holiday.service'

/**
 * Cron job to automatically seed holidays on January 1st of each year
 * Seeds holidays for the current year and next year to ensure coverage
 */
export const seedHolidaysCron = async ({ force = false } = {}) => {
  const currentDate = new Date()
  const currentYear = currentDate.getFullYear()
  const currentMonth = currentDate.getMonth() + 1 // 1-12
  const currentDay = currentDate.getDate()

  // Only run on January 1st (unless forced)
  if (!force && (currentMonth !== 1 || currentDay !== 1)) {
    console.log(
      `⏭️ Skipping holiday seeding: not January 1st (today: ${currentDay}/${currentMonth}/${currentYear})`,
    )
    return
  }

  console.log('🌍 Running automated holiday seeding cron:', currentDate.toISOString())
  console.log(`📅 Seeding holidays for ${currentYear} and ${currentYear + 1}`)

  try {
    // Seed current year
    console.log(`\n📅 Seeding ${currentYear}...`)
    const currentResult = await seedDefaultNationalHolidays(currentYear)
    console.log(
      `   ✅ ${currentYear}: Created ${currentResult.created.length}, Skipped ${currentResult.skipped.length}`,
    )

    // Seed next year
    const nextYear = currentYear + 1
    console.log(`\n📅 Seeding ${nextYear}...`)
    const nextResult = await seedDefaultNationalHolidays(nextYear)
    console.log(
      `   ✅ ${nextYear}: Created ${nextResult.created.length}, Skipped ${nextResult.skipped.length}`,
    )

    const totalCreated = currentResult.created.length + nextResult.created.length
    const totalSkipped = currentResult.skipped.length + nextResult.skipped.length

    console.log('\n📊 Summary:')
    console.log(`   Total Created: ${totalCreated} holidays`)
    console.log(`   Total Skipped: ${totalSkipped} holidays`)
    console.log('✅ Holiday seeding cron completed successfully')
  } catch (error: any) {
    console.error('❌ Holiday seeding cron failed:', error.message)
    console.error(error)
  }
}

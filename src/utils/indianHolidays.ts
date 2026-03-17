/**
 * Calculate Indian national holidays for a given year
 * Returns actual dates for holidays (including variable dates like Diwali, Holi, etc.)
 */
export const getIndianNationalHolidays = (year: number) => {
  const holidays: Array<{ name: string; date: string; isRecurring: boolean }> = []

  // Fixed date holidays (recurring) - National Holidays
  holidays.push({
    name: "New Year's Day",
    date: `${year}-01-01`,
    isRecurring: true,
  })

  holidays.push({
    name: 'Republic Day',
    date: `${year}-01-26`,
    isRecurring: true,
  })

  holidays.push({
    name: 'Independence Day',
    date: `${year}-08-15`,
    isRecurring: true,
  })

  holidays.push({
    name: 'Gandhi Jayanti',
    date: `${year}-10-02`,
    isRecurring: true,
  })

  holidays.push({
    name: 'Christmas',
    date: `${year}-12-25`,
    isRecurring: true,
  })

  // Variable date holidays (calculated for specific year)
  // Note: These are approximations. For production, use a proper holiday calculation library
  // or API like https://date.nager.at/api/v3/PublicHolidays/${year}/IN

  // Holi - usually in March, varies by year
  // Approximate calculation: Holi is on the full moon day of Phalguna month
  // For 2024: March 25, 2025: March 14, 2026: March 3
  const holiDates: Record<number, string> = {
    2024: `${year}-03-25`,
    2025: `${year}-03-14`,
    2026: `${year}-03-03`,
    2027: `${year}-03-22`,
    2028: `${year}-03-11`,
  }
  holidays.push({
    name: 'Holi',
    date: holiDates[year] || `${year}-03-25`, // Fallback
    isRecurring: false,
  })

  // Good Friday - varies by year (Easter - 2 days)
  // Approximate dates
  const goodFridayDates: Record<number, string> = {
    2024: `${year}-03-29`,
    2025: `${year}-04-18`,
    2026: `${year}-04-03`,
    2027: `${year}-03-26`,
    2028: `${year}-04-14`,
  }
  holidays.push({
    name: 'Good Friday',
    date: goodFridayDates[year] || `${year}-04-07`, // Fallback
    isRecurring: false,
  })

  // Dussehra - varies by year (usually in October)
  const dussehraDates: Record<number, string> = {
    2024: `${year}-10-12`,
    2025: `${year}-10-02`,
    2026: `${year}-10-22`,
    2027: `${year}-10-11`,
    2028: `${year}-09-30`,
  }
  holidays.push({
    name: 'Dussehra',
    date: dussehraDates[year] || `${year}-10-12`, // Fallback
    isRecurring: false,
  })

  // Diwali - varies by year (usually in October/November)
  const diwaliDates: Record<number, string> = {
    2024: `${year}-11-01`,
    2025: `${year}-10-20`,
    2026: `${year}-11-08`,
    2027: `${year}-10-29`,
    2028: `${year}-10-17`,
  }
  holidays.push({
    name: 'Diwali',
    date: diwaliDates[year] || `${year}-11-01`, // Fallback
    isRecurring: false,
  })

  // Lohri - January 13 (Punjab and Northern states)
  holidays.push({
    name: 'Lohri',
    date: `${year}-01-13`,
    isRecurring: true,
  })

  // Makar Sankranti / Pongal - January 14-15
  holidays.push({
    name: 'Makar Sankranti',
    date: `${year}-01-14`,
    isRecurring: true,
  })

  holidays.push({
    name: 'Pongal',
    date: `${year}-01-15`,
    isRecurring: true,
  })

  // Vasant Panchami - usually late January/early February
  const vasantPanchamiDates: Record<number, string> = {
    2024: `${year}-02-14`,
    2025: `${year}-02-03`,
    2026: `${year}-01-23`,
    2027: `${year}-02-10`,
    2028: `${year}-01-31`,
  }
  holidays.push({
    name: 'Vasant Panchami',
    date: vasantPanchamiDates[year] || `${year}-02-03`,
    isRecurring: false,
  })

  // Maha Shivaratri - varies by year
  const shivaratriDates: Record<number, string> = {
    2024: `${year}-03-08`,
    2025: `${year}-02-26`,
    2026: `${year}-02-15`,
    2027: `${year}-03-07`,
    2028: `${year}-02-24`,
  }
  holidays.push({
    name: 'Maha Shivaratri',
    date: shivaratriDates[year] || `${year}-02-26`,
    isRecurring: false,
  })

  // Ram Navami - varies by year
  const ramNavamiDates: Record<number, string> = {
    2024: `${year}-04-17`,
    2025: `${year}-04-06`,
    2026: `${year}-03-27`,
    2027: `${year}-04-15`,
    2028: `${year}-04-04`,
  }
  holidays.push({
    name: 'Ram Navami',
    date: ramNavamiDates[year] || `${year}-04-06`,
    isRecurring: false,
  })

  // Eid ul-Fitr - varies by year (approximate dates)
  const eidFitrDates: Record<number, string> = {
    2024: `${year}-04-11`,
    2025: `${year}-03-31`,
    2026: `${year}-03-21`,
    2027: `${year}-04-09`,
    2028: `${year}-03-29`,
  }
  holidays.push({
    name: 'Eid ul-Fitr',
    date: eidFitrDates[year] || `${year}-04-11`,
    isRecurring: false,
  })

  // Raksha Bandhan - varies by year
  const rakshaBandhanDates: Record<number, string> = {
    2024: `${year}-08-19`,
    2025: `${year}-08-09`,
    2026: `${year}-08-28`,
    2027: `${year}-08-17`,
    2028: `${year}-08-06`,
  }
  holidays.push({
    name: 'Raksha Bandhan',
    date: rakshaBandhanDates[year] || `${year}-08-19`,
    isRecurring: false,
  })

  // Janmashtami - varies by year
  const janmashtamiDates: Record<number, string> = {
    2024: `${year}-08-26`,
    2025: `${year}-08-15`,
    2026: `${year}-09-03`,
    2027: `${year}-08-24`,
    2028: `${year}-08-12`,
  }
  holidays.push({
    name: 'Janmashtami',
    date: janmashtamiDates[year] || `${year}-08-26`,
    isRecurring: false,
  })

  // Ganesh Chaturthi - varies by year
  const ganeshChaturthiDates: Record<number, string> = {
    2024: `${year}-09-07`,
    2025: `${year}-08-27`,
    2026: `${year}-09-15`,
    2027: `${year}-09-05`,
    2028: `${year}-08-24`,
  }
  holidays.push({
    name: 'Ganesh Chaturthi',
    date: ganeshChaturthiDates[year] || `${year}-09-07`,
    isRecurring: false,
  })

  // Onam - varies by year (Kerala)
  const onamDates: Record<number, string> = {
    2024: `${year}-09-05`,
    2025: `${year}-08-25`,
    2026: `${year}-09-13`,
    2027: `${year}-09-03`,
    2028: `${year}-08-22`,
  }
  holidays.push({
    name: 'Onam',
    date: onamDates[year] || `${year}-09-05`,
    isRecurring: false,
  })

  // Eid ul-Adha / Bakrid - varies by year
  const eidAdhaDates: Record<number, string> = {
    2024: `${year}-06-17`,
    2025: `${year}-06-07`,
    2026: `${year}-05-27`,
    2027: `${year}-06-16`,
    2028: `${year}-06-05`,
  }
  holidays.push({
    name: 'Eid ul-Adha',
    date: eidAdhaDates[year] || `${year}-06-17`,
    isRecurring: false,
  })

  // Guru Nanak Jayanti - varies by year
  const guruNanakDates: Record<number, string> = {
    2024: `${year}-11-15`,
    2025: `${year}-11-05`,
    2026: `${year}-11-23`,
    2027: `${year}-11-13`,
    2028: `${year}-11-02`,
  }
  holidays.push({
    name: 'Guru Nanak Jayanti',
    date: guruNanakDates[year] || `${year}-11-15`,
    isRecurring: false,
  })

  return holidays
}

/**
 * Fetch Indian holidays from Nager.Date API
 * Merges API data with calculated dates to ensure comprehensive coverage
 * The calculated dates include regional holidays (Lohri, Pongal, etc.) that APIs may not have
 */
export const fetchIndianHolidaysFromAPI = async (year: number) => {
  let apiHolidays: Array<{ name: string; date: string; isRecurring: boolean }> = []

  // Try Nager.Date API - most reliable free API for Indian holidays
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10000) // 10 second timeout

    const response = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/IN`, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'DelExpress/1.0',
      },
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (response.ok) {
      const contentType = response.headers.get('content-type')
      if (contentType && contentType.includes('application/json')) {
        const data = await response.json()

        if (Array.isArray(data) && data.length > 0) {
          console.log(`✅ Fetched ${data.length} holidays from Nager.Date API for ${year}`)

          // Map API response to our format
          apiHolidays = data.map((holiday: any) => {
            // Determine if recurring based on common patterns
            const recurringHolidays = [
              'Republic Day',
              'Independence Day',
              'Gandhi Jayanti',
              'Christmas',
              "New Year's Day",
            ]
            const isRecurring = recurringHolidays.some((name) =>
              holiday.name.toLowerCase().includes(name.toLowerCase()),
            )

            return {
              name: holiday.name,
              date: holiday.date,
              isRecurring,
            }
          })
        }
      }
    } else {
      console.warn(`⚠️ Nager.Date API returned status ${response.status} for ${year}`)
    }
  } catch (error: any) {
    if (error.name === 'AbortError') {
      console.warn(`⚠️ Nager.Date API timeout for ${year}`)
    } else {
      console.warn(`⚠️ Nager.Date API failed for ${year}:`, error.message)
    }
  }

  // Always use calculated dates as base (includes regional holidays like Lohri, Pongal, etc.)
  const calculatedHolidays = getIndianNationalHolidays(year)

  // If we got API data, merge it with calculated dates
  if (apiHolidays.length > 0) {
    // Create a map of API holidays by date
    const apiHolidaysMap = new Map(apiHolidays.map((h) => [h.date, h]))

    // Add calculated holidays that aren't in API response (regional holidays, etc.)
    calculatedHolidays.forEach((calcHoliday) => {
      if (!apiHolidaysMap.has(calcHoliday.date)) {
        apiHolidays.push(calcHoliday)
      }
    })

    console.log(
      `📅 Merged ${apiHolidays.length} holidays (${
        apiHolidays.length - calculatedHolidays.length
      } from API + regional holidays)`,
    )
    return apiHolidays
  }

  // Fallback to calculated dates only (includes all regional holidays like Lohri, Pongal, etc.)
  console.log(
    `📅 Using calculated dates for ${year} (includes regional holidays like Lohri, Pongal, Onam, etc.)`,
  )
  return calculatedHolidays
}

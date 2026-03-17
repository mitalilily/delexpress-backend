import { sql } from 'drizzle-orm'
import { db } from '../models/client'
import { zones } from '../schema/schema'

async function seedZones() {
  try {
    console.log('🌍 Seeding zones for B2B and B2C...')

    const baseZones = [
      { code: 'A', name: 'Zone A', description: 'Covers primary metro cities' },
      { code: 'B', name: 'Zone B', description: 'Tier 2 cities coverage' },
      { code: 'C', name: 'Zone C', description: 'Tier 3 cities coverage' },
      { code: 'D', name: 'Zone D', description: 'Remote and rural areas' },
      { code: 'E', name: 'Zone E', description: 'Special handling required' },
      { code: 'SPECIAL', name: 'Special Zone', description: 'Custom rules and exceptions' },
    ]

    // create entries for both business types
    const allZones = []
    for (const businessType of ['B2B', 'B2C']) {
      for (const zone of baseZones) {
        allZones.push({
          code: `${zone.code}_${businessType}`, // ensure uniqueness in "code"
          name: `${zone.name} (${businessType})`,
          description: zone.description,
          business_type: businessType,
          created_at: sql`NOW()`,
        })
      }
    }

    for (const zone of allZones) {
      await db.insert(zones).values(zone).onConflictDoNothing({ target: zones.code }) // avoid duplicates
    }

    console.log('✅ Zones seeded successfully for both B2B and B2C')
    process.exit(0)
  } catch (err) {
    console.error('❌ Error seeding zones:', err)
    process.exit(1)
  }
}

seedZones()

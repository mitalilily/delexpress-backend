import { randomUUID } from 'crypto'
import { and, eq, inArray } from 'drizzle-orm'
import { db, pool } from '../models/client'
import { couriers, plans, shippingRates, zones } from '../schema/schema'

type CourierSeed = {
  id: number
  name: string
  serviceProvider: string
  mode: 'Air' | 'Surface'
  businessTypes: ('b2c' | 'b2b')[]
  extraForward: number
  extraRto: number
}

type ZoneSeed = {
  code: string
  name: string
  description: string
  region: string
  states?: string[]
  metadata?: Record<string, unknown>
}

const courierSeeds: CourierSeed[] = [
  {
    id: 99,
    name: 'Delhivery Metro Air',
    serviceProvider: 'delhivery',
    mode: 'Air',
    businessTypes: ['b2c'],
    extraForward: 25,
    extraRto: 10,
  },
  {
    id: 100,
    name: 'Delhivery Metro Surface',
    serviceProvider: 'delhivery',
    mode: 'Surface',
    businessTypes: ['b2c'],
    extraForward: 5,
    extraRto: 5,
  },
]

const zoneSeeds: ZoneSeed[] = [
  {
    code: 'METRO_TO_METRO',
    name: 'Metro to Metro',
    description: 'Shipments between major metros across the network.',
    region: 'Metro to Metro',
    metadata: {
      note: 'Metro-to-metro corridor seeded 11 Feb 2026 16:34.',
    },
  },
  {
    code: 'ROI',
    name: 'Metro to Metro',
    description: 'Cover all metro city shipments when flows traverse the rest of India.',
    region: 'Rest of India',
    metadata: {
      note: 'Created 11 Feb 2026 16:34 UTC',
      origin: 'manual-injection',
    },
  },
  {
    code: 'SPECIAL_ZONE',
    name: 'Special Zone',
    description:
      'Special Zones that need extra handling when the shipment leaves the regular network.',
    region: 'Special Zones',
    metadata: {
      note: 'When shipment travels rest of India',
    },
  },
  {
    code: 'WITHIN_CITY',
    name: 'Within City',
    description: 'Shipments that stay within a single city boundary (incl. north-east metros).',
    region: 'Within City',
    states: ['Nagaland', 'Mizoram', 'Manipur', 'Meghalaya', 'Assam', 'Sikkim'],
    metadata: {
      note: 'All seven sister states listed for the rollout (11 Feb 2026 16:34).',
    },
  },
  {
    code: 'WITHIN_REGION',
    name: 'Within Region',
    description: 'When a shipment travels within a region comprising neighbouring states.',
    region: 'Within Region',
    metadata: {
      note: 'Region-only movement',
    },
  },
  {
    code: 'WITHIN_STATE',
    name: 'Within State',
    description: 'Shipment travels entirely within the same state.',
    region: 'Within State',
    metadata: {
      note: 'Refer to 11 Feb 2026 change log for this zone',
    },
  },
]

const forwardRateGuide: Record<string, number> = {
  METRO_TO_METRO: 145,
  ROI: 150,
  SPECIAL_ZONE: 180,
  WITHIN_CITY: 110,
  WITHIN_REGION: 130,
  WITHIN_STATE: 140,
}

const rtoRateGuide: Record<string, number> = {
  METRO_TO_METRO: 95,
  ROI: 90,
  SPECIAL_ZONE: 110,
  WITHIN_CITY: 70,
  WITHIN_REGION: 80,
  WITHIN_STATE: 85,
}

const codCharges = 45.0
const codPercent = 1.5
const otherCharges = 18.0
const minWeight = 0.5

async function ensureBasicPlan() {
  const [existing] = await db.select().from(plans).where(eq(plans.name, 'Basic')).limit(1)
  if (existing) return existing

  const [plan] = await db
    .insert(plans)
    .values({ id: randomUUID(), name: 'Basic', description: 'Default B2C plan', is_active: true })
    .returning()

  console.log('🌱 Inserted Basic plan because it did not exist yet')
  return plan
}

async function upsertCouriers() {
  for (const courier of courierSeeds) {
    await db
      .insert(couriers)
      .values({
        id: courier.id,
        name: courier.name,
        serviceProvider: courier.serviceProvider,
        businessType: courier.businessTypes,
        isEnabled: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [couriers.id, couriers.serviceProvider],
        set: {
          name: courier.name,
          businessType: courier.businessTypes,
          isEnabled: true,
          updatedAt: new Date(),
        },
      })
    console.log(`✅ Ensured courier ${courier.name} (ID ${courier.id}) exists`)
  }
}

async function upsertZones() {
  const insertedZones: { id: string; code: string; name: string }[] = []

  for (const seed of zoneSeeds) {
    const [zoneRow] = await db
      .insert(zones)
      .values({
        code: seed.code,
        name: seed.name,
        description: seed.description,
        region: seed.region,
        business_type: 'B2C',
        metadata: seed.metadata ?? null,
        states: seed.states ?? [],
        created_at: new Date(),
        updated_at: new Date(),
      })
      .onConflictDoUpdate({
        target: [zones.code, zones.business_type],
        set: {
          name: seed.name,
          description: seed.description,
          region: seed.region,
          metadata: seed.metadata ?? null,
          states: seed.states ?? [],
          updated_at: new Date(),
        },
      })
      .returning()

    insertedZones.push({ id: zoneRow.id, code: zoneRow.code, name: zoneRow.name })
    console.log(`✅ Upserted zone ${seed.code} (${seed.name})`)
  }

  return insertedZones
}

async function purgeExistingRates() {
  const courierIds = courierSeeds.map((courier) => courier.id)
  await db
    .delete(shippingRates)
    .where(and(eq(shippingRates.business_type, 'b2c'), inArray(shippingRates.courier_id, courierIds)))
  console.log('🧹 Removed existing B2C rates for the configured Delhivery couriers to avoid duplicates')
}

async function seedRates(planId: string, insertedZones: { id: string; code: string }[]) {
  const zoneMap = insertedZones.reduce<Record<string, string>>((acc, zone) => {
    acc[zone.code] = zone.id
    return acc
  }, {})

  type ShippingRateInsert = {
    plan_id: string
    courier_id: number
    courier_name: string
    service_provider: string
    mode: string
    business_type: string
    min_weight: string
    zone_id: string
    type: 'forward' | 'rto'
    rate: string
    cod_charges: string
    cod_percent: string
    other_charges: string
  }

  const rateRecords: ShippingRateInsert[] = []
  const targetZoneCodes = Object.keys(zoneMap)

  for (const code of targetZoneCodes) {
    const zoneId = zoneMap[code]
    const baseForward = forwardRateGuide[code] ?? 150
    const baseRto = rtoRateGuide[code] ?? 90

    for (const courier of courierSeeds) {
      const forwardRate = baseForward + courier.extraForward
      const rtoRate = baseRto + courier.extraRto

      rateRecords.push({
        plan_id: planId,
        courier_id: courier.id,
        courier_name: courier.name,
        service_provider: courier.serviceProvider,
        mode: courier.mode,
        business_type: 'b2c',
        min_weight: minWeight.toFixed(2),
        zone_id: zoneId,
        type: 'forward',
        rate: forwardRate.toFixed(2),
        cod_charges: codCharges.toFixed(2),
        cod_percent: codPercent.toFixed(2),
        other_charges: otherCharges.toFixed(2),
      })

      rateRecords.push({
        plan_id: planId,
        courier_id: courier.id,
        courier_name: courier.name,
        service_provider: courier.serviceProvider,
        mode: courier.mode,
        business_type: 'b2c',
        min_weight: minWeight.toFixed(2),
        zone_id: zoneId,
        type: 'rto',
        rate: rtoRate.toFixed(2),
        cod_charges: codCharges.toFixed(2),
        cod_percent: codPercent.toFixed(2),
        other_charges: otherCharges.toFixed(2),
      })
    }
  }

  if (!rateRecords.length) {
    console.warn('⚠️ No rate records to insert; check the zone seeds')
    return
  }

  await db.insert(shippingRates).values(rateRecords)
  console.log(`📦 Inserted ${rateRecords.length} dummy B2C rate entries for Delhivery couriers`)
}

async function main() {
  try {
    const plan = await ensureBasicPlan()
    await upsertCouriers()
    const zones = await upsertZones()
    await purgeExistingRates()
    await seedRates(plan.id, zones)
    console.log('🎉 Delhivery B2C rate card seeding complete')
  } catch (error) {
    console.error('❌ Error while seeding Delhivery metadata:', error)
    process.exitCode = 1
  } finally {
    await pool.end()
  }
}

main()

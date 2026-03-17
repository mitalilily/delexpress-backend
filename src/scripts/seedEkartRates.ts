/**
 * Seed Ekart courier row and B2C slab rates from forwardRateCardData.json.
 * - Creates courier (serviceProvider='ekart') if missing.
 * - Uses first available plan as target plan (or PLAN_ID env override).
 * - Inserts/updates shipping_rates for zones A-E (forward/rto) for Ekart entries.
 *
 * Run with:  npx tsx src/scripts/seedEkartRates.ts
 */
import forwardRates from './forwardRateCardData.json'
import { db } from '../models/client'
import { couriers } from '../models/schema/couriers'
import { plans } from '../models/schema/plans'
import { shippingRates } from '../models/schema/shippingRates'
import { zones } from '../models/schema/zones'
import { and, eq, sql } from 'drizzle-orm'
import crypto from 'crypto'

const EKART_PROVIDER = 'ekart'

async function ensureEkartCourier() {
  const existing = await db
    .select()
    .from(couriers)
    .where(and(eq(couriers.serviceProvider, EKART_PROVIDER), eq(couriers.id, couriers.id)))

  if (existing.length) {
    return existing[0]
  }

  // Pick next available ID
  const [maxRow] = await db
    .select({ max: sql<number>`COALESCE(MAX(${couriers.id}), 0)` })
    .from(couriers)
  const nextId = Number(maxRow?.max ?? 0) + 1

  const [inserted] = await db
    .insert(couriers)
    .values({
      id: nextId,
      name: 'Ekart',
      serviceProvider: EKART_PROVIDER,
      businessType: ['b2c'],
      isEnabled: true,
    } as any)
    .returning()

  return inserted
}

async function pickPlanId(): Promise<string> {
  if (process.env.PLAN_ID) return process.env.PLAN_ID
  const [plan] = await db.select().from(plans).limit(1)
  if (!plan) throw new Error('No plans found; set PLAN_ID env or create a plan first.')
  return plan.id
}

async function loadZones(): Promise<Record<string, string>> {
  const rows = await db.select({ id: zones.id, code: zones.code }).from(zones)
  const map: Record<string, string> = {}
  rows.forEach((z) => {
    const key = (z.code || '').trim().toUpperCase().replace('ZONE ', '')
    if (key) map[key] = z.id
  })
  return map
}

type RateRow = {
  courier_name: string
  mode: string
  min_weight: number
  type: string
  zone_a_forward?: number | null
  zone_b_forward?: number | null
  zone_c_forward?: number | null
  zone_d_forward?: number | null
  zone_e_forward?: number | null
  zone_a_rto?: number | null
  zone_b_rto?: number | null
  zone_c_rto?: number | null
  zone_d_rto?: number | null
  zone_e_rto?: number | null
  cod_charges?: number | null
  cod_percent?: number | null
  other_charges?: number | null
}

async function upsertRate(opts: {
  courierId: number
  courierName: string
  planId: string
  zoneId: string
  type: 'forward' | 'rto'
  rate: number
  mode: string
  minWeight: number
  codCharges?: number | null
  codPercent?: number | null
  otherCharges?: number | null
}) {
  const existing = await db
    .select({ id: shippingRates.id })
    .from(shippingRates)
    .where(
      and(
        eq(shippingRates.courier_id, opts.courierId),
        eq(shippingRates.plan_id, opts.planId),
        eq(shippingRates.business_type, 'b2c'),
        eq(shippingRates.zone_id, opts.zoneId),
        eq(shippingRates.type, opts.type),
      ),
    )
    .limit(1)

  const payload = {
    plan_id: opts.planId,
    courier_id: opts.courierId,
    courier_name: opts.courierName,
    service_provider: EKART_PROVIDER,
    mode: opts.mode ?? '',
    business_type: 'b2c',
    min_weight: opts.minWeight.toString(),
    zone_id: opts.zoneId,
    type: opts.type,
    rate: opts.rate.toString(),
    cod_charges: opts.codCharges?.toString() ?? null,
    cod_percent: opts.codPercent?.toString() ?? null,
    other_charges: opts.otherCharges?.toString() ?? null,
    last_updated: new Date(),
  }

  if (existing.length) {
    await db.update(shippingRates).set(payload as any).where(eq(shippingRates.id, existing[0].id))
    console.log(`↻ Updated ${opts.type} rate for zone ${opts.zoneId}`)
  } else {
    await db.insert(shippingRates).values({ id: crypto.randomUUID(), ...payload } as any)
    console.log(`➕ Inserted ${opts.type} rate for zone ${opts.zoneId}`)
  }
}

async function main() {
  const courier = await ensureEkartCourier()
  const planId = await pickPlanId()
  const zoneMap = await loadZones()

  const ekartRows = (forwardRates as RateRow[]).filter((r) =>
    (r.courier_name || '').toLowerCase().includes('ekart'),
  )

  if (!ekartRows.length) {
    throw new Error('No Ekart rows found in forwardRateCardData.json')
  }

  for (const row of ekartRows) {
    const mode = row.mode || ''
    const minWeight = Number(row.min_weight || 0)
    const zoneKeys = ['A', 'B', 'C', 'D', 'E']

    for (const z of zoneKeys) {
      const zoneId = zoneMap[z]
      if (!zoneId) {
        console.warn(`⚠️ Zone ${z} not found in DB, skipping`)
        continue
      }

      const forwardRate = (row as any)[`zone_${z.toLowerCase()}_forward`]
      const rtoRate = (row as any)[`zone_${z.toLowerCase()}_rto`]

      if (forwardRate != null) {
        await upsertRate({
          courierId: courier.id,
          courierName: row.courier_name,
          planId,
          zoneId,
          type: 'forward',
          rate: Number(forwardRate),
          mode,
          minWeight,
          codCharges: row.cod_charges ?? null,
          codPercent: row.cod_percent ?? null,
          otherCharges: row.other_charges ?? null,
        })
      }

      if (rtoRate != null) {
        await upsertRate({
          courierId: courier.id,
          courierName: row.courier_name,
          planId,
          zoneId,
          type: 'rto',
          rate: Number(rtoRate),
          mode,
          minWeight,
          codCharges: row.cod_charges ?? null,
          codPercent: row.cod_percent ?? null,
          otherCharges: row.other_charges ?? null,
        })
      }
    }
  }

  console.log('✅ Ekart courier and rates seeded.')
  process.exit(0)
}

main().catch((err) => {
  console.error('❌ Ekart seed failed:', err)
  process.exit(1)
})

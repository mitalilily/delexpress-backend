import { db } from '../models/client'
import { couriers, plans, shippingRates, zones } from '../schema/schema'

async function seedShippingRates() {
  try {
    // Fetch zones, plans, and couriers from DB
    const zoneRows = await db.select().from(zones)
    const planRows = await db.select().from(plans)
    const courierRows = await db.select().from(couriers)
    const courierNames = courierRows.map((c) => ({ name: c.name, id: c?.id }))

    const businessTypes: ('b2b' | 'b2c')[] = ['b2b', 'b2c']

    console.log('Seeding shipping rates...')

    for (const plan of planRows) {
      for (const businessType of businessTypes) {
        if (businessType === 'b2b') {
          // Each zone has a single courier
          for (const [i, zone] of zoneRows.entries()) {
            const courier = courierNames[i % courierNames.length] // assign courier in round-robin
            // Forward rate
            await db.insert(shippingRates).values({
              plan_id: plan.id,
              courier_name: courier?.name,
              courier_id: courier?.id,
              mode: 'air',
              business_type: businessType,
              min_weight: '0.5',
              zone_id: zone.id,
              type: 'forward',
              rate: '100.00',
              cod_charges: '50.00',
              cod_percent: '2.00',
              other_charges: '20.00',
            })
            // RTO rate
            await db.insert(shippingRates).values({
              plan_id: plan.id,
              courier_name: courier?.name,
              courier_id: courier?.id,
              mode: 'air',
              business_type: businessType,
              min_weight: '0.5',
              zone_id: zone.id,
              type: 'rto',
              rate: '60.00',
              cod_charges: '50.00',
              cod_percent: '2.00',
              other_charges: '20.00',
            })
          }
        } else {
          // B2C: each zone can have multiple couriers
          for (const zone of zoneRows) {
            for (const courier of courierNames) {
              // Forward rate
              await db.insert(shippingRates).values({
                plan_id: plan.id,
                courier_name: courier?.name,
                courier_id: courier?.id,
                mode: 'air',
                business_type: businessType,
                min_weight: '0.5',
                zone_id: zone.id,
                type: 'forward',
                rate: '120.00',
                cod_charges: '50.00',
                cod_percent: '2.00',
                other_charges: '20.00',
              })
              // RTO rate
              await db.insert(shippingRates).values({
                plan_id: plan.id,
                courier_name: courier?.name,
                courier_id: courier?.id,
                mode: 'air',
                business_type: businessType,
                min_weight: '0.5',
                zone_id: zone.id,
                type: 'rto',
                rate: '70.00',
                cod_charges: '50.00',
                cod_percent: '2.00',
                other_charges: '20.00',
              })
            }
          }
        }
      }
    }

    console.log('✅ Shipping rates seeded successfully!')
  } catch (err) {
    console.error('❌ Error seeding shipping rates:', err)
  } finally {
    process.exit(0)
  }
}

seedShippingRates()

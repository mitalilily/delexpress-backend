import dayjs from 'dayjs'
import { and, between, desc, eq, sql } from 'drizzle-orm'
import { db } from '../models/client'
import { billingInvoices } from '../models/schema/billingInvoices'
import { generateInvoiceForUser } from '../models/services/invoiceGeneration.service'
import { b2b_orders, b2c_orders, billingPreferences, users } from '../schema/schema'

// 🕑 Runs every day at 2 AM
export const generateAutoBillingInvoices = async ({ force = false } = {}) => {
  console.log('🧾 Running automated invoice generation cron:', new Date().toISOString())

  try {
    const allUsers = await db.select().from(users)

    for (const user of allUsers) {
      const userId = user.id

      // Fetch preference
      const [pref] = await db
        .select()
        .from(billingPreferences)
        .where(eq(billingPreferences.userId, userId))
        .limit(1)

      const autoGenerate = pref?.autoGenerate ?? true
      const frequency = pref?.frequency ?? 'monthly'
      const customFrequencyDays = pref?.customFrequencyDays ?? null

      // Skip if auto-generate is disabled (unless force)
      if (!autoGenerate && !force) {
        console.log(`⏭️ Skipping user ${userId}: auto-generate disabled`)
        continue
      }

      // Skip if frequency is 'manual' (unless force)
      if (frequency === 'manual' && !force) {
        console.log(`⏭️ Skipping user ${userId}: manual billing frequency`)
        continue
      }

      // Calculate interval days based on frequency
      let intervalDays = 30 // default monthly
      if (frequency === 'weekly') intervalDays = 7
      else if (frequency === 'monthly') intervalDays = 30
      else if (frequency === 'custom' && customFrequencyDays) intervalDays = customFrequencyDays
      else if (frequency === 'custom' && !customFrequencyDays) {
        console.log(`⚠️ Skipping user ${userId}: custom frequency but no customFrequencyDays set`)
        continue
      }

      // Get last invoice to determine next billing period
      const [lastInvoice] = await db
        .select()
        .from(billingInvoices)
        .where(eq(billingInvoices.sellerId, userId))
        .orderBy(desc(billingInvoices.billingEnd))
        .limit(1)

      const today = dayjs().startOf('day')
      let startDate: Date
      let endDate: Date
      let shouldGenerate = false

      if (lastInvoice?.billingEnd) {
        // Use the billing end date of the last invoice to determine the next period
        const lastBillingEnd = dayjs(lastInvoice.billingEnd).startOf('day')
        const nextBillingStart = lastBillingEnd.add(1, 'day').startOf('day')
        const nextBillingEnd = nextBillingStart.add(intervalDays - 1, 'day').endOf('day')

        // Generate if today is on or after the next billing end date
        shouldGenerate = today.isAfter(nextBillingEnd) || today.isSame(nextBillingEnd, 'day')

        if (shouldGenerate || force) {
          startDate = nextBillingStart.toDate()
          endDate = today.endOf('day').toDate()
        } else {
          console.log(
            `⏭️ Skipping user ${userId}: next billing period ends ${nextBillingEnd.format(
              'DD MMM YYYY',
            )} (today: ${today.format('DD MMM YYYY')})`,
          )
          continue
        }
      } else {
        // No previous invoice - generate from intervalDays ago to today
        startDate = today.subtract(intervalDays, 'day').startOf('day').toDate()
        endDate = today.endOf('day').toDate()
        shouldGenerate = true
      }

      // ✅ allow force regenerate
      if (!shouldGenerate && !force) continue

      // Check orders...
      const [b2cCount] = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(b2c_orders)
        .where(
          and(
            eq(b2c_orders.user_id, userId),
            between(b2c_orders.created_at, startDate, endDate),
            eq(b2c_orders.order_status, 'pickup_initiated'),
          ),
        )

      const [b2bCount] = await db
        .select({ count: sql<number>`COUNT(*)` })
        .from(b2b_orders)
        .where(
          and(
            eq(b2b_orders.user_id, userId),
            between(b2b_orders.created_at, startDate, endDate),
            eq(b2b_orders.order_status, 'pickup_initiated'),
          ),
        )

      const totalOrders = (b2cCount?.count ?? 0) + (b2bCount?.count ?? 0)
      if (totalOrders === 0) {
        console.log(`⚠️ Skipping user ${userId}: no delivered orders in this period.`)
        continue
      }

      console.log(
        `🧾 Generating invoice for user ${userId} (${totalOrders} orders, ${frequency} frequency, period: ${dayjs(
          startDate,
        ).format('DD MMM YYYY')} → ${dayjs(endDate).format('DD MMM YYYY')})`,
      )

      // 🧹 Optional: if forcing, delete previous invoice in same range
      if (force && lastInvoice) {
        await db.delete(billingInvoices).where(eq(billingInvoices.id, lastInvoice.id))
        console.log(`🗑️ Deleted old invoice ${lastInvoice.invoiceNo} for ${userId}`)
      }

      await generateInvoiceForUser(userId, { startDate, endDate })
    }

    console.log('✅ Invoice generation cron completed successfully')
  } catch (err) {
    console.error('❌ Invoice cron failed:', err)
  }
}

import dayjs from 'dayjs'
import { and, eq, gte, lte, sql } from 'drizzle-orm'
import { db } from '../models/client'
import { getWeightReconciliationSummary } from '../models/services/weightReconciliation.service'
import {
  sendDailySummaryEmail,
  sendWeeklyReportEmail,
} from '../models/services/weightReconciliationEmail.service'
import { users, weight_discrepancies, weight_reconciliation_settings } from '../schema/schema'

/**
 * Send daily weight reconciliation summary emails
 * Runs every day at 8 AM
 */
export async function sendDailyWeightReconciliationEmails() {
  console.log('[Cron] 📧 Sending daily weight reconciliation summaries...')

  try {
    // Get all users with daily summary enabled
    const usersWithDailySummary = await db
      .select({
        userId: users.id,
        userEmail: users.email,
        userName: sql<string>`'User'`.as('userName'),
        settings: weight_reconciliation_settings,
      })
      .from(users)
      .innerJoin(
        weight_reconciliation_settings,
        eq(users.id, weight_reconciliation_settings.user_id),
      )
      .where(eq(weight_reconciliation_settings.email_daily_summary, true))

    const today = dayjs().format('YYYY-MM-DD')
    const startOfDay = dayjs().startOf('day').toDate()
    const endOfDay = dayjs().endOf('day').toDate()

    for (const user of usersWithDailySummary) {
      try {
        // Get discrepancies for today
        const discrepancies = await db
          .select()
          .from(weight_discrepancies)
          .where(
            and(
              eq(weight_discrepancies.user_id, user.userId),
              gte(weight_discrepancies.detected_at, startOfDay),
              lte(weight_discrepancies.detected_at, endOfDay),
            ),
          )

        const pendingCount = discrepancies.filter((d) => d.status === 'pending').length
        const acceptedCount = discrepancies.filter((d) => d.status === 'accepted').length
        const disputedCount = discrepancies.filter((d) => d.status === 'disputed').length
        const totalAdditionalCharges = discrepancies.reduce(
          (sum, d) => sum + Number(d.additional_charge || 0),
          0,
        )

        // Only send if there are discrepancies
        if (discrepancies.length > 0) {
          await sendDailySummaryEmail({
            userEmail: user.userEmail || '',
            userName: user.userName,
            date: today,
            totalDiscrepancies: discrepancies.length,
            pendingCount,
            acceptedCount,
            disputedCount,
            totalAdditionalCharges,
            discrepancies: discrepancies.slice(0, 20).map((d) => ({
              orderNumber: d.order_number,
              weightDifference: Number(d.weight_difference || 0),
              additionalCharge: Number(d.additional_charge || 0),
              status: d.status,
            })),
          })
        }
      } catch (err) {
        console.error(`Failed to send daily summary to ${user.userEmail}:`, err)
      }
    }

    console.log(
      `[Cron] ✅ Daily weight reconciliation summaries sent to ${usersWithDailySummary.length} users`,
    )
  } catch (error) {
    console.error('[Cron] ❌ Error sending daily weight reconciliation summaries:', error)
  }
}

/**
 * Send weekly weight reconciliation report emails
 * Runs every Monday at 9 AM
 */
export async function sendWeeklyWeightReconciliationEmails() {
  console.log('[Cron] 📧 Sending weekly weight reconciliation reports...')

  try {
    // Get all users with weekly report enabled
    const usersWithWeeklyReport = await db
      .select({
        userId: users.id,
        userEmail: users.email,
        userName: sql<string>`'User'`.as('userName'),
        settings: weight_reconciliation_settings,
      })
      .from(users)
      .innerJoin(
        weight_reconciliation_settings,
        eq(users.id, weight_reconciliation_settings.user_id),
      )
      .where(eq(weight_reconciliation_settings.email_weekly_report, true))

    const weekStart = dayjs().subtract(7, 'days').startOf('day').toDate()
    const weekEnd = dayjs().subtract(1, 'day').endOf('day').toDate()
    const weekStartStr = dayjs(weekStart).format('YYYY-MM-DD')
    const weekEndStr = dayjs(weekEnd).format('YYYY-MM-DD')

    for (const user of usersWithWeeklyReport) {
      try {
        // Get summary for the week
        const summary = await getWeightReconciliationSummary(user.userId, weekStart, weekEnd)

        // Get top discrepancies
        const topDiscrepancies = await db
          .select()
          .from(weight_discrepancies)
          .where(
            and(
              eq(weight_discrepancies.user_id, user.userId),
              gte(weight_discrepancies.detected_at, weekStart),
              lte(weight_discrepancies.detected_at, weekEnd),
            ),
          )
          .orderBy(sql`ABS(${weight_discrepancies.weight_difference}) DESC`)
          .limit(10)

        // Only send if there are discrepancies
        if (summary.summary.totalDiscrepancies > 0) {
          await sendWeeklyReportEmail({
            userEmail: user.userEmail || '',
            userName: user.userName,
            weekStart: weekStartStr,
            weekEnd: weekEndStr,
            totalDiscrepancies: summary.summary.totalDiscrepancies || 0,
            pendingCount: summary.summary.pendingCount || 0,
            acceptedCount: summary.summary.acceptedCount || 0,
            disputedCount: summary.summary.disputedCount || 0,
            resolvedCount: summary.summary.resolvedCount || 0,
            rejectedCount: summary.summary.rejectedCount || 0,
            totalAdditionalCharges: Number(summary.summary.totalAdditionalCharges || 0),
            avgWeightDifference: Number(summary.summary.avgWeightDifference || 0),
            maxWeightDifference: Number(summary.summary.maxWeightDifference || 0),
            autoAcceptedCount: summary.summary.autoAcceptedCount || 0,
            courierBreakdown: summary.courierBreakdown.map((c) => ({
              courierPartner: c.courierPartner || 'N/A',
              count: c.count || 0,
              totalCharge: Number(c.totalCharge || 0),
              avgWeightDiff: Number(c.avgWeightDiff || 0),
            })),
            topDiscrepancies: topDiscrepancies.map((d) => ({
              orderNumber: d.order_number,
              weightDifference: Number(d.weight_difference || 0),
              additionalCharge: Number(d.additional_charge || 0),
              status: d.status,
              courierPartner: d.courier_partner || 'N/A',
            })),
          })
        }
      } catch (err) {
        console.error(`Failed to send weekly report to ${user.userEmail}:`, err)
      }
    }

    console.log(
      `[Cron] ✅ Weekly weight reconciliation reports sent to ${usersWithWeeklyReport.length} users`,
    )
  } catch (error) {
    console.error('[Cron] ❌ Error sending weekly weight reconciliation reports:', error)
  }
}

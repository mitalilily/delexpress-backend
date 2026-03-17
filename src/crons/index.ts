import cron from 'node-cron'
import { isRazorpayConfigured } from '../utils/razorpay'
import { generateAutoBillingInvoices } from './invoiceGenerator'
import { processPendingWebhooks } from './processPendingWebhooks'
import { reconcileWalletTopups } from './reconcileWalletTopups'
import { seedHolidaysCron } from './seedHolidays'
import {
  sendDailyWeightReconciliationEmails,
  sendWeeklyWeightReconciliationEmails,
} from './weightReconciliationEmails'
import { pollEkartTracking } from './ekartTracking'

if (isRazorpayConfigured) {
  cron.schedule('*/20 * * * *', async () => {
    console.log('[Cron] Wallet reconciliation kicking off')
    try {
      await reconcileWalletTopups()
    } catch (err) {
      console.error('[Cron] Wallet reconciliation failed:', err)
    }
  })
} else {
  console.warn('[Cron] Wallet reconciliation skipped because Razorpay credentials are missing.')
}

cron.schedule('*/1 * * * *', () => {
  processPendingWebhooks().catch((err) => console.error('Error in cron webhook processor', err))
})

cron.schedule('0 2 * * *', () => generateAutoBillingInvoices())

cron.schedule('0 8 * * *', async () => {
  console.log('[Cron] Daily weight reconciliation emails starting...')
  try {
    await sendDailyWeightReconciliationEmails()
  } catch (err) {
    console.error('[Cron] Daily weight reconciliation emails failed:', err)
  }
})

cron.schedule('0 9 * * 1', async () => {
  console.log('[Cron] Weekly weight reconciliation reports starting...')
  try {
    await sendWeeklyWeightReconciliationEmails()
  } catch (err) {
    console.error('[Cron] Weekly weight reconciliation reports failed:', err)
  }
})

cron.schedule('*/15 * * * *', async () => {
  console.log('[Cron] Ekart tracking poll')
  try {
    await pollEkartTracking()
  } catch (err) {
    console.error('[Cron] Ekart tracking poll failed:', err)
  }
})

cron.schedule('0 0 1 1 *', () => {
  console.log('[Cron] Holiday seeding cron triggered (January 1st)')
  seedHolidaysCron().catch((err) => console.error('Error in holiday seeding cron', err))
})

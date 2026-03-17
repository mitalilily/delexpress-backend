import dayjs from 'dayjs'
import { and, eq, gt } from 'drizzle-orm'
import { db } from '../models/client'
import { billingInvoices, users } from '../schema/schema'
import { sendInvoiceReminderEmail } from '../utils/emailSender'

// Send reminders for unpaid invoices older than N days
export async function sendUnpaidInvoiceReminders({ olderThanDays = 7 } = {}) {
  const cutoff = dayjs().subtract(olderThanDays, 'day').toDate()

  const rows = await db
    .select({
      id: billingInvoices.id,
      invoiceNo: billingInvoices.invoiceNo,
      sellerId: billingInvoices.sellerId,
      totalAmount: billingInvoices.totalAmount,
      createdAt: billingInvoices.createdAt,
      pdfUrl: billingInvoices.pdfUrl,
      csvUrl: billingInvoices.csvUrl,
    })
    .from(billingInvoices)
    .where(and(eq(billingInvoices.status, 'pending'), gt(billingInvoices.createdAt, cutoff)))

  for (const inv of rows) {
    // fetch email
    const [u] = await db.select().from(users).where(eq(users.id, inv.sellerId)).limit(1)
    const email = (u as any)?.email
    if (!email) continue

    try {
      await sendInvoiceReminderEmail({
        to: email,
        invoiceNo: inv.invoiceNo,
        amount: Number(inv.totalAmount || 0),
        pdfUrl: inv.pdfUrl,
        csvUrl: inv.csvUrl,
      })
      // eslint-disable-next-line no-console
      console.log(`📧 Sent reminder for invoice ${inv.invoiceNo} to ${email}`)
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('Failed to send reminder', inv.invoiceNo, e)
    }
  }
}



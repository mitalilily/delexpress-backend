import { generateAutoBillingInvoices } from '../crons/invoiceGenerator'

generateAutoBillingInvoices({ force: true })
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })

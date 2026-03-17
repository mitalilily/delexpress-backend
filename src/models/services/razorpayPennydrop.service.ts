import { razorpayApi } from '../../utils/razorpay'

import * as dotenv from 'dotenv'
import path from 'path'

// Load correct .env based on NODE_ENV
const env = process.env.NODE_ENV || 'development'
dotenv.config({ path: path.resolve(__dirname, `../../.env.${env}`) })

/** 1️⃣ Create contact */
async function createContact(name: string) {
  const { data } = await razorpayApi.post('/contacts', {
    name,
    type: 'customer', // TODO: Change if needed (e.g. vendor, customer)
  })
  return data.id as string
}

/** 2️⃣ Create fund account */
async function createFundAccount(
  contactId: string,
  { name, ifsc, account_number }: { name: string; ifsc: string; account_number: string },
) {
  const { data } = await razorpayApi.post('/fund_accounts', {
    contact_id: contactId,
    account_type: 'bank_account',
    bank_account: { name, ifsc, account_number },
  })
  return data.id as string
}

/** 3️⃣ Trigger fund account validation — don't poll */
export async function triggerFundAccountValidation(fundAccountId: string) {
  try {
    const { data } = await razorpayApi.post('/fund_accounts/validations', {
      account_number: process.env.RAZORPAY_SOURCE_ACC!, // RazorpayX Current Account #
      fund_account: { id: fundAccountId },
      amount: 100,
      currency: 'INR',
      notes: {
        purpose: 'Bank Account Verification',
      },
    })

    return data
  } catch (err: any) {
    console.error('🔥 Penny drop validation failed:')
    console.error('👉 Error Message:', err.message)
    console.error('👉 Razorpay Response:', err.response?.data || err)
    throw err
  }
}

/** ✅ Main exported function for triggering penny drop */
export async function pennyDropVerifyLive({
  name,
  ifsc,
  accountNumber,
}: {
  name: string
  ifsc: string
  accountNumber: string
}) {
  // 1. Create Contact and Fund Account
  const contactId = await createContact(name)
  const fundAccountId = await createFundAccount(contactId, {
    name,
    ifsc,
    account_number: accountNumber,
  })

  // 2. Trigger Penny Drop (No Polling)
  const validation = await triggerFundAccountValidation(fundAccountId)

  return {
    success: false, // we mark as pending — real result will come via webhook
    fundAccountId, // ✅ store this to match webhook later
    validationId: validation.id, // optionally store if needed
    message: 'Verification in progress. Await webhook.',
  }
}

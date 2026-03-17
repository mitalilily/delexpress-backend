import axios from 'axios'
import crypto from 'crypto'
import dotenv from 'dotenv'

import path from 'path'

// Load correct .env based on NODE_ENV
const env = process.env.NODE_ENV || 'development'
dotenv.config({ path: path.resolve(__dirname, `../../.env.${env}`) })

// lib/razorpay.ts
import Razorpay from 'razorpay'

type RazorpayMode = 'test' | 'live'

/**
 * Pick your mode from either:
 *  1. RAZORPAY_MODE      – explicit override (`"test"` | `"live"`)
 *  2. NODE_ENV === prod  – implicit (treat everything else as test)
 */
const MODE: RazorpayMode =
  (process.env.RAZORPAY_MODE as RazorpayMode) ??
  (process.env.NODE_ENV === 'production' ? 'live' : 'test')

// A typed map of credentials for each mode.
const CREDENTIALS: Record<RazorpayMode, { key_id: string; key_secret: string }> = {
  test: {
    key_id: process.env.RAZORPAY_KEY_ID!,
    key_secret: process.env.RAZORPAY_KEY_SECRET!,
  },
  live: {
    key_id: process.env.RAZORPAY_KEY_ID_PROD!,
    key_secret: process.env.RAZORPAY_KEY_SECRET_PROD!,
  },
}

// Fail fast if anything is missing – no silent “undefined” bugs in prod!
if (!CREDENTIALS[MODE].key_id || !CREDENTIALS[MODE].key_secret) {
  throw new Error(
    `[Razorpay] Missing env vars for ${MODE.toUpperCase()} mode – check your .env file`,
  )
}

/** A single, shared Razorpay instance you can import anywhere in your app. */
export const razorpay = new Razorpay(CREDENTIALS[MODE])

console.info(
  `[Razorpay] Initialised in ${MODE.toUpperCase()} mode with key ${CREDENTIALS[MODE].key_id}`,
)

export const razorpayApi = axios.create({
  baseURL: 'https://api.razorpay.com/v1',
  auth: {
    username: MODE === 'live' ? process.env.RAZORPAY_KEY_ID_PROD! : process.env.RAZORPAY_KEY_ID!, // rzp_test_...
    password:
      MODE === 'live' ? process.env.RAZORPAY_KEY_SECRET_PROD! : process.env.RAZORPAY_KEY_SECRET!, // your test secret
  },
})

export function isValidSig(body: string, sig: string) {
  const expected = crypto
    .createHmac(
      'sha256',
      MODE === 'live'
        ? process.env.RAZORPAY_WEBHOOK_SECRET_PROD!
        : process.env.RAZORPAY_WEBHOOK_SECRET!,
    )
    .update(body)
    .digest('hex')
  return expected === sig
}

import axios from 'axios'
import crypto from 'crypto'
import dotenv from 'dotenv'
import path from 'path'
import Razorpay from 'razorpay'

const env = process.env.NODE_ENV || 'development'
dotenv.config({ path: path.resolve(__dirname, `../../.env.${env}`) })

type RazorpayMode = 'test' | 'live'

const MODE: RazorpayMode =
  (process.env.RAZORPAY_MODE as RazorpayMode) ??
  (process.env.NODE_ENV === 'production' ? 'live' : 'test')

const CREDENTIALS: Record<RazorpayMode, { key_id: string; key_secret: string }> = {
  test: {
    key_id: process.env.RAZORPAY_KEY_ID || '',
    key_secret: process.env.RAZORPAY_KEY_SECRET || '',
  },
  live: {
    key_id: process.env.RAZORPAY_KEY_ID_PROD || '',
    key_secret: process.env.RAZORPAY_KEY_SECRET_PROD || '',
  },
}

export const isRazorpayConfigured = Boolean(CREDENTIALS[MODE].key_id && CREDENTIALS[MODE].key_secret)

if (!isRazorpayConfigured) {
  console.warn(
    `[Razorpay] Missing credentials for ${MODE.toUpperCase()} mode. Wallet topups are disabled until env vars are set.`,
  )
}

export const razorpay = new Razorpay({
  key_id: CREDENTIALS[MODE].key_id || 'disabled',
  key_secret: CREDENTIALS[MODE].key_secret || 'disabled',
})

if (isRazorpayConfigured) {
  console.info(
    `[Razorpay] Initialised in ${MODE.toUpperCase()} mode with key ${CREDENTIALS[MODE].key_id}`,
  )
}

export const razorpayApi = axios.create({
  baseURL: 'https://api.razorpay.com/v1',
  auth: {
    username:
      MODE === 'live'
        ? process.env.RAZORPAY_KEY_ID_PROD || 'disabled'
        : process.env.RAZORPAY_KEY_ID || 'disabled',
    password:
      MODE === 'live'
        ? process.env.RAZORPAY_KEY_SECRET_PROD || 'disabled'
        : process.env.RAZORPAY_KEY_SECRET || 'disabled',
  },
})

export function isValidSig(body: string, sig: string) {
  const expected = crypto
    .createHmac(
      'sha256',
      MODE === 'live'
        ? process.env.RAZORPAY_WEBHOOK_SECRET_PROD || ''
        : process.env.RAZORPAY_WEBHOOK_SECRET || '',
    )
    .update(body)
    .digest('hex')
  return expected === sig
}

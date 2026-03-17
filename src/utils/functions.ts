import * as bcrypt from 'bcryptjs'
import fileType from 'file-type'

import dotenv from 'dotenv'
import sharp from 'sharp'

import path from 'path'

// Load correct .env based on NODE_ENV
const env = process.env.NODE_ENV || 'development'
dotenv.config({ path: path.resolve(__dirname, `../../.env.${env}`) })

export const generate8DigitsVerificationToken = (): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  let token = ''
  for (let i = 0; i < 8; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return token
}

/** Parse any user input → { prefix, national, e164 }.
 *  Assumes Indian 10‑digit nationals; tweak if you support more. */
export const parsePhone = (input: string) => {
  const digits = input.replace(/\D/g, '') // strip non‑digits

  let prefix = '91'
  let national = digits

  if (digits.length > 10) {
    prefix = digits.slice(0, digits.length - 10)
    national = digits.slice(-10)
  } else if (digits.length === 10) {
    national = digits
  } else {
    throw new Error('Phone number too short')
  }

  return { prefix, national, e164: `+${prefix}${national}` }
}

export function deepMerge<T>(target: T, patch: Partial<T>): T {
  const out: any = { ...target }
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined) continue // ignore undefined
    if (
      v &&
      typeof v === 'object' &&
      !Array.isArray(v) &&
      out[k] !== null &&
      typeof out[k] === 'object'
    ) {
      out[k] = deepMerge(out[k], v as any)
    } else {
      out[k] = v // primitives / null / array
    }
  }
  return out
}

export function buildPatch<T extends Record<string, unknown>>(existing: T, merged: T): Partial<T> {
  const patch: Partial<T> = {}
  for (const k in merged) {
    if (JSON.stringify(merged[k]) !== JSON.stringify(existing[k])) {
      patch[k] = merged[k]
    }
  }
  return patch
}

export const getBucketName = () => {
  switch (process.env.NODE_ENV) {
    case 'production':
      return process.env.PROD_BUCKET!
    case 'staging':
      return process.env.STAGING_BUCKET!
    default:
      return process.env.DEV_BUCKET!
  }
}

export const hash = (plain: string) => bcrypt.hash(plain, 10)

export const compare = (plain: string, hashed: string) => bcrypt.compare(plain, hashed)

export async function isImageBlurrySharp(buffer: Buffer): Promise<boolean> {
  const type = await fileType.fromBuffer(buffer)

  if (!type || !['image/jpeg', 'image/png', 'image/webp'].includes(type.mime)) {
    throw new Error(`Unsupported image format: ${type?.mime ?? 'unknown'}`)
  }

  const image = sharp(buffer)
  const { width, height } = await image.metadata()

  const { data } = await image.greyscale().resize(100).raw().toBuffer({ resolveWithObject: true })

  let sum = 0
  for (let i = 1; i < data.length - 1; i++) {
    const diff = data[i] - data[i - 1]
    sum += diff * diff
  }

  const variance = sum / data.length
  return variance < 50
}

export const validateShipmentRequest = (body: any): string[] => {
  const errors: string[] = []

  if (!body.order_number) errors.push('order_number is required')
  if (!['cod', 'prepaid', 'reverse'].includes(body.payment_type))
    errors.push('payment_type is invalid')
  if (!body.order_amount) errors.push('order_amount is required')

  const c = body.consignee || {}
  if (!c.name) errors.push('consignee[name] is required')
  if (!c.address) errors.push('consignee[address] is required')
  if (!c.city) errors.push('consignee[city] is required')
  if (!c.state) errors.push('consignee[state] is required')
  if (!c.pincode) errors.push('consignee[pincode] is required')
  if (!c.phone) errors.push('consignee[phone] is required')

  const p = body.pickup || {}
  if (!p.warehouse_name) errors.push('pickup[warehouse_name] is required')
  if (!p.name) errors.push('pickup[name] is required')
  if (!p.address) errors.push('pickup[address] is required')
  if (!p.city) errors.push('pickup[city] is required')
  if (!p.state) errors.push('pickup[state] is required')
  if (!p.pincode) errors.push('pickup[pincode] is required')
  if (!p.phone) errors.push('pickup[phone] is required')

  // Optional: validate RTO if is_rto_different = yes
  if (body.is_rto_different === 'yes' && !body.rto)
    errors.push('rto details are required when is_rto_different is yes')

  return errors
}

export const calculateSLADays = (edd: string): number => {
  const [day, month, year] = edd.split('-').map(Number)
  const eddDate = new Date(year, month - 1, day)
  const today = new Date()
  const diffTime = eddDate.getTime() - today.getTime()
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) // convert ms to days
  return diffDays
}

// Derive approximate zone from SLA
export const getApproxZoneFromEDD = (edd: string): string => {
  const slaDays = calculateSLADays(edd)
  if (slaDays <= 2) return 'A'
  if (slaDays <= 4) return 'B'
  if (slaDays <= 6) return 'C'
  return 'D'
}

//DETERMINE B2C ZONE
type LocationInfo = {
  city: string
  state: string
  tags: string[] // e.g. ['north','metros','special_zones']
}

export const determineB2CZone = (origin: LocationInfo, destination: LocationInfo): string => {
  const hasTag = (loc: LocationInfo, tag: string) =>
    loc.tags?.map((t) => t.toLowerCase()).includes(tag.toLowerCase())

  // 1. Special Zone (highest priority)
  if (hasTag(origin, 'special_zones') || hasTag(destination, 'special_zones')) {
    return 'SPECIAL_ZONE'
  }

  // 2. Within City
  if (origin.city?.toLowerCase() === destination.city?.toLowerCase()) {
    return 'WITHIN_CITY'
  }

  // 3. Within State
  if (origin.state?.toLowerCase() === destination.state?.toLowerCase()) {
    return 'WITHIN_STATE'
  }

  // 4. Within Region
  const regions = ['north', 'south', 'east', 'west']
  for (const r of regions) {
    if (hasTag(origin, r) && hasTag(destination, r)) {
      return 'WITHIN_REGION'
    }
  }

  // 5. Metro to Metro
  if (
    hasTag(origin, 'metros') &&
    hasTag(destination, 'metros') &&
    origin.city?.toLowerCase() !== destination.city?.toLowerCase()
  ) {
    return 'METRO_TO_METRO'
  }

  // 6. ROI (fallback)
  return 'ROI'
}

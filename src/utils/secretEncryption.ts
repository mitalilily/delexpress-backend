import crypto from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12 // GCM standard

// Derive a 32‑byte key from env – do NOT hard‑code secrets
const getKey = () => {
  const raw =
    process.env.COURIER_SECRET_KEY || process.env.JWT_SECRET || 'Track n Trace-fallback-key'
  return crypto.createHash('sha256').update(String(raw)).digest()
}

/**
 * Encrypt a secret string using AES-256-GCM.
 * Returns a compact string: base64(iv):base64(ciphertext):base64(tag)
 */
export const encryptSecret = (plain: string): string => {
  const key = getKey()
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)

  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()

  return [iv.toString('base64'), encrypted.toString('base64'), tag.toString('base64')].join(':')
}

/**
 * Decrypt a string produced by encryptSecret.
 */
export const decryptSecret = (payload: string): string => {
  if (!payload) return ''

  const [ivB64, dataB64, tagB64] = payload.split(':')
  if (!ivB64 || !dataB64 || !tagB64) {
    throw new Error('Invalid encrypted secret format')
  }

  const key = getKey()
  const iv = Buffer.from(ivB64, 'base64')
  const data = Buffer.from(dataB64, 'base64')
  const tag = Buffer.from(tagB64, 'base64')

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(tag)

  const decrypted = Buffer.concat([decipher.update(data), decipher.final()])
  return decrypted.toString('utf8')
}

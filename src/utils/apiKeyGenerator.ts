import crypto from 'crypto'

/**
 * Generate a secure API key
 * Format: ccart_<random_32_chars>
 */
export function generateApiKey(): string {
  const randomBytes = crypto.randomBytes(16)
  const key = randomBytes.toString('hex')
  return `ccart_${key}`
}

/**
 * Generate a secure API secret for webhook signing
 */
export function generateApiSecret(): string {
  return crypto.randomBytes(32).toString('hex')
}

/**
 * Hash an API key for storage
 */
export function hashApiKey(apiKey: string): string {
  return crypto.createHash('sha256').update(apiKey).digest('hex')
}

/**
 * Verify an API key against a hash
 */
export function verifyApiKey(apiKey: string, hash: string): boolean {
  const computedHash = hashApiKey(apiKey)
  return computedHash === hash
}

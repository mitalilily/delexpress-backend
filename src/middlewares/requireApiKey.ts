import { NextFunction, Request, Response } from 'express'
import { eq } from 'drizzle-orm'
import { db } from '../models/client'
import { api_keys } from '../models/schema/apiKeys'
import crypto from 'crypto'

/**
 * Middleware to authenticate requests using API key
 * Expects API key in header: X-API-Key: <api_key>
 */
export const requireApiKey = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const apiKey = req.headers['x-api-key'] as string

    if (!apiKey) {
      return res.status(401).json({ 
        error: 'Missing API key',
        message: 'Please provide your API key in the X-API-Key header'
      })
    }

    // Hash the provided API key to compare with stored hash
    const hashedKey = crypto.createHash('sha256').update(apiKey).digest('hex')

    // Find the API key in database
    const [apiKeyRecord] = await db
      .select()
      .from(api_keys)
      .where(eq(api_keys.api_key, hashedKey))
      .limit(1)

    if (!apiKeyRecord) {
      return res.status(401).json({ 
        error: 'Invalid API key',
        message: 'The provided API key is invalid'
      })
    }

    if (!apiKeyRecord.is_active) {
      return res.status(403).json({ 
        error: 'API key disabled',
        message: 'This API key has been disabled'
      })
    }

    // Update last used timestamp
    await db
      .update(api_keys)
      .set({ last_used_at: new Date() })
      .where(eq(api_keys.id, apiKeyRecord.id))

    // Attach user info to request
    ;(req as any).apiKey = apiKeyRecord
    ;(req as any).userId = apiKeyRecord.user_id

    next()
  } catch (err) {
    console.error('API key authentication error:', err)
    return res.status(500).json({ 
      error: 'Authentication error',
      message: 'An error occurred during authentication'
    })
  }
}


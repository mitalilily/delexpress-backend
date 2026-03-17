#!/usr/bin/env ts-node
/**
 * Robust initPool script:
 * - Loads .env.<NODE_ENV>
 * - Dynamically imports ../models/client
 * - If initPool() exists, calls it
 * - Else if pool exists, runs SELECT 1
 * - Else falls back to creating a temporary Pool and testing it
 *
 * Usage:
 *  NODE_ENV=production npx ts-node src/scripts/initPool.ts
 */

import * as dotenv from 'dotenv'
import * as path from 'path'
import { Pool } from 'pg'

async function loadEnv() {
  const env = process.env.NODE_ENV || 'development'
  const envFilePath = path.resolve(__dirname, `../../.env.${env}`)
  console.log('ENVIRONMENT', env)
  console.log('🔍 Loading env file:', envFilePath)
  dotenv.config({ path: envFilePath })
}

async function testPool(pool: Pool) {
  try {
    const res = await pool.query('SELECT 1')
    console.log('✅ DB connection OK:', res.rows)
    return true
  } catch (err) {
    console.error('❌ DB test query failed:', (err as Error).message)
    return false
  }
}

async function main() {
  await loadEnv()

  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL is not set after loading env. Aborting.')
    process.exitCode = 1
    return
  }

  // Try to import the app's client module
  const clientPath = path.resolve(__dirname, '../models/client')
  let clientModule: any
  try {
    clientModule = await import(clientPath)
    console.log('ℹ️ Imported module:', clientPath)
  } catch (err) {
    console.warn('⚠️ Could not import ../models/client:', (err as Error).message)
  }

  // 1) If initPool exists, call it and try to get pool/db from returned object
  if (clientModule && typeof clientModule.initPool === 'function') {
    try {
      console.log('ℹ️ Calling clientModule.initPool() ...')
      const res = clientModule.initPool()
      // initPool may be sync or async
      const maybePromise = res instanceof Promise ? await res : res
      const pool: Pool | undefined = maybePromise?.pool ?? clientModule.pool ?? maybePromise
      if (pool && typeof pool.query === 'function') {
        const ok = await testPool(pool)
        if (ok) {
          // optionally close pool if initPool returned a temporary one? We won't close app pool.
          console.log('✅ initPool succeeded')
          return
        } else {
          process.exitCode = 1
          return
        }
      } else {
        console.warn('⚠️ initPool did not return a pool; falling back.')
      }
    } catch (err) {
      console.error('❌ initPool() threw:', (err as Error).message)
      // fallthrough to other attempts
    }
  }

  // 2) If module exports pool, use it
  if (clientModule && clientModule.pool && typeof clientModule.pool.query === 'function') {
    const pool: Pool = clientModule.pool as Pool
    console.log('ℹ️ Using exported pool from ../models/client')
    const ok = await testPool(pool)
    if (ok) {
      // Do NOT call pool.end() here — leave app pool alive (we're only initializing/validating).
      console.log('✅ Existing pool is healthy')
      return
    } else {
      process.exitCode = 1
      return
    }
  }

  // 3) Fallback: create a temporary Pool here, test and close it
  console.log('ℹ️ Falling back to creating a temporary Pool from DATABASE_URL')
  const tmpPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  })

  try {
    const ok = await testPool(tmpPool)
    if (!ok) process.exitCode = 1
    else console.log('✅ Temporary pool test succeeded; closing it now.')
  } finally {
    try {
      await tmpPool.end()
    } catch (e) {
      // ignore
    }
  }
}

main().catch((err) => {
  console.error('Fatal error in initPool script:', (err as Error).message)
  process.exitCode = 1
})

import * as dotenv from 'dotenv'
import { sql } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/node-postgres'
import path from 'path'
import { Pool } from 'pg'

// Load environment variables (same folder as script)
dotenv.config({ path: path.resolve(__dirname, '.env.production') })

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
})

const db = drizzle(pool)

async function runMigration() {
  try {
    console.log('🔄 Starting courier composite key migration...\n')

    // Step 1: Drop FK constraint
    console.log('Step 1: Dropping FK constraint from DelExpress_zones...')
    await db.execute(sql`
      ALTER TABLE "DelExpress_zones" 
      DROP CONSTRAINT IF EXISTS "DelExpress_zones_courier_id_couriers_id_fk"
    `)
    console.log('  ✓ Done\n')

    // Step 2: Update NULL serviceProvider values
    console.log('Step 2: Updating NULL serviceProvider values to nimbuspost...')
    const result = await db.execute(sql`
      UPDATE "couriers" 
      SET "serviceProvider" = 'nimbuspost' 
      WHERE "serviceProvider" IS NULL
    `)
    console.log(`  ✓ Updated ${result.rowCount} rows\n`)

    // Step 3: Make serviceProvider NOT NULL
    console.log('Step 3: Making serviceProvider NOT NULL...')
    await db.execute(sql`
      ALTER TABLE "couriers" 
      ALTER COLUMN "serviceProvider" SET NOT NULL
    `)
    console.log('  ✓ Done\n')

    // Step 4: Drop old primary key
    console.log('Step 4: Dropping old primary key...')
    await db.execute(sql`
      ALTER TABLE "couriers" 
      DROP CONSTRAINT IF EXISTS "couriers_pkey"
    `)
    console.log('  ✓ Done\n')

    // Step 5: Create composite primary key
    console.log('Step 5: Creating composite primary key (id, serviceProvider)...')
    await db.execute(sql`
      ALTER TABLE "couriers" 
      ADD PRIMARY KEY ("id", "serviceProvider")
    `)
    console.log('  ✓ Done\n')

    console.log('✅ Migration completed successfully!')
    console.log('✅ Couriers table now uses composite primary key (id, serviceProvider)')
    console.log('⚠️  Note: FK constraint from zones table was not recreated.')

    await pool.end()
    process.exit(0)
  } catch (error: any) {
    console.error('❌ Migration failed:', error.message)
    console.error(error)
    await pool.end()
    process.exit(1)
  }
}

runMigration()

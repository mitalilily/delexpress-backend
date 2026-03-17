import 'dotenv/config'
import { readFileSync } from 'fs'
import path from 'path'
import { pool } from '../models/client'

async function runMigration() {
  const client = await pool.connect()
  try {
    // Run all migration files in order
    const migrationFiles = [
      path.join(__dirname, '../../src/drizzle/migrations/0001_fix_condition_column_type.sql'),
      path.join(__dirname, '../../src/drizzle/migrations/0002_add_business_type_to_couriers.sql'),
      path.join(
        __dirname,
        '../../src/drizzle/migrations/0003_add_service_provider_to_shipping_rates.sql',
      ),
    ]

    for (const migrationFile of migrationFiles) {
      try {
        console.log('📄 Reading migration file:', migrationFile)
        const sql = readFileSync(migrationFile, 'utf-8')

        // Remove comments and clean up SQL
        const cleanSql = sql
          .split('\n')
          .filter((line) => !line.trim().startsWith('--'))
          .join('\n')
          .trim()

        if (!cleanSql) {
          console.log('⚠️ No SQL found in migration file, skipping')
          continue
        }

        console.log('🔄 Executing migration...')
        console.log('SQL:', cleanSql)

        await client.query(cleanSql)
        console.log('✅ Migration executed successfully!')
      } catch (error: any) {
        if (error.message?.includes('does not exist')) {
          console.log('ℹ️ Column or table does not exist yet, skipping migration')
          console.log('   This is expected if running drizzle-kit push will create it')
        } else if (error.message?.includes('already jsonb') || error.message?.includes('already exists')) {
          console.log('ℹ️ Column already exists or is correct type, no action needed')
        } else {
          console.error('❌ Migration failed:', error.message)
          // Continue with other migrations even if one fails
        }
      }
    }
  } finally {
    client.release()
    await pool.end()
  }
}

runMigration()
  .then(() => {
    console.log('🎉 Migration process completed')
    process.exit(0)
  })
  .catch((err) => {
    console.error('❌ Fatal error:', err)
    process.exit(1)
  })

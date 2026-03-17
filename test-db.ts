import dotenv from 'dotenv'
import { Pool } from 'pg'

dotenv.config()

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: false,
})

async function testConnection() {
  try {
    console.log('db string', process.env.DATABASE_URL)
    const res = await pool.query('SELECT NOW()')
    console.log('Connection successful:', res.rows[0])
    await pool.end()
  } catch (err) {
    console.error('Connection failed:', err)
  }
}

testConnection()

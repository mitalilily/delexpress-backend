import * as dotenv from 'dotenv'
import { defineConfig } from 'drizzle-kit'
import path from 'path'

const env = process.env.NODE_ENV || 'development'

// Always load from inside backend/ (works locally + VPS)
const envFile = path.resolve(__dirname, `.env.${env}`)

dotenv.config({ path: envFile })

if (!process.env.DATABASE_URL) {
  throw new Error(`DATABASE_URL is not defined in ${envFile}`)
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/schema.ts',
  out: './src/drizzle/migrations',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
})

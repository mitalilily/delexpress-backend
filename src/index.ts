import * as dotenv from 'dotenv'
import path from 'path'
import { server } from './app'
import './crons'
import { testDatabaseConnection } from './models/client'

// Determine environment
const env = process.env.NODE_ENV || 'development'
console.log('node env', env)

// Load correct .env file
dotenv.config({ path: path.resolve(__dirname, `../.env.${env}`) })

// Render provides PORT as a string env var, so coerce it to a real TCP port number.
const PORT = Number(process.env.PORT) || 5002

// Test database connection before starting server
async function startServer() {
  console.log('🔍 Testing database connection...')
  const dbConnected = await testDatabaseConnection()

  if (!dbConnected) {
    console.error('❌ Failed to connect to database. Server will not start.')
    process.exit(1)
  }

  // Set server timeout to 3.5 minutes (210000ms) to allow for slow external API calls
  // Default Node.js server timeout is 2 minutes (120000ms)
  server.timeout = 210000 // 3.5 minutes

  server.listen(PORT, '0.0.0.0', () => {
    const url = env === 'production' ? `https://api.DelExpress.in` : `http://localhost:${PORT}`
    console.log(`🚀 Server running on port ${PORT} in ${env} mode at ${url}`)
  })
}

startServer().catch((err) => {
  console.error('❌ Failed to start server:', err)
  process.exit(1)
})

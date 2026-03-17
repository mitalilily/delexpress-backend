import cookieParser from 'cookie-parser'
import cors from 'cors'
import dotenv from 'dotenv'
import express from 'express'
import http from 'http'
import path from 'path'
import { initSocketServer } from './config/socketServer'
import {
  delhiveryDocumentPushHandler,
  delhiveryScanPushHandler,
  delhiveryWebhookHandler,
} from './controllers/webhooks/delhivery.webhook'
import { ekartWebhookHandler } from './controllers/webhooks/ekart.webhook'
import { xpressbeesWebhookHandler } from './controllers/webhooks/xpressbees.webhook'
import { shopifyOrderWebhookController } from './controllers/shopify.controller'
import adminCourierRoutes from './routes/adminRoutes/adminCourier.routes'
import adminSupportRoutes from './routes/adminRoutes/adminSupport.routes'
import adminUserRoutes from './routes/adminRoutes/adminUser.routes'
import adminWalletRoutes from './routes/adminRoutes/adminWallet.routes'
import b2bAdminRoutes from './routes/adminRoutes/b2b.routes'
import adminBillingInvoiceRoutes from './routes/adminRoutes/billingInvoice.admin.routes'
import adminBillingPreferencesRoutes from './routes/adminRoutes/billingPreferences.admin.routes'
import adminCodRemittanceRoutes from './routes/adminRoutes/codRemittance.admin.routes'
import adminDeveloperRoutes from './routes/adminRoutes/developer.routes'
import locationRoutes from './routes/adminRoutes/location.routes'
import adminOrderRoutes from './routes/adminRoutes/order.routes'
import adminPaymentOptionsRoutes from './routes/adminRoutes/paymentOptions.admin.routes'
import planRoutes from './routes/adminRoutes/plan.routes'
import adminWeightReconciliationRoutes from './routes/adminRoutes/weightReconciliation.admin.routes'
import zoneRoutes from './routes/adminRoutes/zone.routes'
import authRoutes from './routes/authRoutes'
import bankAccountRoutes from './routes/bank.routes'
import billingInvoiceRoutes from './routes/billingInvoice.routes'
import billingPreferencesRoutes from './routes/billingPreferences.routes'
import blogRoutes from './routes/blogs.routes'
import codRemittanceRoutes from './routes/codRemittance.routes'
import courierRoutes from './routes/courier.routes'
import courierPriorityRoutes from './routes/courierPriority.routes'
import dashboardRoutes from './routes/dashboard.routes'
import employeeRoutes from './routes/employee.routes'
import externalApiRoutes from './routes/externalApi.routes'
import globalSearchRoutes from './routes/globalSearch.routes'
import integrationRoutes from './routes/integrationRoutes'
import invoicesRoutes from './routes/invoice.routes'
import invoicePreferencesRoutes from './routes/invoicePreferences.routes'
import labelRoutes from './routes/labelPreferences.routes'
import ndrRoutes from './routes/ndr.routes'
import notificationRoutes from './routes/notifications.routes'
import orderRoutes from './routes/order.routes'
import paymentOptionsRoutes from './routes/paymentOptions.routes'
import pickupRoutes from './routes/pickup.routes'
import pickupAddressesRoutes from './routes/pickupAddresses.route'
import returnsRoutes from './routes/returns.routes'
import rtoRoutes from './routes/rto.routes'
import staticPagesRoutes from './routes/staticPages.routes'
import supportRoutes from './routes/support.routes'
import uploadRoutes from './routes/upload.route'
import profileRoutes from './routes/userProfileRoutes'
import reportsRoutes from './routes/reports.routes'
import userRoutes from './routes/userRoutes'
import walletRoutes from './routes/walletRoutes'
import weightReconciliationRoutes from './routes/weightReconciliation.routes'

// Routes imports
// import other routes here...
// Determine environment
const env = process.env.NODE_ENV || 'development'

// Load correct .env file
dotenv.config({ path: path.resolve(__dirname, `../.env.${env}`) })

const app = express()
const server = http.createServer(app) // ✅ HTTP server for socket.io

// Init socket.io server
initSocketServer(server)

app.use(cookieParser())

const localOrigins = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://localhost:5176',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
  'http://127.0.0.1:5176',
  'http://localhost:3000',
  'http://localhost:3001',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3001',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
  'https://admin.meracourierwala.com',
  'https://app.meracourierwala.com',
]

const envOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)

const allowedOrigins = [...new Set([...localOrigins, ...envOrigins])]

app.use(
  cors({
    origin: (origin, callback) => {
      const isPlatformPreview =
        typeof origin === 'string' &&
        (origin.endsWith('.netlify.app') ||
          origin.endsWith('.netlify.live') ||
          origin.endsWith('.onrender.com'))

      if (!origin || allowedOrigins.includes(origin) || isPlatformPreview) {
        callback(null, true)
      } else {
        callback(new Error(`Not allowed by CORS: ${origin}`))
      }
    },
    credentials: true,
  }),
)

app.get('/', (_req, res) => {
  res.status(200).json({
    ok: true,
    service: 'DelExpress backend',
  })
})

app.get('/health', (_req, res) => {
  res.status(200).json({
    ok: true,
    service: 'DelExpress backend',
  })
})

// Shopify webhooks require raw body for HMAC verification
app.post('/api/webhook/shopify/orders', express.raw({ type: 'application/json' }), shopifyOrderWebhookController)

app.use(express.json())
app.use(express.urlencoded({ extended: true }))

app.use('/api/user', userRoutes)
app.use('/api/profile', profileRoutes)
app.use('/api/auth', authRoutes)
app.use('/api/integrations', integrationRoutes)
app.use('/api/payments', walletRoutes)
app.use('/api/uploads', uploadRoutes)
app.use('/api/bank-account', bankAccountRoutes)
app.use('/api/pickup-addresses', pickupAddressesRoutes)
app.use('/api', pickupRoutes)
app.use('/api', returnsRoutes)
app.use('/api/couriers', courierRoutes)
app.use('/api/courier', courierPriorityRoutes)
app.use('/api/support', supportRoutes)
app.use('/api/admin', adminSupportRoutes)
app.use('/api/admin/users', adminUserRoutes)
app.use('/api/admin/orders', adminOrderRoutes)
app.use('/api/admin/developer', adminDeveloperRoutes)
app.use('/api/admin/couriers', adminCourierRoutes)
app.use('/api/admin/zones', zoneRoutes)
app.use('/api/admin/b2b', b2bAdminRoutes)
app.use('/api/notifications', notificationRoutes)
app.use('/api/orders', orderRoutes)
app.use('/api', invoicePreferencesRoutes)
app.use('/api', invoicesRoutes)
app.use('/api', billingInvoiceRoutes)
app.use('/api', adminBillingInvoiceRoutes)
app.use('/api/blogs', blogRoutes)
app.use('/api/static-pages', staticPagesRoutes)
app.use('/api/dashboard', dashboardRoutes)
app.use('/api/reports', reportsRoutes)
app.use('/api/search', globalSearchRoutes)
app.use('/api/serviceability', locationRoutes)
app.use('/api/user-management', employeeRoutes)
app.use('/api/label-preference', labelRoutes)
app.use('/api/plans', planRoutes)
app.use('/api/billing-preferences', billingPreferencesRoutes)
app.use('/api/cod-remittance', codRemittanceRoutes)
app.use('/api/admin/cod-remittance', adminCodRemittanceRoutes)
app.use('/api/admin/weight-reconciliation', adminWeightReconciliationRoutes)
app.use('/api/admin/wallets', adminWalletRoutes)
app.use('/api/admin/payment-options', adminPaymentOptionsRoutes)
app.use('/api/admin/billing-preferences', adminBillingPreferencesRoutes)
app.use('/api/payment-options', paymentOptionsRoutes)
app.use('/api/weight-reconciliation', weightReconciliationRoutes)
app.use('/api', ndrRoutes)
app.use('/api', rtoRoutes)
app.use('/api/v1', externalApiRoutes)
// Ekart webhook
app.post('/api/webhook/ekart', express.json(), ekartWebhookHandler)
app.post('/api/webhook/ekart/track', express.json(), ekartWebhookHandler)
app.post(
  '/api/webhook/xpressbees',
  express.json({
    verify: (req: any, _res, buf) => {
      req.rawBody = buf.toString('utf8')
    },
  }),
  xpressbeesWebhookHandler,
)
app.post(
  '/api/webhook/xpressbees/track',
  express.json({
    verify: (req: any, _res, buf) => {
      req.rawBody = buf.toString('utf8')
    },
  }),
  xpressbeesWebhookHandler,
)
// Delhivery webhooks - separate endpoints for Scan Push and Document Push
app.post('/api/webhook/delhivery/scan', express.json(), delhiveryScanPushHandler) // Scan Push (Status Updates)
app.post('/api/webhook/delhivery/document', express.json(), delhiveryDocumentPushHandler) // Document Push (POD, Sorter Image, QC Image)
// Legacy unified endpoint (auto-detects type) - kept for backward compatibility
app.post('/api/webhook/delhivery/order', express.json(), delhiveryWebhookHandler)
export { app, server } // ✅ named exports

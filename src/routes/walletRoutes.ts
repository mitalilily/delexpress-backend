import { Router, raw } from 'express'
import {
  getUserWalletBalance,
  getWalletTransactionsController,
} from '../controllers/wallet.controller'
import { confirmFromClient, createTopup } from '../controllers/walletTopup.controller'
import { razorpayWebhook } from '../controllers/webhooks/razorpay.webhooks'
import { requireAuth } from '../middlewares/requireAuth'

const r = Router()

r.post('/wallet/topup', requireAuth, createTopup)
r.get('/wallet/transactions', requireAuth, getWalletTransactionsController)
r.post('/wallet/confirm', requireAuth, confirmFromClient)

r.post('/wallet/webhook', raw({ type: 'application/json' }), razorpayWebhook)

r.get('/wallet/balance', requireAuth, getUserWalletBalance)

export default r

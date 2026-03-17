# ⚠️ CRITICAL: SmartShip Webhook Retry Logic

## 🚨 **The Problem:**

SmartShip has a **strict 2-retry policy**:

1. **First Attempt**: SmartShip sends webhook
2. **Checks Your Response**:
   - ✅ If `success: true` → Done! They continue sending webhooks
   - ❌ If `success: false` OR timeout OR error → They retry
3. **Second Attempt**: Same webhook sent again
4. **After 2 Failures**: 🚫 **SmartShip STOPS sending webhooks for this order PERMANENTLY**

## ⚠️ **What This Means:**

If your webhook fails twice for ANY order:
- 🚫 You will **NEVER** receive tracking updates for that order
- 🚫 You won't know when it's delivered
- 🚫 You won't know when it goes to RTO
- 🚫 COD remittance won't be created
- 🚫 This is **PERMANENT** until manually fixed

## ✅ **Our Solution:**

**ALWAYS return `success: true` to SmartShip, even if we have internal errors!**

### **Updated Webhook Handler:**

```typescript
// ✅ Success case - process webhook
return res.status(200).json({
  data: {
    message: {
      success: true,
      description: 'Webhook processed successfully',
    },
  },
})

// ✅ Order not found - queue for later but still return success
return res.status(200).json({
  data: {
    message: {
      success: true, // ← CRITICAL: Return success!
      description: 'Webhook received and queued',
    },
  },
})

// ✅ Internal error - log it but still return success
return res.status(200).json({
  data: {
    message: {
      success: true, // ← CRITICAL: Return success!
      description: 'Webhook received',
    },
  },
})
```

## 📋 **What We Do:**

1. **Order Found**: ✅ Process normally, return `success: true`
2. **Order Not Found**: ✅ Queue webhook to `pending_webhooks` table, return `success: true`
3. **Internal Error**: ✅ Log error for debugging, return `success: true`
4. **Missing Data**: ✅ Log payload, return `success: true`

## 🎯 **Why This Works:**

- ✅ SmartShip thinks webhook was successful → keeps sending updates
- ✅ We log all errors internally for debugging
- ✅ Pending webhooks are processed when order is created
- ✅ No orders are lost or blacklisted

## 🔍 **Debugging:**

All errors are logged to console:
- `❌ SmartShip webhook error:` - Main error message
- `❌ Error stack:` - Full stack trace
- `⚠️ Order not found:` - Order queued for retry
- `❌ Missing client_order_reference_id:` - Invalid payload

Check logs to see what went wrong, but SmartShip continues sending webhooks!

## 📊 **Pending Webhooks:**

Webhooks for orders that don't exist yet are stored in `pending_webhooks` table:
- Processed by cron job when order is created
- Contains full payload for later processing
- Ensures no tracking updates are lost

## ⚡ **Key Takeaway:**

**NEVER return `success: false` to SmartShip webhook!**

Always acknowledge receipt (`success: true`) and handle errors internally.
Otherwise you lose all future tracking updates for that order!

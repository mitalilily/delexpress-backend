"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const billingInvoice_controller_1 = require("../controllers/billingInvoice.controller");
const requireAuth_1 = require("../middlewares/requireAuth");
const router = (0, express_1.Router)();
// Merchant-scoped invoice APIs
router.get('/billing/invoices', requireAuth_1.requireAuth, billingInvoice_controller_1.listBillingInvoices);
router.post('/billing/invoices/generate', requireAuth_1.requireAuth, billingInvoice_controller_1.generateManualInvoice);
router.get('/billing/invoices/:id/statement', requireAuth_1.requireAuth, billingInvoice_controller_1.getBillingInvoiceStatement);
router.post('/billing/invoices/:id/adjustments', requireAuth_1.requireAuth, billingInvoice_controller_1.addInvoiceAdjustment);
router.post('/billing/invoices/:id/payments', requireAuth_1.requireAuth, billingInvoice_controller_1.recordInvoicePayment);
router.post('/billing/invoices/:id/accept-credits', requireAuth_1.requireAuth, billingInvoice_controller_1.acceptInvoiceCredits);
router.post('/billing/invoices/:id/disputes', requireAuth_1.requireAuth, billingInvoice_controller_1.raiseInvoiceDispute);
exports.default = router;

"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
// src/schema/schema.ts
__exportStar(require("../models/schema/b2bOrders"), exports);
__exportStar(require("../models/schema/b2cOrders"), exports);
__exportStar(require("../models/schema/bankAccounts"), exports);
__exportStar(require("../models/schema/billingInvoices"), exports);
__exportStar(require("../models/schema/billingPreferences"), exports);
__exportStar(require("../models/schema/blogs"), exports);
__exportStar(require("../models/schema/codRemittance"), exports);
__exportStar(require("../models/schema/courierPriority"), exports);
__exportStar(require("../models/schema/couriers"), exports);
__exportStar(require("../models/schema/courierSummary"), exports);
__exportStar(require("../models/schema/employees"), exports);
__exportStar(require("../models/schema/invoicePreferences"), exports);
__exportStar(require("../models/schema/invoices"), exports);
__exportStar(require("../models/schema/kyc"), exports);
__exportStar(require("../models/schema/labelPreferences"), exports);
__exportStar(require("../models/schema/locations"), exports);
__exportStar(require("../models/schema/notifications"), exports);
__exportStar(require("../models/schema/pendingWebhooks"), exports);
__exportStar(require("../models/schema/pickupAddresses"), exports);
__exportStar(require("../models/schema/plans"), exports);
__exportStar(require("../models/schema/platform"), exports);
__exportStar(require("../models/schema/shippingRates"), exports);
__exportStar(require("../models/schema/stores"), exports);
__exportStar(require("../models/schema/supportTickets"), exports);
__exportStar(require("../models/schema/userPlans"), exports);
__exportStar(require("../models/schema/userProfile"), exports);
__exportStar(require("../models/schema/users"), exports);
__exportStar(require("../models/schema/wallet"), exports);
__exportStar(require("../models/schema/weightDiscrepancies"), exports);
__exportStar(require("../models/schema/zones"), exports);

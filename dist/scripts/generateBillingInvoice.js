"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const invoiceGenerator_1 = require("../crons/invoiceGenerator");
(0, invoiceGenerator_1.generateAutoBillingInvoices)({ force: true })
    .then(() => process.exit(0))
    .catch((err) => {
    console.error(err);
    process.exit(1);
});

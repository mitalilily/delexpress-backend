"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const invoicePreferences_controller_1 = require("../controllers/invoicePreferences.controller");
const requireAuth_1 = require("../middlewares/requireAuth");
const router = express_1.default.Router();
// Only two routes: one to save/update, one to fetch
router.post('/invoice-preferences', requireAuth_1.requireAuth, invoicePreferences_controller_1.saveOrUpdateInvoicePreferences);
router.get('/invoice-preferences', requireAuth_1.requireAuth, invoicePreferences_controller_1.fetchInvoicePreferences);
exports.default = router;

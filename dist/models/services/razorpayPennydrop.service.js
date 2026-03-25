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
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.triggerFundAccountValidation = triggerFundAccountValidation;
exports.pennyDropVerifyLive = pennyDropVerifyLive;
const razorpay_1 = require("../../utils/razorpay");
const dotenv = __importStar(require("dotenv"));
const path_1 = __importDefault(require("path"));
// Load correct .env based on NODE_ENV
const env = process.env.NODE_ENV || 'development';
dotenv.config({ path: path_1.default.resolve(__dirname, `../../.env.${env}`) });
/** 1️⃣ Create contact */
async function createContact(name) {
    const { data } = await razorpay_1.razorpayApi.post('/contacts', {
        name,
        type: 'customer', // TODO: Change if needed (e.g. vendor, customer)
    });
    return data.id;
}
/** 2️⃣ Create fund account */
async function createFundAccount(contactId, { name, ifsc, account_number }) {
    const { data } = await razorpay_1.razorpayApi.post('/fund_accounts', {
        contact_id: contactId,
        account_type: 'bank_account',
        bank_account: { name, ifsc, account_number },
    });
    return data.id;
}
/** 3️⃣ Trigger fund account validation — don't poll */
async function triggerFundAccountValidation(fundAccountId) {
    try {
        const { data } = await razorpay_1.razorpayApi.post('/fund_accounts/validations', {
            account_number: process.env.RAZORPAY_SOURCE_ACC, // RazorpayX Current Account #
            fund_account: { id: fundAccountId },
            amount: 100,
            currency: 'INR',
            notes: {
                purpose: 'Bank Account Verification',
            },
        });
        return data;
    }
    catch (err) {
        console.error('🔥 Penny drop validation failed:');
        console.error('👉 Error Message:', err.message);
        console.error('👉 Razorpay Response:', err.response?.data || err);
        throw err;
    }
}
/** ✅ Main exported function for triggering penny drop */
async function pennyDropVerifyLive({ name, ifsc, accountNumber, }) {
    // 1. Create Contact and Fund Account
    const contactId = await createContact(name);
    const fundAccountId = await createFundAccount(contactId, {
        name,
        ifsc,
        account_number: accountNumber,
    });
    // 2. Trigger Penny Drop (No Polling)
    const validation = await triggerFundAccountValidation(fundAccountId);
    return {
        success: false, // we mark as pending — real result will come via webhook
        fundAccountId, // ✅ store this to match webhook later
        validationId: validation.id, // optionally store if needed
        message: 'Verification in progress. Await webhook.',
    };
}

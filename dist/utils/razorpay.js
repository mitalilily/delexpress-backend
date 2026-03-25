"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.razorpayApi = exports.razorpay = exports.isRazorpayConfigured = void 0;
exports.isValidSig = isValidSig;
const axios_1 = __importDefault(require("axios"));
const crypto_1 = __importDefault(require("crypto"));
const dotenv_1 = __importDefault(require("dotenv"));
const path_1 = __importDefault(require("path"));
const razorpay_1 = __importDefault(require("razorpay"));
const env = process.env.NODE_ENV || 'development';
dotenv_1.default.config({ path: path_1.default.resolve(__dirname, `../../.env.${env}`) });
const MODE = process.env.RAZORPAY_MODE ??
    (process.env.NODE_ENV === 'production' ? 'live' : 'test');
const CREDENTIALS = {
    test: {
        key_id: process.env.RAZORPAY_KEY_ID || '',
        key_secret: process.env.RAZORPAY_KEY_SECRET || '',
    },
    live: {
        key_id: process.env.RAZORPAY_KEY_ID_PROD || '',
        key_secret: process.env.RAZORPAY_KEY_SECRET_PROD || '',
    },
};
exports.isRazorpayConfigured = Boolean(CREDENTIALS[MODE].key_id && CREDENTIALS[MODE].key_secret);
if (!exports.isRazorpayConfigured) {
    console.warn(`[Razorpay] Missing credentials for ${MODE.toUpperCase()} mode. Wallet topups are disabled until env vars are set.`);
}
exports.razorpay = new razorpay_1.default({
    key_id: CREDENTIALS[MODE].key_id || 'disabled',
    key_secret: CREDENTIALS[MODE].key_secret || 'disabled',
});
if (exports.isRazorpayConfigured) {
    console.info(`[Razorpay] Initialised in ${MODE.toUpperCase()} mode with key ${CREDENTIALS[MODE].key_id}`);
}
exports.razorpayApi = axios_1.default.create({
    baseURL: 'https://api.razorpay.com/v1',
    auth: {
        username: MODE === 'live'
            ? process.env.RAZORPAY_KEY_ID_PROD || 'disabled'
            : process.env.RAZORPAY_KEY_ID || 'disabled',
        password: MODE === 'live'
            ? process.env.RAZORPAY_KEY_SECRET_PROD || 'disabled'
            : process.env.RAZORPAY_KEY_SECRET || 'disabled',
    },
});
function isValidSig(body, sig) {
    const expected = crypto_1.default
        .createHmac('sha256', MODE === 'live'
        ? process.env.RAZORPAY_WEBHOOK_SECRET_PROD || ''
        : process.env.RAZORPAY_WEBHOOK_SECRET || '')
        .update(body)
        .digest('hex');
    return expected === sig;
}

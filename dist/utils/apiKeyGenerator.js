"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateApiKey = generateApiKey;
exports.generateApiSecret = generateApiSecret;
exports.hashApiKey = hashApiKey;
exports.verifyApiKey = verifyApiKey;
const crypto_1 = __importDefault(require("crypto"));
/**
 * Generate a secure API key
 * Format: ccart_<random_32_chars>
 */
function generateApiKey() {
    const randomBytes = crypto_1.default.randomBytes(16);
    const key = randomBytes.toString('hex');
    return `ccart_${key}`;
}
/**
 * Generate a secure API secret for webhook signing
 */
function generateApiSecret() {
    return crypto_1.default.randomBytes(32).toString('hex');
}
/**
 * Hash an API key for storage
 */
function hashApiKey(apiKey) {
    return crypto_1.default.createHash('sha256').update(apiKey).digest('hex');
}
/**
 * Verify an API key against a hash
 */
function verifyApiKey(apiKey, hash) {
    const computedHash = hashApiKey(apiKey);
    return computedHash === hash;
}

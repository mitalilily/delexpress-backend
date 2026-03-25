"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireApiKey = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../models/client");
const apiKeys_1 = require("../models/schema/apiKeys");
const crypto_1 = __importDefault(require("crypto"));
/**
 * Middleware to authenticate requests using API key
 * Expects API key in header: X-API-Key: <api_key>
 */
const requireApiKey = async (req, res, next) => {
    try {
        const apiKey = req.headers['x-api-key'];
        if (!apiKey) {
            return res.status(401).json({
                error: 'Missing API key',
                message: 'Please provide your API key in the X-API-Key header'
            });
        }
        // Hash the provided API key to compare with stored hash
        const hashedKey = crypto_1.default.createHash('sha256').update(apiKey).digest('hex');
        // Find the API key in database
        const [apiKeyRecord] = await client_1.db
            .select()
            .from(apiKeys_1.api_keys)
            .where((0, drizzle_orm_1.eq)(apiKeys_1.api_keys.api_key, hashedKey))
            .limit(1);
        if (!apiKeyRecord) {
            return res.status(401).json({
                error: 'Invalid API key',
                message: 'The provided API key is invalid'
            });
        }
        if (!apiKeyRecord.is_active) {
            return res.status(403).json({
                error: 'API key disabled',
                message: 'This API key has been disabled'
            });
        }
        // Update last used timestamp
        await client_1.db
            .update(apiKeys_1.api_keys)
            .set({ last_used_at: new Date() })
            .where((0, drizzle_orm_1.eq)(apiKeys_1.api_keys.id, apiKeyRecord.id));
        req.apiKey = apiKeyRecord;
        req.userId = apiKeyRecord.user_id;
        next();
    }
    catch (err) {
        console.error('API key authentication error:', err);
        return res.status(500).json({
            error: 'Authentication error',
            message: 'An error occurred during authentication'
        });
    }
};
exports.requireApiKey = requireApiKey;

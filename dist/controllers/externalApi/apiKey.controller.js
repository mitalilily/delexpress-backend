"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteApiKeyController = exports.updateApiKeyController = exports.listApiKeysController = exports.createApiKeyController = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../../models/client");
// Import users first to ensure it's initialized before api_keys references it
const apiKeys_1 = require("../../models/schema/apiKeys");
require("../../models/schema/users");
const apiKeyGenerator_1 = require("../../utils/apiKeyGenerator");
/**
 * Create a new API key
 * POST /api/v1/api-keys
 */
const createApiKeyController = async (req, res) => {
    try {
        const userId = req.userId; // From requireAuth middleware (for internal use)
        const { key_name, permissions } = req.body;
        if (!key_name) {
            return res.status(400).json({
                success: false,
                error: 'Missing required field',
                message: 'key_name is required',
            });
        }
        // Generate API key and secret
        const apiKey = (0, apiKeyGenerator_1.generateApiKey)();
        const apiSecret = (0, apiKeyGenerator_1.generateApiSecret)();
        const hashedKey = (0, apiKeyGenerator_1.hashApiKey)(apiKey);
        // Create API key record
        const [apiKeyRecord] = await client_1.db
            .insert(apiKeys_1.api_keys)
            .values({
            user_id: userId,
            key_name,
            api_key: hashedKey,
            api_secret: apiSecret,
            permissions: permissions || [],
            is_active: true,
        })
            .returning();
        // Return the plain API key only once (for security)
        res.status(201).json({
            success: true,
            message: 'API key created successfully',
            data: {
                id: apiKeyRecord.id,
                key_name: apiKeyRecord.key_name,
                api_key: apiKey, // Only returned on creation
                api_secret: apiSecret, // Only returned on creation
                permissions: apiKeyRecord.permissions,
                is_active: apiKeyRecord.is_active,
                created_at: apiKeyRecord.created_at,
            },
            warning: 'Save your API key and secret securely. They will not be shown again.',
        });
    }
    catch (error) {
        console.error('Error creating API key:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to create API key',
            message: error.message || 'Internal server error',
        });
    }
};
exports.createApiKeyController = createApiKeyController;
/**
 * List API keys (without showing the actual keys)
 * GET /api/v1/api-keys
 */
const listApiKeysController = async (req, res) => {
    try {
        const userId = req.userId;
        // Ensure api_keys is properly initialized
        if (!apiKeys_1.api_keys || typeof apiKeys_1.api_keys !== 'object') {
            console.error('api_keys table is not properly initialized');
            throw new Error('Database schema error: api_keys table not found');
        }
        const keys = await client_1.db.select().from(apiKeys_1.api_keys).where((0, drizzle_orm_1.eq)(apiKeys_1.api_keys.user_id, userId));
        res.status(200).json({
            success: true,
            data: keys.map((key) => ({
                id: key.id,
                key_name: key.key_name,
                permissions: key.permissions,
                is_active: key.is_active,
                last_used_at: key.last_used_at,
                created_at: key.created_at,
                updated_at: key.updated_at,
            })),
        });
    }
    catch (error) {
        console.error('Error listing API keys:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to list API keys',
            message: error.message || 'Internal server error',
        });
    }
};
exports.listApiKeysController = listApiKeysController;
/**
 * Update API key (activate/deactivate, update permissions)
 * PUT /api/v1/api-keys/:id
 */
const updateApiKeyController = async (req, res) => {
    try {
        const userId = req.userId;
        const { id } = req.params;
        const { key_name, is_active, permissions } = req.body;
        // Check if API key exists and belongs to user
        const [existing] = await client_1.db.select().from(apiKeys_1.api_keys).where((0, drizzle_orm_1.eq)(apiKeys_1.api_keys.id, id)).limit(1);
        if (!existing) {
            return res.status(404).json({
                success: false,
                error: 'API key not found',
            });
        }
        if (existing.user_id !== userId) {
            return res.status(403).json({
                success: false,
                error: 'Forbidden',
                message: 'You do not have access to this API key',
            });
        }
        // Update API key
        const updateData = {};
        if (key_name)
            updateData.key_name = key_name;
        if (typeof is_active === 'boolean')
            updateData.is_active = is_active;
        if (permissions)
            updateData.permissions = permissions;
        const [updated] = await client_1.db
            .update(apiKeys_1.api_keys)
            .set(updateData)
            .where((0, drizzle_orm_1.eq)(apiKeys_1.api_keys.id, id))
            .returning();
        res.status(200).json({
            success: true,
            message: 'API key updated',
            data: {
                id: updated.id,
                key_name: updated.key_name,
                permissions: updated.permissions,
                is_active: updated.is_active,
                updated_at: updated.updated_at,
            },
        });
    }
    catch (error) {
        console.error('Error updating API key:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update API key',
            message: error.message || 'Internal server error',
        });
    }
};
exports.updateApiKeyController = updateApiKeyController;
/**
 * Delete API key
 * DELETE /api/v1/api-keys/:id
 */
const deleteApiKeyController = async (req, res) => {
    try {
        const userId = req.userId;
        const { id } = req.params;
        // Check if API key exists and belongs to user
        const [existing] = await client_1.db.select().from(apiKeys_1.api_keys).where((0, drizzle_orm_1.eq)(apiKeys_1.api_keys.id, id)).limit(1);
        if (!existing) {
            return res.status(404).json({
                success: false,
                error: 'API key not found',
            });
        }
        if (existing.user_id !== userId) {
            return res.status(403).json({
                success: false,
                error: 'Forbidden',
                message: 'You do not have access to this API key',
            });
        }
        await client_1.db.delete(apiKeys_1.api_keys).where((0, drizzle_orm_1.eq)(apiKeys_1.api_keys.id, id));
        res.status(200).json({
            success: true,
            message: 'API key deleted',
        });
    }
    catch (error) {
        console.error('Error deleting API key:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to delete API key',
            message: error.message || 'Internal server error',
        });
    }
};
exports.deleteApiKeyController = deleteApiKeyController;

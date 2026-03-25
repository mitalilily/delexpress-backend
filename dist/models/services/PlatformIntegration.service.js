"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getStoresByUserId = exports.deleteStoreById = exports.integrateWithWix = exports.integrateWithMagento = exports.integrateWithWooCommerce = exports.ensureShopifyOrderWebhooks = exports.integrateWithShopify = void 0;
exports.upsertShopifySettingsMetafield = upsertShopifySettingsMetafield;
const axios_1 = __importDefault(require("axios"));
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../client");
const stores_1 = require("../schema/stores");
const SHOPIFY_API_VERSION = '2024-04';
const SHOPIFY_WEBHOOK_TOPICS = ['orders/create', 'orders/updated', 'orders/cancelled'];
/**
 * Connects Shopify store using provided credentials
 * @param storeUrl Shopify store URL
 * @param apiKey Shopify API Key
 * @param adminApiAccessToken Shopify Admin API Access Token
 * @param hostName Shopify Host Name
 */
const integrateWithShopify = async (storeUrl, apiKey, adminApiAccessToken) => {
    const shopifyApiUrl = `https://${storeUrl}/admin/api/2024-04/shop.json`;
    try {
        const response = await axios_1.default.get(shopifyApiUrl, {
            headers: {
                'Content-Type': 'application/json',
                'X-Shopify-Access-Token': adminApiAccessToken,
            },
            auth: {
                username: apiKey?.trim(),
                password: adminApiAccessToken?.trim(), // In case authentication needs both API Key & Token
            },
        });
        return response.data;
    }
    catch (error) {
        console.error('Shopify API Error:', error);
        // throw new Error(`Failed to connect: ${error.response?.statusText}`);
    }
};
exports.integrateWithShopify = integrateWithShopify;
const normalizeShopifyDomain = (domain) => String(domain || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/+$/, '');
const resolveWebhookAddress = () => {
    const baseUrl = String(process.env.API_URL || '').trim().replace(/\/+$/, '');
    if (!baseUrl) {
        throw new Error('API_URL is not configured for Shopify webhook registration');
    }
    return `${baseUrl}/api/webhook/shopify/orders`;
};
const ensureShopifyOrderWebhooks = async ({ storeUrl, accessToken, }) => {
    const address = resolveWebhookAddress();
    const normalizedDomain = normalizeShopifyDomain(storeUrl);
    const baseUrl = `https://${normalizedDomain}/admin/api/${SHOPIFY_API_VERSION}`;
    const headers = {
        'X-Shopify-Access-Token': accessToken.trim(),
        'Content-Type': 'application/json',
    };
    const { data } = await axios_1.default.get(`${baseUrl}/webhooks.json`, {
        headers,
        params: { limit: 250 },
    });
    const existing = Array.isArray(data?.webhooks) ? data.webhooks : [];
    const existingKeys = new Set(existing.map((wh) => `${String(wh?.topic || '').toLowerCase()}::${String(wh?.address || '')}`));
    const subscribed = [];
    for (const topic of SHOPIFY_WEBHOOK_TOPICS) {
        const key = `${topic.toLowerCase()}::${address}`;
        if (existingKeys.has(key)) {
            subscribed.push(topic);
            continue;
        }
        await axios_1.default.post(`${baseUrl}/webhooks.json`, {
            webhook: {
                topic,
                address,
                format: 'json',
            },
        }, { headers });
        subscribed.push(topic);
    }
    return { address, subscribed };
};
exports.ensureShopifyOrderWebhooks = ensureShopifyOrderWebhooks;
const integrateWithWooCommerce = async (storeUrl, consumerKey, consumerSecret) => {
    try {
        const response = await axios_1.default.get(`${storeUrl}/wp-json/wc/v3`, {
            auth: {
                username: consumerKey.trim(),
                password: consumerSecret.trim(),
            },
        });
        return {
            storeName: response.data?.name || 'WooCommerce Store',
            url: storeUrl,
        };
    }
    catch (error) {
        console.error('❌ WooCommerce API Error:', error?.response?.data || error.message);
        throw new Error('Failed to connect to WooCommerce store');
    }
};
exports.integrateWithWooCommerce = integrateWithWooCommerce;
const integrateWithMagento = async (storeUrl, accessToken) => {
    try {
        const response = await axios_1.default.get(`${storeUrl}/rest/V1/store/storeViews`, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/json',
            },
        });
        return response.data;
    }
    catch (error) {
        console.error('Magento API Error:', error?.response?.data || error.message);
        throw new Error('Failed to connect to Magento store');
    }
};
exports.integrateWithMagento = integrateWithMagento;
const integrateWithWix = async (storeUrl, accessToken) => {
    try {
        const wixApiUrl = `https://www.wixapis.com/stores/v1/products`; // Example endpoint
        const response = await axios_1.default.get(wixApiUrl, {
            headers: {
                Authorization: accessToken,
            },
        });
        return response.data;
    }
    catch (error) {
        console.error('Wix API Error:', error);
        throw new Error('Failed to connect to Wix store');
    }
};
exports.integrateWithWix = integrateWithWix;
async function upsertShopifySettingsMetafield({ storeUrl, accessToken, settings, tx = client_1.db, id, }) {
    const baseUrl = `https://${storeUrl?.trim()}/admin/api/${SHOPIFY_API_VERSION}`;
    const headers = {
        'X-Shopify-Access-Token': accessToken.trim(),
        'Content-Type': 'application/json',
    };
    try {
        const { data: existing } = await axios_1.default.get(`${baseUrl}/metafields.json?namespace=DelExpress&key=settings`, { headers });
        if (existing.metafields?.length > 0) {
            const metafieldId = existing.metafields[0].id;
            await axios_1.default.put(`${baseUrl}/metafields/${metafieldId}.json`, {
                metafield: {
                    id: metafieldId,
                    value: JSON.stringify(settings),
                    type: 'json',
                },
            }, { headers });
            console.log('✅ Updated Shopify settings metafield');
        }
        else {
            await axios_1.default.post(`${baseUrl}/metafields.json`, {
                metafield: {
                    namespace: 'DelExpress',
                    key: 'settings',
                    value: JSON.stringify(settings),
                    type: 'json',
                    owner_resource: 'shop',
                },
            }, { headers });
            console.log('✅ Created new Shopify settings metafield');
        }
        // Also update in DB
        await tx.update(stores_1.stores).set({ settings, updatedAt: new Date() }).where((0, drizzle_orm_1.eq)(stores_1.stores.id, id));
    }
    catch (err) {
        console.error('❌ Failed to sync Shopify metafield:', err.response?.data || err.message);
        throw new Error('Shopify metafield sync failed');
    }
}
const deleteStoreById = async (req, res) => {
    const { storeId } = req.params;
    const userId = req?.user?.sub;
    if (!storeId || !userId) {
        return res.status(400).json({ error: 'Missing store ID' });
    }
    try {
        const deleted = await client_1.db
            .delete(stores_1.stores)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(stores_1.stores.id, storeId), (0, drizzle_orm_1.eq)(stores_1.stores.userId, userId)));
        if (deleted.rowCount === 0) {
            return res.status(404).json({ error: 'Store not found' });
        }
        res.status(200).json({ message: 'Store deleted successfully' });
    }
    catch (error) {
        console.error('❌ Failed to delete store:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
};
exports.deleteStoreById = deleteStoreById;
const getStoresByUserId = async (userId) => {
    return await client_1.db.select().from(stores_1.stores).where((0, drizzle_orm_1.eq)(stores_1.stores.userId, userId));
};
exports.getStoresByUserId = getStoresByUserId;

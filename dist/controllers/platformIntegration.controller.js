"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getUserStoreIntegrations = exports.integrateMagentoStore = exports.integrateWixStore = exports.integrateWooCommerceStore = exports.integrateShopifyStore = void 0;
const PlatformIntegration_service_1 = require("../models/services/PlatformIntegration.service");
const userService_1 = require("../models/services/userService");
const client_1 = require("../models/client");
const schema_1 = require("../schema/schema");
const drizzle_orm_1 = require("drizzle-orm");
/**
 * Enum for supported platforms
 */
var PLATFORMS;
(function (PLATFORMS) {
    PLATFORMS[PLATFORMS["SHOPIFY"] = 1] = "SHOPIFY";
    PLATFORMS[PLATFORMS["WOOCOMMERCE"] = 2] = "WOOCOMMERCE";
    PLATFORMS[PLATFORMS["AMAZON"] = 3] = "AMAZON";
    PLATFORMS[PLATFORMS["MAGENTO"] = 4] = "MAGENTO";
    PLATFORMS[PLATFORMS["WIX"] = 5] = "WIX";
})(PLATFORMS || (PLATFORMS = {}));
/**
 * Handles Shopify store integration using user-provided credentials
 */
const integrateShopifyStore = async (req, res) => {
    const { storeUrl, domain, apiKey, adminApiAccessToken, webhookSecret, userId: bodyUserId, status, id, settings, } = req.body;
    const userId = req?.user?.sub || bodyUserId;
    if ((!storeUrl && !domain) || !apiKey || !adminApiAccessToken || !webhookSecret || !userId) {
        return res.status(400).json({ error: "Missing required fields" });
    }
    try {
        const shopifyData = await (0, PlatformIntegration_service_1.integrateWithShopify)(storeUrl ?? domain, apiKey, adminApiAccessToken);
        if (!shopifyData?.shop?.id) {
            return res.status(500).json({ error: "Shopify integration failed" });
        }
        const storeId = shopifyData.shop.id;
        await client_1.db.transaction(async (tx) => {
            const existingStore = await tx
                .select()
                .from(schema_1.stores)
                .where((0, drizzle_orm_1.eq)(schema_1.stores.id, storeId))
                .limit(1);
            if (existingStore.length > 0 && existingStore[0]?.userId !== userId) {
                throw new Error("This Shopify store is already connected to another merchant account");
            }
            await (0, userService_1.upsertStore)({
                ...shopifyData.shop,
                apiKey,
                adminApiAccessToken,
                shopifyWebhookSecret: webhookSecret,
            }, PLATFORMS.SHOPIFY, userId, tx);
            if (existingStore.length === 0) {
                const updated = await (0, userService_1.updateUserChannelIntegration)(userId, PLATFORMS.SHOPIFY, tx);
                if (!updated)
                    throw new Error("Failed to update sales channels");
            }
            if (settings) {
                await (0, PlatformIntegration_service_1.upsertShopifySettingsMetafield)({
                    storeUrl: domain ?? storeUrl,
                    accessToken: adminApiAccessToken,
                    settings,
                    id: (id ?? storeId)?.toString(),
                    tx,
                });
            }
        });
        let webhookStatus = null;
        let webhookWarning = null;
        try {
            webhookStatus = await (0, PlatformIntegration_service_1.ensureShopifyOrderWebhooks)({
                storeUrl: domain ?? storeUrl,
                accessToken: adminApiAccessToken,
            });
        }
        catch (err) {
            console.warn('⚠️ Shopify webhook setup failed:', err?.response?.data || err?.message || err);
            webhookWarning = 'Store connected, but Shopify webhooks could not be auto-configured';
        }
        res.status(200).json({
            message: "Shopify integration successful!",
            data: shopifyData,
            webhooks: webhookStatus,
            warning: webhookWarning,
        });
    }
    catch (error) {
        console.error("❌ Error integrating Shopify:", error);
        res.status(500).json({ error: "Failed to integrate Shopify store" });
    }
};
exports.integrateShopifyStore = integrateShopifyStore;
const integrateWooCommerceStore = async (req, res) => {
    const { storeUrl, consumerKey, consumerSecret, userId: bodyUserId, status = "active", } = req.body;
    const userId = req?.user?.sub || bodyUserId;
    if (!storeUrl || !consumerKey || !consumerSecret || !userId) {
        return res.status(400).json({ error: "Missing required fields" });
    }
    try {
        const wooData = await (0, PlatformIntegration_service_1.integrateWithWooCommerce)(storeUrl, consumerKey, consumerSecret);
        const storeId = `woo_${userId}_${storeUrl}`; // generate a unique store ID
        await client_1.db.transaction(async (tx) => {
            const existingStore = await tx
                .select()
                .from(schema_1.stores)
                .where((0, drizzle_orm_1.eq)(schema_1.stores.id, storeId))
                .limit(1);
            if (existingStore.length === 0) {
                await (0, userService_1.upsertStore)({
                    id: storeId,
                    domain: storeUrl,
                    name: wooData.storeName,
                    apiKey: consumerKey,
                    adminApiAccessToken: consumerSecret,
                }, PLATFORMS.WOOCOMMERCE, userId, tx);
                const updated = await (0, userService_1.updateUserChannelIntegration)(userId, PLATFORMS.WOOCOMMERCE, tx);
                if (!updated)
                    throw new Error("Failed to update sales channels");
            }
        });
        res.status(200).json({
            message: "WooCommerce integration successful!",
            data: wooData,
        });
    }
    catch (error) {
        console.error("❌ Error integrating WooCommerce:", error);
        res.status(500).json({ error: "Failed to integrate WooCommerce store" });
    }
};
exports.integrateWooCommerceStore = integrateWooCommerceStore;
const integrateWixStore = async (req, res) => {
    console.log("==================");
    const { storeUrl, accessToken, userId: bodyUserId, status = "active" } = req.body;
    const userId = req?.user?.sub || bodyUserId;
    console.log("access token", accessToken, "user id", userId);
    if (!accessToken || !userId) {
        return res.status(400).json({ error: "Missing required fields" });
    }
    try {
        const wixData = await (0, PlatformIntegration_service_1.integrateWithWix)(storeUrl, accessToken);
        const storeId = `wix_${userId}_${storeUrl}`;
        await client_1.db.transaction(async (tx) => {
            const existing = await tx
                .select()
                .from(schema_1.stores)
                .where((0, drizzle_orm_1.eq)(schema_1.stores.id, storeId))
                .limit(1);
            if (!existing.length) {
                await (0, userService_1.upsertStore)({
                    id: storeId,
                    domain: storeUrl,
                    name: "Wix Store",
                    adminApiAccessToken: accessToken,
                }, PLATFORMS.WIX, userId, tx);
                const updated = await (0, userService_1.updateUserChannelIntegration)(userId, PLATFORMS.WIX, tx);
                if (!updated)
                    throw new Error("Failed to update sales channels");
            }
        });
        res.status(200).json({
            message: "Wix integration successful!",
            data: wixData,
        });
    }
    catch (error) {
        console.error("❌ Error integrating Wix:", error);
        res.status(500).json({ error: "Failed to integrate Wix store" });
    }
};
exports.integrateWixStore = integrateWixStore;
const integrateMagentoStore = async (req, res) => {
    const { storeUrl, accessToken, userId: bodyUserId, status = "active" } = req.body;
    const userId = req?.user?.sub || bodyUserId;
    if (!storeUrl || !accessToken || !userId) {
        return res.status(400).json({ error: "Missing required fields" });
    }
    try {
        const magentoData = await (0, PlatformIntegration_service_1.integrateWithMagento)(storeUrl, accessToken);
        const storeId = `magento_${userId}_${storeUrl}`;
        await client_1.db.transaction(async (tx) => {
            const existing = await tx
                .select()
                .from(schema_1.stores)
                .where((0, drizzle_orm_1.eq)(schema_1.stores.id, storeId))
                .limit(1);
            if (!existing.length) {
                await (0, userService_1.upsertStore)({
                    id: storeId,
                    domain: storeUrl,
                    name: "Magento Store",
                    adminApiAccessToken: accessToken,
                }, 4, // Magento
                userId, tx);
                const updated = await (0, userService_1.updateUserChannelIntegration)(userId, 4, tx);
                if (!updated)
                    throw new Error("Failed to update sales channels");
            }
        });
        res.status(200).json({
            message: "Magento integration successful!",
            data: magentoData,
        });
    }
    catch (error) {
        console.error("❌ Magento integration error:", error);
        res.status(500).json({ error: "Failed to integrate Magento store" });
    }
};
exports.integrateMagentoStore = integrateMagentoStore;
const getUserStoreIntegrations = async (req, res) => {
    const userId = req.user.sub;
    if (!userId) {
        return res.status(400).json({ error: "Missing userId" });
    }
    try {
        const stores = await (0, PlatformIntegration_service_1.getStoresByUserId)(userId);
        res.status(200).json({
            success: true,
            data: stores,
        });
    }
    catch (error) {
        console.error("Error fetching store integrations:", error);
        res.status(500).json({ error: "Internal server error" });
    }
};
exports.getUserStoreIntegrations = getUserStoreIntegrations;

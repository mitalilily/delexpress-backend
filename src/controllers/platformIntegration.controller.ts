import { Request, Response } from "express";
import {
  ensureShopifyOrderWebhooks,
  getStoresByUserId,
  integrateWithMagento,
  integrateWithShopify,
  integrateWithWix,
  integrateWithWooCommerce,
  upsertShopifySettingsMetafield,
} from "../models/services/PlatformIntegration.service";
import {
  updateUserChannelIntegration,
  upsertStore,
} from "../models/services/userService";
import { db } from "../models/client";
import { stores } from "../schema/schema";
import { eq } from "drizzle-orm";

/**
 * Enum for supported platforms
 */
enum PLATFORMS {
  SHOPIFY = 1,
  WOOCOMMERCE = 2,
  AMAZON = 3,
  MAGENTO = 4,
  WIX,
}

/**
 * Handles Shopify store integration using user-provided credentials
 */

export const integrateShopifyStore = async (
  req: Request,
  res: Response
): Promise<any> => {
  const {
    storeUrl,
    domain,
    apiKey,
    adminApiAccessToken,
    webhookSecret,
    userId: bodyUserId,
    status,
    id,
    settings,
  } = req.body;
  const userId = (req as any)?.user?.sub || bodyUserId;

  if ((!storeUrl && !domain) || !apiKey || !adminApiAccessToken || !webhookSecret || !userId) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    const shopifyData = await integrateWithShopify(
      storeUrl ?? domain,
      apiKey,
      adminApiAccessToken
    );
    if (!shopifyData?.shop?.id) {
      return res.status(500).json({ error: "Shopify integration failed" });
    }

    const storeId = shopifyData.shop.id;

    await db.transaction(async (tx) => {
      const existingStore = await tx
        .select()
        .from(stores)
        .where(eq(stores.id, storeId))
        .limit(1);

      if (existingStore.length > 0 && existingStore[0]?.userId !== userId) {
        throw new Error("This Shopify store is already connected to another merchant account");
      }

      await upsertStore(
        {
          ...shopifyData.shop,
          apiKey,
          adminApiAccessToken,
          shopifyWebhookSecret: webhookSecret,
        },
        PLATFORMS.SHOPIFY,
        userId,
        tx
      );

      if (existingStore.length === 0) {
        const updated = await updateUserChannelIntegration(
          userId,
          PLATFORMS.SHOPIFY,
          tx
        );
        if (!updated) throw new Error("Failed to update sales channels");
      }

      if (settings) {
        await upsertShopifySettingsMetafield({
          storeUrl: domain ?? storeUrl,
          accessToken: adminApiAccessToken,
          settings,
          id: (id ?? storeId)?.toString(),
          tx,
        });
      }
    });

    let webhookStatus: { address: string; subscribed: string[] } | null = null
    let webhookWarning: string | null = null
    try {
      webhookStatus = await ensureShopifyOrderWebhooks({
        storeUrl: domain ?? storeUrl,
        accessToken: adminApiAccessToken,
      })
    } catch (err: any) {
      console.warn('⚠️ Shopify webhook setup failed:', err?.response?.data || err?.message || err)
      webhookWarning = 'Store connected, but Shopify webhooks could not be auto-configured'
    }

    res.status(200).json({
      message: "Shopify integration successful!",
      data: shopifyData,
      webhooks: webhookStatus,
      warning: webhookWarning,
    });
  } catch (error) {
    console.error("❌ Error integrating Shopify:", error);
    res.status(500).json({ error: "Failed to integrate Shopify store" });
  }
};

export const integrateWooCommerceStore = async (
  req: Request,
  res: Response
): Promise<any> => {
  const {
    storeUrl,
    consumerKey,
    consumerSecret,
    userId: bodyUserId,
    status = "active",
  } = req.body;
  const userId = (req as any)?.user?.sub || bodyUserId;

  if (!storeUrl || !consumerKey || !consumerSecret || !userId) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    const wooData = await integrateWithWooCommerce(
      storeUrl,
      consumerKey,
      consumerSecret
    );

    const storeId = `woo_${userId}_${storeUrl}`; // generate a unique store ID

    await db.transaction(async (tx) => {
      const existingStore = await tx
        .select()
        .from(stores)
        .where(eq(stores.id, storeId))
        .limit(1);

      if (existingStore.length === 0) {
        await upsertStore(
          {
            id: storeId,
            domain: storeUrl,
            name: wooData.storeName,
            apiKey: consumerKey,
            adminApiAccessToken: consumerSecret,
          },
          PLATFORMS.WOOCOMMERCE,
          userId,
          tx
        );

        const updated = await updateUserChannelIntegration(
          userId,
          PLATFORMS.WOOCOMMERCE,
          tx
        );
        if (!updated) throw new Error("Failed to update sales channels");
      }
    });

    res.status(200).json({
      message: "WooCommerce integration successful!",
      data: wooData,
    });
  } catch (error) {
    console.error("❌ Error integrating WooCommerce:", error);
    res.status(500).json({ error: "Failed to integrate WooCommerce store" });
  }
};

export const integrateWixStore = async (req: Request, res: Response) => {
  console.log("==================");
  const { storeUrl, accessToken, userId: bodyUserId, status = "active" } = req.body;
  const userId = (req as any)?.user?.sub || bodyUserId;
  console.log("access token", accessToken, "user id", userId);

  if (!accessToken || !userId) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    const wixData = await integrateWithWix(storeUrl, accessToken);
    const storeId = `wix_${userId}_${storeUrl}`;

    await db.transaction(async (tx) => {
      const existing = await tx
        .select()
        .from(stores)
        .where(eq(stores.id, storeId))
        .limit(1);

      if (!existing.length) {
        await upsertStore(
          {
            id: storeId,
            domain: storeUrl,
            name: "Wix Store",
            adminApiAccessToken: accessToken,
          },
          PLATFORMS.WIX,
          userId,
          tx
        );

        const updated = await updateUserChannelIntegration(
          userId,
          PLATFORMS.WIX,
          tx
        );
        if (!updated) throw new Error("Failed to update sales channels");
      }
    });

    res.status(200).json({
      message: "Wix integration successful!",
      data: wixData,
    });
  } catch (error) {
    console.error("❌ Error integrating Wix:", error);
    res.status(500).json({ error: "Failed to integrate Wix store" });
  }
};
export const integrateMagentoStore = async (req: Request, res: Response) => {
  const { storeUrl, accessToken, userId: bodyUserId, status = "active" } = req.body;
  const userId = (req as any)?.user?.sub || bodyUserId;

  if (!storeUrl || !accessToken || !userId) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    const magentoData = await integrateWithMagento(storeUrl, accessToken);
    const storeId = `magento_${userId}_${storeUrl}`;

    await db.transaction(async (tx) => {
      const existing = await tx
        .select()
        .from(stores)
        .where(eq(stores.id, storeId))
        .limit(1);

      if (!existing.length) {
        await upsertStore(
          {
            id: storeId,
            domain: storeUrl,
            name: "Magento Store",
            adminApiAccessToken: accessToken,
          },
          4, // Magento
          userId,
          tx
        );

        const updated = await updateUserChannelIntegration(userId, 4, tx);
        if (!updated) throw new Error("Failed to update sales channels");
      }
    });

    res.status(200).json({
      message: "Magento integration successful!",
      data: magentoData,
    });
  } catch (error) {
    console.error("❌ Magento integration error:", error);
    res.status(500).json({ error: "Failed to integrate Magento store" });
  }
};

export const getUserStoreIntegrations = async (
  req: any,
  res: Response
): Promise<any> => {
  const userId = req.user.sub;

  if (!userId) {
    return res.status(400).json({ error: "Missing userId" });
  }

  try {
    const stores = await getStoresByUserId(userId);

    res.status(200).json({
      success: true,
      data: stores,
    });
  } catch (error) {
    console.error("Error fetching store integrations:", error);
    res.status(500).json({ error: "Internal server error" });
  }
};

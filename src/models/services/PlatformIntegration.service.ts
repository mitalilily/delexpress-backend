import axios from 'axios'
import { and, eq } from 'drizzle-orm'
import { Request, Response } from 'express'
import { db } from '../client'
import { stores } from '../schema/stores'

const SHOPIFY_API_VERSION = '2024-04'
const SHOPIFY_WEBHOOK_TOPICS = ['orders/create', 'orders/updated', 'orders/cancelled'] as const

interface UpsertShopifySettingsMetafieldParams {
  storeUrl: string // mystore.myshopify.com
  accessToken: string // Admin API token
  settings: Record<string, any> // Your custom settings
  id: string
  tx: any
}

/**
 * Connects Shopify store using provided credentials
 * @param storeUrl Shopify store URL
 * @param apiKey Shopify API Key
 * @param adminApiAccessToken Shopify Admin API Access Token
 * @param hostName Shopify Host Name
 */
export const integrateWithShopify = async (
  storeUrl: string,
  apiKey: string,
  adminApiAccessToken: string,
) => {
  const shopifyApiUrl = `https://${storeUrl}/admin/api/2024-04/shop.json`

  try {
    const response = await axios.get(shopifyApiUrl, {
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': adminApiAccessToken,
      },
      auth: {
        username: apiKey?.trim(),
        password: adminApiAccessToken?.trim(), // In case authentication needs both API Key & Token
      },
    })

    return response.data
  } catch (error) {
    console.error('Shopify API Error:', error)
    // throw new Error(`Failed to connect: ${error.response?.statusText}`);
  }
}

const normalizeShopifyDomain = (domain: string) =>
  String(domain || '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/+$/, '')

const resolveWebhookAddress = () => {
  const baseUrl = String(process.env.API_URL || '').trim().replace(/\/+$/, '')
  if (!baseUrl) {
    throw new Error('API_URL is not configured for Shopify webhook registration')
  }
  return `${baseUrl}/api/webhook/shopify/orders`
}

export const ensureShopifyOrderWebhooks = async ({
  storeUrl,
  accessToken,
}: {
  storeUrl: string
  accessToken: string
}) => {
  const address = resolveWebhookAddress()
  const normalizedDomain = normalizeShopifyDomain(storeUrl)
  const baseUrl = `https://${normalizedDomain}/admin/api/${SHOPIFY_API_VERSION}`
  const headers = {
    'X-Shopify-Access-Token': accessToken.trim(),
    'Content-Type': 'application/json',
  }

  const { data } = await axios.get(`${baseUrl}/webhooks.json`, {
    headers,
    params: { limit: 250 },
  })

  const existing = Array.isArray(data?.webhooks) ? data.webhooks : []
  const existingKeys = new Set(
    existing.map((wh: any) => `${String(wh?.topic || '').toLowerCase()}::${String(wh?.address || '')}`),
  )

  const subscribed: string[] = []

  for (const topic of SHOPIFY_WEBHOOK_TOPICS) {
    const key = `${topic.toLowerCase()}::${address}`
    if (existingKeys.has(key)) {
      subscribed.push(topic)
      continue
    }

    await axios.post(
      `${baseUrl}/webhooks.json`,
      {
        webhook: {
          topic,
          address,
          format: 'json',
        },
      },
      { headers },
    )
    subscribed.push(topic)
  }

  return { address, subscribed }
}

export const integrateWithWooCommerce = async (
  storeUrl: string,
  consumerKey: string,
  consumerSecret: string,
) => {
  try {
    const response = await axios.get(`${storeUrl}/wp-json/wc/v3`, {
      auth: {
        username: consumerKey.trim(),
        password: consumerSecret.trim(),
      },
    })

    return {
      storeName: response.data?.name || 'WooCommerce Store',
      url: storeUrl,
    }
  } catch (error: any) {
    console.error('❌ WooCommerce API Error:', error?.response?.data || error.message)
    throw new Error('Failed to connect to WooCommerce store')
  }
}

export const integrateWithMagento = async (storeUrl: string, accessToken: string) => {
  try {
    const response = await axios.get(`${storeUrl}/rest/V1/store/storeViews`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    })

    return response.data
  } catch (error: any) {
    console.error('Magento API Error:', error?.response?.data || error.message)
    throw new Error('Failed to connect to Magento store')
  }
}

export const integrateWithWix = async (storeUrl: string, accessToken: string): Promise<any> => {
  try {
    const wixApiUrl = `https://www.wixapis.com/stores/v1/products` // Example endpoint
    const response = await axios.get(wixApiUrl, {
      headers: {
        Authorization: accessToken,
      },
    })
    return response.data
  } catch (error) {
    console.error('Wix API Error:', error)
    throw new Error('Failed to connect to Wix store')
  }
}

export async function upsertShopifySettingsMetafield({
  storeUrl,
  accessToken,
  settings,
  tx = db,
  id,
}: UpsertShopifySettingsMetafieldParams) {
  const baseUrl = `https://${storeUrl?.trim()}/admin/api/${SHOPIFY_API_VERSION}`
  const headers = {
    'X-Shopify-Access-Token': accessToken.trim(),
    'Content-Type': 'application/json',
  }

  try {
    const { data: existing } = await axios.get(
      `${baseUrl}/metafields.json?namespace=DelExpress&key=settings`,
      { headers },
    )

    if (existing.metafields?.length > 0) {
      const metafieldId = existing.metafields[0].id
      await axios.put(
        `${baseUrl}/metafields/${metafieldId}.json`,
        {
          metafield: {
            id: metafieldId,
            value: JSON.stringify(settings),
            type: 'json',
          },
        },
        { headers },
      )
      console.log('✅ Updated Shopify settings metafield')
    } else {
      await axios.post(
        `${baseUrl}/metafields.json`,
        {
          metafield: {
            namespace: 'DelExpress',
            key: 'settings',
            value: JSON.stringify(settings),
            type: 'json',
            owner_resource: 'shop',
          },
        },
        { headers },
      )
      console.log('✅ Created new Shopify settings metafield')
    }

    // Also update in DB
    await tx.update(stores).set({ settings, updatedAt: new Date() }).where(eq(stores.id, id))
  } catch (err: any) {
    console.error('❌ Failed to sync Shopify metafield:', err.response?.data || err.message)
    throw new Error('Shopify metafield sync failed')
  }
}

export const deleteStoreById = async (req: Request, res: Response): Promise<any> => {
  const { storeId } = req.params
  const userId = (req as any)?.user?.sub

  if (!storeId || !userId) {
    return res.status(400).json({ error: 'Missing store ID' })
  }

  try {
    const deleted = await db
      .delete(stores)
      .where(and(eq(stores.id, storeId), eq(stores.userId, userId as string)))

    if (deleted.rowCount === 0) {
      return res.status(404).json({ error: 'Store not found' })
    }

    res.status(200).json({ message: 'Store deleted successfully' })
  } catch (error) {
    console.error('❌ Failed to delete store:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
}
export const getStoresByUserId = async (userId: string) => {
  return await db.select().from(stores).where(eq(stores.userId, userId))
}

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listCourierCredentialsMeta = exports.upsertCourierCredentials = exports.getEffectiveCourierConfig = exports.normalizeEkartBaseUrl = exports.DEFAULT_EKART_BASE_URL = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../client");
const courierCredentials_1 = require("../schema/courierCredentials");
const KNOWN_PROVIDERS = ['delhivery', 'shipway', 'xpressbees', 'ekart'];
exports.DEFAULT_EKART_BASE_URL = 'https://app.elite.ekartlogistics.in';
const hasEnvForProviderAndType = (provider, _type) => {
    if (provider === 'delhivery') {
        return !!(process.env.DELHIVERY_API_KEY || process.env.DELHIVERY_CLIENT_NAME);
    }
    if (provider === 'shipway') {
        return !!(process.env.SHIPWAY_USERNAME || process.env.SHIPWAY_PASSWORD);
    }
    if (provider === 'xpressbees') {
        return !!(process.env.XPRESSBEES_API_TOKEN ||
            (process.env.XPRESSBEES_USERNAME && process.env.XPRESSBEES_PASSWORD));
    }
    if (provider === 'ekart') {
        return !!(process.env.EKART_CLIENT_ID ||
            process.env.EKART_USERNAME ||
            process.env.EKART_PASSWORD ||
            process.env.EKART_BASE_API ||
            process.env.EKART_BASE_AUTH);
    }
    return false;
};
const normalize = (val) => String(val || '').trim();
const normalizeEkartBaseUrl = (value) => {
    const normalized = normalize(value).replace(/\/+$/, '');
    if (!normalized)
        return '';
    if (/^https?:\/\/api\.ekartlogistics\.com$/i.test(normalized)) {
        return exports.DEFAULT_EKART_BASE_URL;
    }
    return normalized;
};
exports.normalizeEkartBaseUrl = normalizeEkartBaseUrl;
const buildConfigFromRow = (provider, row) => {
    if (provider === 'ekart') {
        const ekartBaseUrl = (0, exports.normalizeEkartBaseUrl)(row.apiBase);
        const cfg = {
            clientId: normalize(row.clientId),
            username: normalize(row.username),
            password: normalize(row.password),
            baseApi: ekartBaseUrl,
            baseAuth: ekartBaseUrl,
        };
        return cfg;
    }
    if (provider === 'delhivery') {
        const cfg = {
            apiKey: normalize(row.apiKey),
            clientName: normalize(row.clientName),
        };
        return cfg;
    }
    if (provider === 'shipway') {
        const cfg = {
            username: normalize(row.username),
            password: normalize(row.password),
        };
        return cfg;
    }
    const cfg = {
        apiBase: normalize(row.apiBase),
        apiToken: normalize(row.apiKey),
        email: normalize(row.username),
        password: normalize(row.password),
    };
    return cfg;
};
const getEffectiveCourierConfig = async (provider, _type) => {
    let row;
    try {
        ;
        [row] = await client_1.db.select().from(courierCredentials_1.courierCredentials).where((0, drizzle_orm_1.eq)(courierCredentials_1.courierCredentials.provider, provider));
    }
    catch (err) {
        if (err?.message?.includes('does not exist') || err?.message?.includes('relation') || err?.code === '42P01') {
            console.warn('[getEffectiveCourierConfig] courier_credentials table does not exist, using env fallback', provider);
            return null;
        }
        throw err;
    }
    if (!row)
        return null;
    return buildConfigFromRow(provider, row);
};
exports.getEffectiveCourierConfig = getEffectiveCourierConfig;
const upsertCourierCredentials = async (payload) => {
    const { serviceProvider, b2c, b2b } = payload;
    const mergedConfig = (b2c?.config ?? b2b?.config ?? null);
    const rawApiBase = mergedConfig?.baseApi || mergedConfig?.apiBase || '';
    const normalizedApiBase = serviceProvider === 'ekart' ? (0, exports.normalizeEkartBaseUrl)(rawApiBase) : normalize(rawApiBase);
    const values = {
        provider: serviceProvider,
        apiBase: normalizedApiBase,
        clientName: normalize(mergedConfig?.clientName || ''),
        apiKey: normalize(mergedConfig?.apiKey || mergedConfig?.apiToken || ''),
        clientId: normalize(mergedConfig?.clientId || ''),
        username: normalize(mergedConfig?.username || mergedConfig?.email || ''),
        password: normalize(mergedConfig?.password || ''),
        webhookSecret: normalize(mergedConfig?.webhookSecret || ''),
        updatedAt: new Date(),
    };
    await client_1.db
        .insert(courierCredentials_1.courierCredentials)
        .values(values)
        .onConflictDoUpdate({
        target: courierCredentials_1.courierCredentials.provider,
        set: {
            ...values,
            updatedAt: new Date(),
        },
    });
};
exports.upsertCourierCredentials = upsertCourierCredentials;
const listCourierCredentialsMeta = async () => {
    let rows = [];
    try {
        rows = await client_1.db.select().from(courierCredentials_1.courierCredentials);
    }
    catch (err) {
        if (err?.message?.includes('does not exist') || err?.message?.includes('relation') || err?.code === '42P01') {
            return KNOWN_PROVIDERS.map((provider) => ({
                serviceProvider: provider,
                b2c: { configured: false, sameAsB2b: false, usingEnvFallback: hasEnvForProviderAndType(provider, 'b2c') },
                b2b: { configured: false, sameAsB2c: false, usingEnvFallback: hasEnvForProviderAndType(provider, 'b2b') },
            }));
        }
        throw err;
    }
    const byProvider = new Map();
    for (const row of rows)
        byProvider.set(row.provider, row);
    return KNOWN_PROVIDERS.map((provider) => {
        const row = byProvider.get(provider);
        const configured = !!row && [row.apiBase, row.clientName, row.apiKey, row.clientId, row.username, row.password].some((v) => normalize(v).length > 0);
        return {
            serviceProvider: provider,
            b2c: {
                configured,
                sameAsB2b: false,
                usingEnvFallback: !configured && hasEnvForProviderAndType(provider, 'b2c'),
            },
            b2b: {
                configured,
                sameAsB2c: false,
                usingEnvFallback: !configured && hasEnvForProviderAndType(provider, 'b2b'),
            },
        };
    });
};
exports.listCourierCredentialsMeta = listCourierCredentialsMeta;

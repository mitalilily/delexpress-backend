"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteCourierController = exports.deleteShippingRateController = exports.importShippingRatesController = exports.updateShippingRateController = exports.numericToString = exports.updateXpressbeesCredentialsController = exports.updateEkartCredentialsController = exports.updateDelhiveryCredentialsController = exports.getCourierCredentialsController = exports.updateServiceProviderStatusController = exports.getServiceProvidersController = exports.updateCourierStatusController = exports.getAllCouriersListController = exports.getAllCouriersController = exports.getShippingRatesController = exports.fetchAvailableCouriersForAdmin = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const papaparse_1 = __importDefault(require("papaparse"));
const client_1 = require("../../models/client");
const courierIntegration_service_1 = require("../../models/services/courierIntegration.service");
const courierCredentials_service_1 = require("../../models/services/courierCredentials.service");
const ekart_service_1 = require("../../models/services/couriers/ekart.service");
const xpressbees_service_1 = require("../../models/services/couriers/xpressbees.service");
const shiprocket_service_1 = require("../../models/services/shiprocket.service");
const courierCredentials_1 = require("../../models/schema/courierCredentials");
const couriers_1 = require("../../models/schema/couriers");
const zone_service_1 = require("../../models/services/zone.service");
const fetchAvailableCouriersForAdmin = async (req, res) => {
    try {
        const { origin, destination, payment_type, order_amount, weight, length, breadth, height, shipment_type, plan_id, isCalculator, context, } = req.body;
        if (!origin || !destination) {
            return res.status(400).json({
                success: false,
                error: 'pickupPincode and deliveryPincode are required',
            });
        }
        const couriers = await (0, shiprocket_service_1.fetchAvailableCouriersWithRatesAdmin)({
            origin: Number(origin),
            destination: Number(destination),
            payment_type: payment_type,
            order_amount: order_amount,
            shipment_type: shipment_type,
            weight: Number(weight),
            length: Number(length),
            breadth: Number(breadth),
            height: Number(height),
            isCalculator: isCalculator === true || context === 'rate_calculator',
        }, plan_id);
        return res.json({ success: true, data: couriers ?? [] });
    }
    catch (err) {
        console.error('Error fetching couriers:', err.message);
        return res.status(500).json({ success: false, error: err.message });
    }
};
exports.fetchAvailableCouriersForAdmin = fetchAvailableCouriersForAdmin;
const getShippingRatesController = async (req, res) => {
    try {
        let courierNames = [];
        const rawCourierNames = req.query['courier_name[]'] ?? req.query.courier_name;
        if (Array.isArray(rawCourierNames)) {
            courierNames = rawCourierNames.flat().filter(Boolean).map(String);
        }
        else if (typeof rawCourierNames === 'string') {
            courierNames = [rawCourierNames];
        }
        const filters = {
            courier_name: courierNames.length ? courierNames : undefined,
            mode: req.query.mode,
            min_weight: req.query.businessType?.toLowerCase() === 'b2c'
                ? undefined
                : req.query.min_weight
                    ? Number(req.query.min_weight)
                    : undefined,
            plan_id: req.query.planId,
            business_type: req.query.businessType || undefined,
        };
        const rates = await (0, courierIntegration_service_1.getShippingRates)(filters);
        res.json({ success: true, data: rates });
    }
    catch (err) {
        console.error('Error fetching shipping rates:', err);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
};
exports.getShippingRatesController = getShippingRatesController;
const getAllCouriersController = async (req, res) => {
    try {
        const courierList = await client_1.db
            .select({
            id: couriers_1.couriers.id,
            name: couriers_1.couriers.name,
            serviceProvider: couriers_1.couriers.serviceProvider,
            isEnabled: couriers_1.couriers.isEnabled,
            createdAt: couriers_1.couriers.createdAt,
        })
            .from(couriers_1.couriers)
            .orderBy((0, drizzle_orm_1.desc)(couriers_1.couriers.createdAt));
        res.json({ success: true, data: courierList });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ success: false });
    }
};
exports.getAllCouriersController = getAllCouriersController;
const getAllCouriersListController = async (req, res) => {
    try {
        const { search, serviceProvider, businessType } = req.query;
        const whereClauses = [];
        // Filter by search (name or id)
        if (search && typeof search === 'string' && search.trim()) {
            const searchTerm = `%${search.trim()}%`;
            whereClauses.push((0, drizzle_orm_1.or)((0, drizzle_orm_1.ilike)(couriers_1.couriers.name, searchTerm), (0, drizzle_orm_1.sql) `CAST(${couriers_1.couriers.id} AS TEXT) ILIKE ${searchTerm}`));
        }
        // Filter by service provider
        if (serviceProvider && typeof serviceProvider === 'string' && serviceProvider.trim()) {
            whereClauses.push((0, drizzle_orm_1.eq)(couriers_1.couriers.serviceProvider, serviceProvider.trim()));
        }
        // Filter by business type (b2c or b2b)
        if (businessType && typeof businessType === 'string') {
            const normalizedBusinessType = businessType.trim().toLowerCase();
            if (normalizedBusinessType === 'b2c' || normalizedBusinessType === 'b2b') {
                // Construct JSONB array string - value is validated above (only 'b2c' or 'b2b')
                const jsonbArrayStr = JSON.stringify([normalizedBusinessType]);
                // Match the pattern from shiprocket.service.ts - construct the full JSONB literal
                whereClauses.push((0, drizzle_orm_1.sql) `${couriers_1.couriers.businessType} @> ${drizzle_orm_1.sql.raw(`'${jsonbArrayStr.replace(/'/g, "''")}'::jsonb`)}`);
            }
        }
        const whereCondition = whereClauses.length > 0 ? (0, drizzle_orm_1.and)(...whereClauses) : undefined;
        const courierList = await client_1.db
            .select()
            .from(couriers_1.couriers)
            .where(whereCondition)
            .orderBy((0, drizzle_orm_1.desc)(couriers_1.couriers.createdAt));
        res.json({ success: true, data: courierList });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Failed to fetch couriers' });
    }
};
exports.getAllCouriersListController = getAllCouriersListController;
const updateCourierStatusController = async (req, res) => {
    const { id } = req.params;
    const { serviceProvider, isEnabled, businessType } = req.body;
    try {
        if (!serviceProvider) {
            return res.status(400).json({
                success: false,
                message: 'serviceProvider is required',
            });
        }
        // Build update object
        const updateData = {
            updatedAt: new Date(),
        };
        // Update isEnabled if provided
        if (typeof isEnabled === 'boolean') {
            updateData.isEnabled = isEnabled;
        }
        // Update businessType if provided
        if (businessType && Array.isArray(businessType) && businessType.length > 0) {
            // Validate businessType values
            const validTypes = businessType.filter((type) => type === 'b2c' || type === 'b2b');
            if (validTypes.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: 'businessType must contain at least one valid value: "b2c" or "b2b"',
                });
            }
            updateData.businessType = validTypes;
        }
        // Check if there's anything to update
        if (Object.keys(updateData).length === 1) {
            // Only updatedAt was added, nothing to update
            return res.status(400).json({
                success: false,
                message: 'No valid fields to update. Provide isEnabled and/or businessType',
            });
        }
        const updated = await client_1.db
            .update(couriers_1.couriers)
            .set(updateData)
            .where((0, drizzle_orm_1.and)((0, drizzle_orm_1.eq)(couriers_1.couriers.id, Number(id)), (0, drizzle_orm_1.eq)(couriers_1.couriers.serviceProvider, serviceProvider)))
            .returning();
        if (!updated.length) {
            return res.status(404).json({ success: false, message: 'Courier not found' });
        }
        res.json({ success: true, data: updated[0] });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Failed to update courier' });
    }
};
exports.updateCourierStatusController = updateCourierStatusController;
const getServiceProvidersController = async (req, res) => {
    try {
        // Only expose the main integrated service providers in the enable/disable UI
        const allowedProviders = ['delhivery', 'ekart', 'xpressbees'];
        const rows = await client_1.db
            .select({
            serviceProvider: couriers_1.couriers.serviceProvider,
            totalCouriers: (0, drizzle_orm_1.sql) `count(*)`,
            enabledCouriers: (0, drizzle_orm_1.sql) `sum(case when ${couriers_1.couriers.isEnabled} then 1 else 0 end)`,
        })
            .from(couriers_1.couriers)
            .where((0, drizzle_orm_1.inArray)(couriers_1.couriers.serviceProvider, allowedProviders))
            .groupBy(couriers_1.couriers.serviceProvider)
            .orderBy(couriers_1.couriers.serviceProvider);
        const byProvider = new Map(rows.map((row) => [
            row.serviceProvider,
            {
                serviceProvider: row.serviceProvider,
                totalCouriers: Number(row.totalCouriers || 0),
                enabledCouriers: Number(row.enabledCouriers || 0),
                isEnabled: Number(row.enabledCouriers || 0) > 0,
            },
        ]));
        // Ensure allowed providers are always visible in admin UI,
        // even when no rows exist in couriers table yet.
        const providers = allowedProviders.map((provider) => ({
            serviceProvider: provider,
            totalCouriers: byProvider.get(provider)?.totalCouriers ?? 0,
            enabledCouriers: byProvider.get(provider)?.enabledCouriers ?? 0,
            isEnabled: byProvider.get(provider)?.isEnabled ?? false,
        }));
        res.json({ success: true, data: providers });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Failed to fetch service providers' });
    }
};
exports.getServiceProvidersController = getServiceProvidersController;
const updateServiceProviderStatusController = async (req, res) => {
    const { serviceProvider } = req.params;
    const { isEnabled } = req.body;
    try {
        const allowedProviders = ['delhivery', 'ekart', 'xpressbees'];
        if (!serviceProvider || typeof isEnabled !== 'boolean') {
            return res.status(400).json({
                success: false,
                message: 'serviceProvider (param) and boolean isEnabled (body) are required',
            });
        }
        if (!allowedProviders.includes(String(serviceProvider).toLowerCase())) {
            return res.status(400).json({
                success: false,
                message: `Only these providers are supported: ${allowedProviders.join(', ')}`,
            });
        }
        const updated = await client_1.db
            .update(couriers_1.couriers)
            .set({
            isEnabled,
            updatedAt: new Date(),
        })
            .where((0, drizzle_orm_1.eq)(couriers_1.couriers.serviceProvider, serviceProvider))
            .returning();
        if (!updated.length) {
            return res.status(404).json({ success: false, message: 'No couriers found for provider' });
        }
        res.json({
            success: true,
            data: {
                serviceProvider,
                isEnabled,
                affectedCouriers: updated.length,
            },
        });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Failed to update service provider status' });
    }
};
exports.updateServiceProviderStatusController = updateServiceProviderStatusController;
const getCourierCredentialsController = async (req, res) => {
    try {
        const rows = await client_1.db
            .select({
            provider: courierCredentials_1.courier_credentials.provider,
            apiBase: courierCredentials_1.courier_credentials.apiBase,
            clientName: courierCredentials_1.courier_credentials.clientName,
            apiKey: courierCredentials_1.courier_credentials.apiKey,
            clientId: courierCredentials_1.courier_credentials.clientId,
            username: courierCredentials_1.courier_credentials.username,
            password: courierCredentials_1.courier_credentials.password,
            webhookSecret: courierCredentials_1.courier_credentials.webhookSecret,
        })
            .from(courierCredentials_1.courier_credentials)
            .where((0, drizzle_orm_1.inArray)(courierCredentials_1.courier_credentials.provider, ['delhivery', 'ekart', 'xpressbees']));
        const defaults = {
            delhivery: {
                provider: 'delhivery',
                apiBase: 'https://track.delhivery.com',
                clientName: '',
                hasApiKey: false,
                apiKeyMasked: '',
            },
            ekart: {
                provider: 'ekart',
                apiBase: courierCredentials_service_1.DEFAULT_EKART_BASE_URL,
                clientId: '',
                username: '',
                hasPassword: false,
                hasWebhookSecret: false,
            },
            xpressbees: {
                provider: 'xpressbees',
                apiBase: 'https://shipment.xpressbees.com',
                username: '',
                hasApiKey: false,
                apiKeyMasked: '',
                hasPassword: false,
                hasWebhookSecret: false,
            },
        };
        const data = rows.reduce((acc, row) => {
            const provider = (row.provider || '').toLowerCase();
            if (!provider)
                return acc;
            if (provider === 'delhivery') {
                const apiKey = row.apiKey || '';
                acc.delhivery = {
                    provider: 'delhivery',
                    apiBase: row.apiBase || 'https://track.delhivery.com',
                    clientName: row.clientName || '',
                    hasApiKey: Boolean(apiKey.trim()),
                    apiKeyMasked: apiKey
                        ? `${apiKey.slice(0, 4)}${'*'.repeat(Math.max(apiKey.length - 8, 0))}${apiKey.slice(-4)}`
                        : '',
                };
            }
            else if (provider === 'ekart') {
                const hasPassword = Boolean((row.password || '').trim());
                const hasWebhookSecret = Boolean((row.webhookSecret || '').trim());
                acc.ekart = {
                    provider: 'ekart',
                    apiBase: (0, courierCredentials_service_1.normalizeEkartBaseUrl)(row.apiBase) || courierCredentials_service_1.DEFAULT_EKART_BASE_URL,
                    clientId: row.clientId || '',
                    username: row.username || '',
                    hasPassword,
                    hasWebhookSecret,
                };
            }
            else if (provider === 'xpressbees') {
                const apiKey = row.apiKey || '';
                const hasPassword = Boolean((row.password || '').trim());
                const hasWebhookSecret = Boolean((row.webhookSecret || '').trim());
                acc.xpressbees = {
                    provider: 'xpressbees',
                    apiBase: row.apiBase || 'https://shipment.xpressbees.com',
                    username: row.username || '',
                    hasApiKey: Boolean(apiKey.trim()),
                    apiKeyMasked: apiKey
                        ? `${apiKey.slice(0, 4)}${'*'.repeat(Math.max(apiKey.length - 8, 0))}${apiKey.slice(-4)}`
                        : '',
                    hasPassword,
                    hasWebhookSecret,
                };
            }
            return acc;
        }, { ...defaults });
        res.json({
            success: true,
            data,
        });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Failed to fetch courier credentials' });
    }
};
exports.getCourierCredentialsController = getCourierCredentialsController;
const updateDelhiveryCredentialsController = async (req, res) => {
    const { apiBase, clientName, apiKey } = req.body || {};
    try {
        const nextApiBase = typeof apiBase === 'string' ? apiBase.trim() : undefined;
        const nextClientName = typeof clientName === 'string' ? clientName.trim() : undefined;
        const nextApiKey = typeof apiKey === 'string' ? apiKey.trim() : undefined;
        const hasNewApiKey = typeof nextApiKey === 'string' && nextApiKey.length > 0;
        const [existing] = await client_1.db
            .select({ id: courierCredentials_1.courier_credentials.id })
            .from(courierCredentials_1.courier_credentials)
            .where((0, drizzle_orm_1.eq)(courierCredentials_1.courier_credentials.provider, 'delhivery'))
            .limit(1);
        if (existing) {
            const updatePayload = {
                updatedAt: new Date(),
            };
            if (nextApiBase !== undefined) {
                updatePayload.apiBase = nextApiBase || 'https://track.delhivery.com';
            }
            if (nextClientName !== undefined) {
                updatePayload.clientName = nextClientName;
            }
            if (hasNewApiKey) {
                updatePayload.apiKey = nextApiKey;
            }
            await client_1.db
                .update(courierCredentials_1.courier_credentials)
                .set(updatePayload)
                .where((0, drizzle_orm_1.eq)(courierCredentials_1.courier_credentials.provider, 'delhivery'));
        }
        else {
            await client_1.db.insert(courierCredentials_1.courier_credentials).values({
                provider: 'delhivery',
                apiBase: nextApiBase || 'https://track.delhivery.com',
                clientName: nextClientName || '',
                apiKey: hasNewApiKey ? nextApiKey : '',
            });
        }
        const [saved] = await client_1.db
            .select({
            apiBase: courierCredentials_1.courier_credentials.apiBase,
            clientName: courierCredentials_1.courier_credentials.clientName,
            apiKey: courierCredentials_1.courier_credentials.apiKey,
        })
            .from(courierCredentials_1.courier_credentials)
            .where((0, drizzle_orm_1.eq)(courierCredentials_1.courier_credentials.provider, 'delhivery'))
            .limit(1);
        res.json({
            success: true,
            message: 'Delhivery credentials updated successfully',
            data: {
                provider: 'delhivery',
                apiBase: saved?.apiBase || 'https://track.delhivery.com',
                clientName: saved?.clientName || '',
                hasApiKey: Boolean((saved?.apiKey || '').trim()),
            },
        });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Failed to update Delhivery credentials' });
    }
};
exports.updateDelhiveryCredentialsController = updateDelhiveryCredentialsController;
const updateEkartCredentialsController = async (req, res) => {
    const { apiBase, clientId, username, password, webhookSecret } = req.body || {};
    try {
        const nextApiBase = typeof apiBase === 'string' ? (0, courierCredentials_service_1.normalizeEkartBaseUrl)(apiBase) : undefined;
        const nextClientId = typeof clientId === 'string' ? clientId.trim() : undefined;
        const nextUsername = typeof username === 'string' ? username.trim() : undefined;
        const nextPassword = typeof password === 'string' ? password.trim() : undefined;
        const nextWebhookSecret = typeof webhookSecret === 'string' ? webhookSecret.trim() : undefined;
        const hasPassword = typeof nextPassword === 'string' && nextPassword.length > 0;
        const hasWebhookSecret = typeof nextWebhookSecret === 'string' && nextWebhookSecret.length > 0;
        const [existing] = await client_1.db
            .select({ id: courierCredentials_1.courier_credentials.id })
            .from(courierCredentials_1.courier_credentials)
            .where((0, drizzle_orm_1.eq)(courierCredentials_1.courier_credentials.provider, 'ekart'))
            .limit(1);
        if (existing) {
            const updatePayload = {
                updatedAt: new Date(),
            };
            if (nextApiBase !== undefined) {
                updatePayload.apiBase = nextApiBase || courierCredentials_service_1.DEFAULT_EKART_BASE_URL;
            }
            if (nextClientId !== undefined) {
                updatePayload.clientId = nextClientId;
            }
            if (nextUsername !== undefined) {
                updatePayload.username = nextUsername;
            }
            if (hasPassword) {
                updatePayload.password = nextPassword;
            }
            if (hasWebhookSecret) {
                updatePayload.webhookSecret = nextWebhookSecret;
            }
            await client_1.db
                .update(courierCredentials_1.courier_credentials)
                .set(updatePayload)
                .where((0, drizzle_orm_1.eq)(courierCredentials_1.courier_credentials.provider, 'ekart'));
        }
        else {
            await client_1.db.insert(courierCredentials_1.courier_credentials).values({
                provider: 'ekart',
                apiBase: nextApiBase || courierCredentials_service_1.DEFAULT_EKART_BASE_URL,
                clientName: '',
                apiKey: '',
                clientId: nextClientId || '',
                username: nextUsername || '',
                password: hasPassword ? nextPassword : '',
                webhookSecret: hasWebhookSecret ? nextWebhookSecret : '',
            });
        }
        ekart_service_1.EkartService.clearCachedConfig();
        const [saved] = await client_1.db
            .select({
            apiBase: courierCredentials_1.courier_credentials.apiBase,
            clientId: courierCredentials_1.courier_credentials.clientId,
            username: courierCredentials_1.courier_credentials.username,
            password: courierCredentials_1.courier_credentials.password,
            webhookSecret: courierCredentials_1.courier_credentials.webhookSecret,
        })
            .from(courierCredentials_1.courier_credentials)
            .where((0, drizzle_orm_1.eq)(courierCredentials_1.courier_credentials.provider, 'ekart'))
            .limit(1);
        res.json({
            success: true,
            message: 'Ekart credentials updated successfully',
            data: {
                provider: 'ekart',
                apiBase: (0, courierCredentials_service_1.normalizeEkartBaseUrl)(saved?.apiBase) || courierCredentials_service_1.DEFAULT_EKART_BASE_URL,
                clientId: saved?.clientId || '',
                username: saved?.username || '',
                hasPassword: Boolean((saved?.password || '').trim()),
                hasWebhookSecret: Boolean((saved?.webhookSecret || '').trim()),
            },
        });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Failed to update Ekart credentials' });
    }
};
exports.updateEkartCredentialsController = updateEkartCredentialsController;
const updateXpressbeesCredentialsController = async (req, res) => {
    const { apiBase, username, password, apiKey, webhookSecret } = req.body || {};
    try {
        const nextApiBase = typeof apiBase === 'string' ? apiBase.trim() : undefined;
        const nextUsername = typeof username === 'string' ? username.trim() : undefined;
        const nextPassword = typeof password === 'string' ? password.trim() : undefined;
        const nextApiKey = typeof apiKey === 'string' ? apiKey.trim() : undefined;
        const nextWebhookSecret = typeof webhookSecret === 'string' ? webhookSecret.trim() : undefined;
        const hasPassword = typeof nextPassword === 'string' && nextPassword.length > 0;
        const hasApiKey = typeof nextApiKey === 'string' && nextApiKey.length > 0;
        const hasWebhookSecret = typeof nextWebhookSecret === 'string' && nextWebhookSecret.length > 0;
        const [existing] = await client_1.db
            .select({ id: courierCredentials_1.courier_credentials.id })
            .from(courierCredentials_1.courier_credentials)
            .where((0, drizzle_orm_1.eq)(courierCredentials_1.courier_credentials.provider, 'xpressbees'))
            .limit(1);
        if (existing) {
            const updatePayload = {
                updatedAt: new Date(),
            };
            if (nextApiBase !== undefined) {
                updatePayload.apiBase = nextApiBase || 'https://shipment.xpressbees.com';
            }
            if (nextUsername !== undefined) {
                updatePayload.username = nextUsername;
            }
            if (hasPassword) {
                updatePayload.password = nextPassword;
            }
            if (hasApiKey) {
                updatePayload.apiKey = nextApiKey;
            }
            if (hasWebhookSecret) {
                updatePayload.webhookSecret = nextWebhookSecret;
            }
            await client_1.db
                .update(courierCredentials_1.courier_credentials)
                .set(updatePayload)
                .where((0, drizzle_orm_1.eq)(courierCredentials_1.courier_credentials.provider, 'xpressbees'));
        }
        else {
            await client_1.db.insert(courierCredentials_1.courier_credentials).values({
                provider: 'xpressbees',
                apiBase: nextApiBase || 'https://shipment.xpressbees.com',
                clientName: '',
                apiKey: hasApiKey ? nextApiKey : '',
                clientId: '',
                username: nextUsername || '',
                password: hasPassword ? nextPassword : '',
                webhookSecret: hasWebhookSecret ? nextWebhookSecret : '',
            });
        }
        xpressbees_service_1.XpressbeesService.clearCachedConfig();
        const [saved] = await client_1.db
            .select({
            apiBase: courierCredentials_1.courier_credentials.apiBase,
            username: courierCredentials_1.courier_credentials.username,
            password: courierCredentials_1.courier_credentials.password,
            apiKey: courierCredentials_1.courier_credentials.apiKey,
            webhookSecret: courierCredentials_1.courier_credentials.webhookSecret,
        })
            .from(courierCredentials_1.courier_credentials)
            .where((0, drizzle_orm_1.eq)(courierCredentials_1.courier_credentials.provider, 'xpressbees'))
            .limit(1);
        res.json({
            success: true,
            message: 'Xpressbees credentials updated successfully',
            data: {
                provider: 'xpressbees',
                apiBase: saved?.apiBase || 'https://shipment.xpressbees.com',
                username: saved?.username || '',
                hasPassword: Boolean((saved?.password || '').trim()),
                hasApiKey: Boolean((saved?.apiKey || '').trim()),
                hasWebhookSecret: Boolean((saved?.webhookSecret || '').trim()),
            },
        });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Failed to update Xpressbees credentials' });
    }
};
exports.updateXpressbeesCredentialsController = updateXpressbeesCredentialsController;
// Utility: convert numbers to string for decimal fields
const numericToString = (val) => {
    if (val === null || val === undefined || val === '')
        return null;
    return String(val);
};
exports.numericToString = numericToString;
// ---------------- Controller ----------------
const updateShippingRateController = async (req, res) => {
    try {
        const courierId = Number(req.params.id); // courier_id from params
        let planId = req.params.planId; // plan_id from params
        // Fallback: try to get planId from query or body if not in params
        if (!planId || planId === 'undefined') {
            planId = req.query.planId || req.body.planId || undefined;
        }
        if (!courierId || isNaN(courierId)) {
            return res.status(400).json({ success: false, message: 'Invalid courier ID' });
        }
        if (!planId || planId === 'undefined') {
            return res.status(400).json({
                success: false,
                message: 'Invalid or missing plan ID. Please ensure a plan is selected.',
            });
        }
        const updates = req.body;
        console.log(`[updateShippingRateController] courierId: ${courierId}, planId: ${planId}`);
        const updated = await (0, courierIntegration_service_1.updateShippingRate)(courierId, updates, planId);
        if (!updated)
            return res.status(404).json({ success: false, message: 'Rate card not found' });
        res.json({ success: true, data: updated });
    }
    catch (err) {
        console.log('Error updating shipping rate:', err);
        const statusCode = isSlabValidationError(err) ? 400 : 500;
        res.status(statusCode).json({
            success: false,
            message: isSlabValidationError(err)
                ? String(err?.message || 'Invalid slab configuration')
                : 'Internal Server Error',
        });
    }
};
exports.updateShippingRateController = updateShippingRateController;
const parseSlabJsonCell = (value) => {
    if (!value)
        return [];
    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : [];
    }
    catch {
        return [];
    }
};
const isSlabValidationError = (err) => /slab|overlap|extra_rate|extra_weight_unit/i.test(String(err?.message || err || ''));
const importShippingRatesController = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No file uploaded' });
        }
        const { planId: plan_id, businessType: business_type } = req.query;
        if (!plan_id || !business_type) {
            return res.status(400).json({ success: false, message: 'Missing plan_id or business_type' });
        }
        const csvContent = req.file.buffer.toString('utf8');
        const { data, errors } = papaparse_1.default.parse(csvContent, {
            header: true,
            skipEmptyLines: true,
        });
        if (errors.length) {
            console.error('CSV parse errors:', errors);
            return res.status(400).json({ success: false, message: 'Invalid CSV format', errors: errors });
        }
        const zonesList = await (0, zone_service_1.getAllZones)();
        for (const row of data) {
            const courierId = row['Courier ID'];
            const courierName = row['Courier Name'];
            const serviceProvider = row['Service Provider'];
            const minWeight = row['Min Weight'];
            const mode = row['Mode'] || '';
            if (!courierId || !courierName)
                continue;
            const rates = Object.entries(row)
                .filter(([key]) => business_type === 'b2b'
                ? key.toLowerCase().includes('forward') || key.toLowerCase().includes('rto')
                : key.includes('(Forward)') || key.includes('(RTO)'))
                .flatMap(([zoneKey, value]) => {
                if (!value)
                    return [];
                const zone = zonesList.find((z) => zoneKey.includes(z.name));
                if (!zone)
                    return [];
                if (zoneKey.toLowerCase().includes('forward')) {
                    return [{ zone_id: zone.id, type: 'forward', rate: Number(value) }];
                }
                if (zoneKey.toLowerCase().includes('rto')) {
                    return [{ zone_id: zone.id, type: 'rto', rate: Number(value) }];
                }
                return [];
            });
            const zoneSlabs = {};
            if (business_type === 'b2c') {
                for (const zone of zonesList) {
                    const forwardSlabs = parseSlabJsonCell(row[`${zone.name} (Forward Slabs)`]);
                    const rtoSlabs = parseSlabJsonCell(row[`${zone.name} (RTO Slabs)`]);
                    if (forwardSlabs.length || rtoSlabs.length) {
                        zoneSlabs[zone.id] = {};
                        if (forwardSlabs.length)
                            zoneSlabs[zone.id].forward = forwardSlabs;
                        if (rtoSlabs.length)
                            zoneSlabs[zone.id].rto = rtoSlabs;
                    }
                }
            }
            const codCharges = row['COD Charges'] ? Number(row['COD Charges']) : null;
            const codPercent = row['COD Percent'] ? Number(row['COD Percent']) : null;
            const otherCharges = row['Other Charges'] ? Number(row['Other Charges']) : null;
            // ✅ skip rows without mode, courier info, or any charges/rates
            const hasData = mode ||
                codCharges !== null ||
                codPercent !== null ||
                otherCharges !== null ||
                rates.length > 0 ||
                Object.keys(zoneSlabs).length > 0;
            if (!hasData)
                continue;
            await (0, courierIntegration_service_1.upsertShippingRate)({
                courier_id: courierId,
                courier_name: courierName,
                service_provider: serviceProvider,
                plan_id: plan_id,
                min_weight: minWeight,
                business_type: business_type,
                mode,
                cod_charges: codCharges,
                cod_percent: codPercent,
                other_charges: otherCharges,
                rates,
                zone_slabs: business_type === 'b2c' ? zoneSlabs : undefined,
            });
        }
        res.json({ success: true, message: 'Shipping rates imported successfully' });
    }
    catch (err) {
        console.error('Error importing shipping rates:', err);
        const statusCode = isSlabValidationError(err) ? 400 : 500;
        res.status(statusCode).json({
            success: false,
            message: isSlabValidationError(err)
                ? String(err?.message || 'Invalid slab configuration')
                : 'Internal Server Error',
        });
    }
};
exports.importShippingRatesController = importShippingRatesController;
const deleteShippingRateController = async (req, res) => {
    try {
        const courierId = Number(req.params.id);
        const planId = req.params.planId;
        const businessType = req.query.businessType;
        const zoneId = req.query.zoneId;
        const serviceProvider = req.query.serviceProvider;
        const mode = req.query.mode;
        if (!courierId || !planId || !businessType) {
            return res
                .status(400)
                .json({ success: false, message: 'courierId, planId and businessType are required' });
        }
        const deleted = await (0, courierIntegration_service_1.deleteShippingRate)(courierId, planId, businessType, zoneId, serviceProvider, mode);
        if (!deleted) {
            return res.status(404).json({ success: false, message: 'No matching rate found' });
        }
        res.json({ success: true, message: 'Rate(s) deleted successfully', data: deleted });
    }
    catch (err) {
        console.error('Error deleting shipping rate:', err);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
};
exports.deleteShippingRateController = deleteShippingRateController;
const deleteCourierController = async (req, res) => {
    const { id } = req.params;
    const { serviceProvider } = req.body;
    try {
        if (!serviceProvider) {
            return res.status(400).json({ success: false, message: 'Service provider is required' });
        }
        await (0, courierIntegration_service_1.deleteCourierService)(id, serviceProvider);
        res.json({ success: true, message: 'Courier deleted successfully' });
    }
    catch (err) {
        console.error(err);
        res.status(500).json({ success: false, message: 'Failed to delete courier' });
    }
};
exports.deleteCourierController = deleteCourierController;

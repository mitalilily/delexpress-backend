"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.labelPreferencesService = exports.DEFAULT_PREFERENCES = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../client");
const labelPreferences_1 = require("../schema/labelPreferences");
exports.DEFAULT_PREFERENCES = {
    printer_type: 'thermal',
    char_limit: 25,
    max_items: 3,
    order_info: {
        orderId: true,
        invoiceNumber: true,
        orderDate: false,
        invoiceDate: false,
        orderBarcode: true,
        invoiceBarcode: true,
        declaredValue: true,
        cod: true,
        awb: true,
        terms: true,
    },
    shipper_info: {
        shipperPhone: true,
        gstin: true,
        shipperAddress: true,
        rtoAddress: false,
        sellerBrandName: true,
        brandLogo: true,
    },
    product_info: {
        itemName: true,
        productCost: true,
        productQuantity: true,
        skuCode: false,
        dimension: false,
        deadWeight: false,
        otherCharges: true,
    },
    brand_logo: null,
    powered_by: 'DelExpress',
    created_at: new Date(),
    updated_at: new Date(),
};
exports.labelPreferencesService = {
    async getByUser(userId) {
        const [prefs] = await client_1.db
            .select()
            .from(labelPreferences_1.labelPreferences)
            .where((0, drizzle_orm_1.eq)(labelPreferences_1.labelPreferences.user_id, userId));
        if (prefs) {
            return prefs;
        }
        // Fallback defaults
        return {
            id: null,
            user_id: userId,
            ...exports.DEFAULT_PREFERENCES,
        };
    },
    async createOrUpdate(userId, data) {
        const [existing] = await client_1.db
            .select()
            .from(labelPreferences_1.labelPreferences)
            .where((0, drizzle_orm_1.eq)(labelPreferences_1.labelPreferences.user_id, userId));
        if (existing) {
            const [updated] = await client_1.db
                .update(labelPreferences_1.labelPreferences)
                .set({ ...data, updated_at: new Date() })
                .where((0, drizzle_orm_1.eq)(labelPreferences_1.labelPreferences.user_id, userId))
                .returning();
            return updated;
        }
        else {
            const [created] = await client_1.db
                .insert(labelPreferences_1.labelPreferences)
                .values({ user_id: userId, ...exports.DEFAULT_PREFERENCES, ...data })
                .returning();
            return created;
        }
    },
};

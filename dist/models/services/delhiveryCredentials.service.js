"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDelhiveryCredentials = void 0;
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../client");
const courierCredentials_1 = require("../schema/courierCredentials");
const DEFAULT_DELHIVERY_API_BASE = 'https://track.delhivery.com';
const getDelhiveryCredentials = async () => {
    const [credentials] = await client_1.db
        .select({
        apiBase: courierCredentials_1.courier_credentials.apiBase,
        clientName: courierCredentials_1.courier_credentials.clientName,
        apiKey: courierCredentials_1.courier_credentials.apiKey,
    })
        .from(courierCredentials_1.courier_credentials)
        .where((0, drizzle_orm_1.eq)(courierCredentials_1.courier_credentials.provider, 'delhivery'))
        .limit(1);
    return {
        apiBase: credentials?.apiBase || DEFAULT_DELHIVERY_API_BASE,
        clientName: credentials?.clientName || '',
        apiKey: credentials?.apiKey || '',
    };
};
exports.getDelhiveryCredentials = getDelhiveryCredentials;

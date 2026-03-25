"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/* eslint-disable @typescript-eslint/no-var-requires */
const strict_1 = __importDefault(require("node:assert/strict"));
const createRes = () => {
    const res = {
        statusCode: 200,
        body: undefined,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(payload) {
            this.body = payload;
            return this;
        },
    };
    return res;
};
const run = async () => {
    const shiprocketService = require('../models/services/shiprocket.service');
    const b2bAdminService = require('../models/services/b2bAdmin.service');
    const originalFetchB2C = shiprocketService.fetchAvailableCouriersWithRates;
    const originalFetchB2B = shiprocketService.fetchAvailableCouriersWithRatesB2B;
    const originalFetchAdmin = shiprocketService.fetchAvailableCouriersWithRatesAdmin;
    const originalCalculateB2BRate = b2bAdminService.calculateB2BRate;
    let b2cCall = null;
    let b2bCall = null;
    let adminCall = null;
    let calcCall = null;
    try {
        shiprocketService.fetchAvailableCouriersWithRates = async (params, userId) => {
            b2cCall = { params, userId };
            return [{ id: 1, name: 'Mock B2C', rate: 100, edd: '2 Days' }];
        };
        shiprocketService.fetchAvailableCouriersWithRatesB2B = async (params, userId) => {
            b2bCall = { params, userId };
            return [{ id: 2, name: 'Mock B2B', rate: 200, edd: '3 Days' }];
        };
        shiprocketService.fetchAvailableCouriersWithRatesAdmin = async (params, planId) => {
            adminCall = { params, planId };
            return [{ id: 3, name: 'Mock Admin', rate: 250, edd: '4 Days' }];
        };
        b2bAdminService.calculateB2BRate = async (params) => {
            calcCall = params;
            return {
                rate: 321,
                charges: { total: 321, baseFreight: 300, overheads: [] },
                origin: { zoneCode: 'A' },
                destination: { zoneCode: 'B' },
            };
        };
        const { fetchAvailableCouriersToUser } = require('../controllers/courierIntegration.controller');
        const { fetchAvailableCouriersForAdmin } = require('../controllers/admin/courier.controller');
        const { calculateRateController } = require('../controllers/admin/b2b/b2bAdmin.controller');
        const { getShippingRatesController } = require('../controllers/externalApi/shipping.controller');
        {
            const req = { body: { destination: 110001 }, user: { sub: 'user-1' } };
            const res = createRes();
            await fetchAvailableCouriersToUser(req, res);
            strict_1.default.equal(res.statusCode, 400);
            strict_1.default.equal(res.body?.success, false);
        }
        {
            const req = {
                body: {
                    origin: 400001,
                    destination: 560001,
                    payment_type: 'cod',
                    order_amount: 1500,
                    shipment_type: 'b2c',
                    weight: 750,
                    length: 10,
                    breadth: 10,
                    height: 10,
                    context: 'rate_calculator',
                },
                user: { sub: 'user-1' },
            };
            const res = createRes();
            await fetchAvailableCouriersToUser(req, res);
            strict_1.default.equal(res.statusCode, 200);
            strict_1.default.equal(res.body?.success, true);
            strict_1.default.equal(res.body?.data?.[0]?.name, 'Mock B2C');
            strict_1.default.equal(b2cCall?.userId, 'user-1');
            strict_1.default.equal(b2cCall?.params?.isCalculator, true);
        }
        {
            const req = {
                body: {
                    origin: 400001,
                    destination: 560001,
                    payment_type: 'prepaid',
                    shipment_type: 'b2b',
                    weight: 5000,
                },
                user: { sub: 'user-2' },
            };
            const res = createRes();
            await fetchAvailableCouriersToUser(req, res);
            strict_1.default.equal(res.statusCode, 200);
            strict_1.default.equal(res.body?.success, true);
            strict_1.default.equal(res.body?.data?.[0]?.name, 'Mock B2B');
            strict_1.default.equal(b2bCall?.params?.shipment_type, 'b2b');
            strict_1.default.equal(b2bCall?.userId, 'user-2');
        }
        {
            const req = { body: { destination: 560001 }, userId: 'api-user' };
            const res = createRes();
            await getShippingRatesController(req, res);
            strict_1.default.equal(res.statusCode, 200);
            strict_1.default.equal(res.body?.success, true);
            strict_1.default.ok(Array.isArray(res.body?.data?.rates));
            strict_1.default.equal(res.body?.data?.rates?.[0]?.courier_name, 'Mock B2C');
        }
        {
            const req = {
                body: {
                    origin: 400001,
                    destination: 560001,
                    payment_type: 'cod',
                    order_amount: 1200,
                    weight: 1000,
                    length: 12,
                    breadth: 10,
                    height: 8,
                    context: 'rate_calculator',
                },
            };
            const res = createRes();
            await fetchAvailableCouriersForAdmin(req, res);
            strict_1.default.equal(res.statusCode, 200);
            strict_1.default.equal(res.body?.success, true);
            strict_1.default.equal(res.body?.data?.[0]?.name, 'Mock Admin');
            strict_1.default.equal(adminCall?.params?.isCalculator, true);
        }
        {
            const req = {
                body: {
                    originPincode: '400001',
                    destinationPincode: '560001',
                    weightKg: 12.5,
                    paymentMode: 'COD',
                    invoiceValue: 2500,
                    courierId: 7,
                    serviceProvider: 'delhivery',
                    pieceCount: 2,
                    deliveryTime: 'before 11:00',
                    planId: 'plan-1',
                },
            };
            const res = createRes();
            await calculateRateController(req, res);
            strict_1.default.equal(res.statusCode, 200);
            strict_1.default.equal(res.body?.success, true);
            strict_1.default.equal(res.body?.data?.rate, 321);
            strict_1.default.equal(calcCall?.originPincode, '400001');
            strict_1.default.equal(calcCall?.destinationPincode, '560001');
            strict_1.default.equal(calcCall?.courierScope?.courierId, 7);
            strict_1.default.equal(calcCall?.courierScope?.serviceProvider, 'delhivery');
        }
        console.log('PASS: rate calculator API smoke checks passed');
    }
    finally {
        shiprocketService.fetchAvailableCouriersWithRates = originalFetchB2C;
        shiprocketService.fetchAvailableCouriersWithRatesB2B = originalFetchB2B;
        shiprocketService.fetchAvailableCouriersWithRatesAdmin = originalFetchAdmin;
        b2bAdminService.calculateB2BRate = originalCalculateB2BRate;
    }
};
run().catch((error) => {
    console.error('FAIL: rate calculator API smoke checks failed');
    console.error(error);
    process.exit(1);
});

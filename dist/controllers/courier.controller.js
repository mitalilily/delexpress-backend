"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getShippingRatesForUserController = void 0;
const courierIntegration_service_1 = require("../models/services/courierIntegration.service");
const getShippingRatesForUserController = async (req, res) => {
    try {
        const userId = req.user.sub;
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
            min_weight: req.query.min_weight ? Number(req.query.min_weight) : undefined,
            business_type: req.query.businessType || undefined,
        };
        const rates = await (0, courierIntegration_service_1.getUserShippingRates)(userId, filters);
        res.json({ success: true, data: rates });
    }
    catch (err) {
        console.error('Error fetching shipping rates:', err);
        res.status(500).json({ success: false, message: 'Internal Server Error' });
    }
};
exports.getShippingRatesForUserController = getShippingRatesForUserController;

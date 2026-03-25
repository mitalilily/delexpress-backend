"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getDelhiveryShippingModeByCourierId = exports.isSupportedDelhiveryCourierId = exports.normalizeCourierId = exports.DELHIVERY_ALLOWED_COURIER_IDS = exports.DELHIVERY_COURIER_IDS = void 0;
exports.DELHIVERY_COURIER_IDS = {
    EXPRESS: 100,
    SURFACE: 99,
};
exports.DELHIVERY_ALLOWED_COURIER_IDS = [
    exports.DELHIVERY_COURIER_IDS.EXPRESS,
    exports.DELHIVERY_COURIER_IDS.SURFACE,
];
const normalizeCourierId = (value) => {
    if (typeof value === 'number' && Number.isFinite(value))
        return Number(value);
    if (typeof value === 'string' && value.trim()) {
        const parsed = Number(value.trim());
        return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
};
exports.normalizeCourierId = normalizeCourierId;
const isSupportedDelhiveryCourierId = (value) => {
    const id = (0, exports.normalizeCourierId)(value);
    if (id === null)
        return false;
    return exports.DELHIVERY_ALLOWED_COURIER_IDS.includes(id);
};
exports.isSupportedDelhiveryCourierId = isSupportedDelhiveryCourierId;
const getDelhiveryShippingModeByCourierId = (value) => {
    const id = (0, exports.normalizeCourierId)(value);
    if (id === exports.DELHIVERY_COURIER_IDS.EXPRESS)
        return 'Express';
    if (id === exports.DELHIVERY_COURIER_IDS.SURFACE)
        return 'Surface';
    return null;
};
exports.getDelhiveryShippingModeByCourierId = getDelhiveryShippingModeByCourierId;

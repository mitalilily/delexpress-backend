"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateRevisedShippingCharge = calculateRevisedShippingCharge;
/**
 * Calculate revised shipping charge based on weight difference
 * Uses rate card if available, otherwise proportional calculation
 */
async function calculateRevisedShippingCharge(params) {
    const { declaredWeight, chargedWeight, originalShippingCharge, courierPartner, fromPincode, toPincode, zone, } = params;
    // If no original charge, we can't calculate
    if (!originalShippingCharge || originalShippingCharge === 0) {
        return {
            revisedCharge: 0,
            additionalCharge: 0,
            calculationMethod: 'fixed_rate',
        };
    }
    // Convert grams to kg
    const declaredWeightKg = declaredWeight / 1000;
    const chargedWeightKg = chargedWeight / 1000;
    // If weights are the same, no additional charge
    if (Math.abs(chargedWeight - declaredWeight) < 1) {
        return {
            revisedCharge: originalShippingCharge,
            additionalCharge: 0,
            calculationMethod: 'fixed_rate',
        };
    }
    // Method 1: Slab calculation (preferred)
    if (params.slabWeightG && params.basePrice) {
        const freightCalc = (0, chargeableFreight_1.calculateFreight)({
            actual_weight_g: chargedWeight,
            length_cm: 0,
            width_cm: 0,
            height_cm: 0,
            slab_weight_g: params.slabWeightG,
            base_price: params.basePrice,
        });
        const revisedCharge = freightCalc.freight;
        return {
            revisedCharge,
            additionalCharge: revisedCharge - originalShippingCharge,
            calculationMethod: 'rate_card',
        };
    }
    // Method 2: Proportional fallback (legacy, for cases without slab data)
    const ratePerKg = originalShippingCharge / declaredWeightKg;
    let revisedCharge = ratePerKg * chargedWeightKg;
    revisedCharge = Math.round(revisedCharge * 100) / 100;
    return {
        revisedCharge,
        additionalCharge: revisedCharge - originalShippingCharge,
        calculationMethod: 'proportional',
    };
}
const chargeableFreight_1 = require("./pricing/chargeableFreight");

"use strict";
/**
 * Courier-specific weight calculation service
 * Handles volumetric weight calculation using courier-specific divisors
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.WEIGHT_SLAB_INCREMENT = exports.VOLUMETRIC_DIVISORS = void 0;
exports.calculateVolumetricWeight = calculateVolumetricWeight;
exports.calculateChargedWeight = calculateChargedWeight;
exports.roundToWeightSlab = roundToWeightSlab;
exports.getWeightSlabLabel = getWeightSlabLabel;
exports.calculateOrderWeights = calculateOrderWeights;
exports.hasSignificantDiscrepancy = hasSignificantDiscrepancy;
exports.getVolumetricDivisor = getVolumetricDivisor;
exports.setCourierVolumetricDivisor = setCourierVolumetricDivisor;
exports.setCourierWeightSlabIncrement = setCourierWeightSlabIncrement;
// Volumetric divisors for different couriers (in cm³/kg)
exports.VOLUMETRIC_DIVISORS = {
    // Common couriers
    Delhivery: 5000,
    BlueDart: 5000,
    Ecom: 5000,
    'Ecom Express': 5000,
    DTDC: 5000,
    Shadowfax: 5000,
    'India Post': 4000,
    Ekart: 5000,
    Delivery: 5000,
    Trackon: 5000,
    'Professional Couriers': 5000,
    // Default fallback
    DEFAULT: 5000,
};
// Weight slab increment for different couriers (in kg)
exports.WEIGHT_SLAB_INCREMENT = {
    Delhivery: 0.5, // 500g slabs
    BlueDart: 0.5,
    Ecom: 0.5,
    'Ecom Express': 0.5,
    DTDC: 0.5,
    Shadowfax: 0.5,
    'India Post': 0.5,
    Ekart: 0.5,
    Delivery: 0.5,
    Trackon: 0.5,
    'Professional Couriers': 0.5,
    DEFAULT: 0.5,
};
/**
 * Calculate volumetric weight for a given courier
 */
function calculateVolumetricWeight(dimensions, courierPartner) {
    const { length, breadth, height } = dimensions;
    // Get divisor for the courier
    const divisor = courierPartner && exports.VOLUMETRIC_DIVISORS[courierPartner]
        ? exports.VOLUMETRIC_DIVISORS[courierPartner]
        : exports.VOLUMETRIC_DIVISORS.DEFAULT;
    // Calculate volumetric weight (L × B × H / divisor)
    const volumetricWeight = (length * breadth * height) / divisor;
    return parseFloat(volumetricWeight.toFixed(3));
}
/**
 * Calculate charged weight (max of actual or volumetric)
 */
function calculateChargedWeight(actualWeight, volumetricWeight, courierPartner, slabWeightKg) {
    const chargedWeight = Math.max(actualWeight, volumetricWeight);
    // Round up to nearest slab
    return roundToWeightSlab(chargedWeight, courierPartner, slabWeightKg);
}
/**
 * Round weight to the nearest slab based on courier rules
 */
function roundToWeightSlab(weight, courierPartner, slabWeightKg) {
    const increment = slabWeightKg && slabWeightKg > 0
        ? slabWeightKg
        : courierPartner && exports.WEIGHT_SLAB_INCREMENT[courierPartner]
            ? exports.WEIGHT_SLAB_INCREMENT[courierPartner]
            : exports.WEIGHT_SLAB_INCREMENT.DEFAULT;
    // Round up to nearest slab
    return Math.ceil(weight / increment) * increment;
}
/**
 * Get weight slab label (e.g., "0.5kg", "1.0kg")
 */
function getWeightSlabLabel(weight, courierPartner) {
    const slabbedWeight = roundToWeightSlab(weight, courierPartner);
    return `${slabbedWeight.toFixed(1)}kg`;
}
/**
 * Calculate all weight metrics for an order
 */
function calculateOrderWeights(params) {
    const { actualWeight, dimensions, courierPartner } = params;
    // Calculate volumetric weight
    const volumetricWeight = calculateVolumetricWeight(dimensions, courierPartner);
    // Calculate charged weight
    let chargedWeight;
    if (actualWeight !== undefined) {
        chargedWeight = calculateChargedWeight(actualWeight, volumetricWeight, courierPartner);
    }
    else {
        // If no actual weight, use volumetric
        chargedWeight = roundToWeightSlab(volumetricWeight, courierPartner);
    }
    return {
        actualWeight,
        volumetricWeight,
        chargedWeight,
        weightSlab: getWeightSlabLabel(chargedWeight, courierPartner),
    };
}
/**
 * Check if there's a significant weight discrepancy
 */
function hasSignificantDiscrepancy(declaredWeight, chargedWeight, thresholdKg = 0.05, // 50g default
thresholdPercent = 5) {
    const difference = Math.abs(chargedWeight - declaredWeight);
    const percentDiff = (difference / declaredWeight) * 100;
    return difference > thresholdKg && percentDiff > thresholdPercent;
}
/**
 * Get the volumetric divisor for a courier
 */
function getVolumetricDivisor(courierPartner) {
    return courierPartner && exports.VOLUMETRIC_DIVISORS[courierPartner]
        ? exports.VOLUMETRIC_DIVISORS[courierPartner]
        : exports.VOLUMETRIC_DIVISORS.DEFAULT;
}
/**
 * Add or update a courier's volumetric divisor (for admin config)
 */
function setCourierVolumetricDivisor(courierPartner, divisor) {
    exports.VOLUMETRIC_DIVISORS[courierPartner] = divisor;
}
/**
 * Add or update a courier's weight slab increment (for admin config)
 */
function setCourierWeightSlabIncrement(courierPartner, increment) {
    exports.WEIGHT_SLAB_INCREMENT[courierPartner] = increment;
}

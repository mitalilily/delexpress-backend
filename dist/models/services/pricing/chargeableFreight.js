"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.calculateFreight = calculateFreight;
exports.gramsToKg = gramsToKg;
exports.kgToGrams = kgToGrams;
function calculateFreight({ actual_weight_g, length_cm, width_cm, height_cm, slab_weight_g, base_price, volumetric_divisor = 5000, }) {
    const safeActual = Math.max(0, Number(actual_weight_g) || 0);
    const safeL = Math.max(0, Number(length_cm) || 0);
    const safeW = Math.max(0, Number(width_cm) || 0);
    const safeH = Math.max(0, Number(height_cm) || 0);
    const safeSlab = Math.max(1, Number(slab_weight_g) || 1); // prevent divide-by-zero
    // Volumetric weight: (L * W * H) / divisor → kg; convert to grams
    const volumetricWeightKg = safeL && safeW && safeH ? (safeL * safeW * safeH) / volumetric_divisor : 0;
    const volumetricWeightG = volumetricWeightKg * 1000;
    const chargeableWeight = Math.max(safeActual, volumetricWeightG);
    const slabs = Math.max(1, Math.ceil(chargeableWeight / safeSlab));
    const freight = slabs * Number(base_price || 0);
    return {
        actual_weight: safeActual,
        volumetric_weight: volumetricWeightG,
        chargeable_weight: chargeableWeight,
        slabs,
        freight,
    };
}
function gramsToKg(value) {
    return Math.round((Number(value) || 0) * 1000) / 1000000;
}
function kgToGrams(value) {
    return Math.round((Number(value) || 0) * 1000);
}

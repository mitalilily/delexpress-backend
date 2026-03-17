/**
 * Centralised slab-based freight calculator (B2C only, for now).
 *
 * Formula:
 *   volumetric_weight_g = (L × W × H) / volumetric_divisor * 1000  (cm³ / divisor gives kg → convert to g)
 *   chargeable_weight_g = max(actual_weight_g, volumetric_weight_g)
 *   slabs = ceil(chargeable_weight_g / slab_weight_g)
 *   freight = slabs × base_price
 */
export interface CalculateFreightInput {
  actual_weight_g: number // dead weight in grams
  length_cm: number
  width_cm: number
  height_cm: number
  slab_weight_g: number // min_weight from rate card (grams)
  base_price: number // rate card price for the first slab
  volumetric_divisor?: number // default 5000 (cm³ per kg)
}

export interface CalculateFreightResult {
  actual_weight: number
  volumetric_weight: number
  chargeable_weight: number
  slabs: number
  freight: number
}

export function calculateFreight({
  actual_weight_g,
  length_cm,
  width_cm,
  height_cm,
  slab_weight_g,
  base_price,
  volumetric_divisor = 5000,
}: CalculateFreightInput): CalculateFreightResult {
  const safeActual = Math.max(0, Number(actual_weight_g) || 0)
  const safeL = Math.max(0, Number(length_cm) || 0)
  const safeW = Math.max(0, Number(width_cm) || 0)
  const safeH = Math.max(0, Number(height_cm) || 0)
  const safeSlab = Math.max(1, Number(slab_weight_g) || 1) // prevent divide-by-zero

  // Volumetric weight: (L * W * H) / divisor → kg; convert to grams
  const volumetricWeightKg = safeL && safeW && safeH ? (safeL * safeW * safeH) / volumetric_divisor : 0
  const volumetricWeightG = volumetricWeightKg * 1000

  const chargeableWeight = Math.max(safeActual, volumetricWeightG)
  const slabs = Math.max(1, Math.ceil(chargeableWeight / safeSlab))
  const freight = slabs * Number(base_price || 0)

  return {
    actual_weight: safeActual,
    volumetric_weight: volumetricWeightG,
    chargeable_weight: chargeableWeight,
    slabs,
    freight,
  }
}

export function gramsToKg(value: number): number {
  return Math.round((Number(value) || 0) * 1000) / 1000000
}

export function kgToGrams(value: number): number {
  return Math.round((Number(value) || 0) * 1000)
}

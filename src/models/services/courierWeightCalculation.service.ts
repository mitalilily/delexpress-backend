/**
 * Courier-specific weight calculation service
 * Handles volumetric weight calculation using courier-specific divisors
 */

// Volumetric divisors for different couriers (in cm³/kg)
export const VOLUMETRIC_DIVISORS: Record<string, number> = {
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
}

// Weight slab increment for different couriers (in kg)
export const WEIGHT_SLAB_INCREMENT: Record<string, number> = {
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
}

interface DimensionsInput {
  length: number // in cm
  breadth: number // in cm
  height: number // in cm
}

/**
 * Calculate volumetric weight for a given courier
 */
export function calculateVolumetricWeight(
  dimensions: DimensionsInput,
  courierPartner?: string,
): number {
  const { length, breadth, height } = dimensions
  
  // Get divisor for the courier
  const divisor = courierPartner && VOLUMETRIC_DIVISORS[courierPartner]
    ? VOLUMETRIC_DIVISORS[courierPartner]
    : VOLUMETRIC_DIVISORS.DEFAULT
  
  // Calculate volumetric weight (L × B × H / divisor)
  const volumetricWeight = (length * breadth * height) / divisor
  
  return parseFloat(volumetricWeight.toFixed(3))
}

/**
 * Calculate charged weight (max of actual or volumetric)
 */
export function calculateChargedWeight(
  actualWeight: number,
  volumetricWeight: number,
  courierPartner?: string,
  slabWeightKg?: number,
): number {
  const chargedWeight = Math.max(actualWeight, volumetricWeight)
  
  // Round up to nearest slab
  return roundToWeightSlab(chargedWeight, courierPartner, slabWeightKg)
}

/**
 * Round weight to the nearest slab based on courier rules
 */
export function roundToWeightSlab(weight: number, courierPartner?: string, slabWeightKg?: number): number {
  const increment =
    slabWeightKg && slabWeightKg > 0
      ? slabWeightKg
      : courierPartner && WEIGHT_SLAB_INCREMENT[courierPartner]
      ? WEIGHT_SLAB_INCREMENT[courierPartner]
      : WEIGHT_SLAB_INCREMENT.DEFAULT
  
  // Round up to nearest slab
  return Math.ceil(weight / increment) * increment
}

/**
 * Get weight slab label (e.g., "0.5kg", "1.0kg")
 */
export function getWeightSlabLabel(weight: number, courierPartner?: string): string {
  const slabbedWeight = roundToWeightSlab(weight, courierPartner)
  return `${slabbedWeight.toFixed(1)}kg`
}

/**
 * Calculate all weight metrics for an order
 */
export function calculateOrderWeights(params: {
  actualWeight?: number
  dimensions: DimensionsInput
  courierPartner?: string
}): {
  actualWeight: number | undefined
  volumetricWeight: number
  chargedWeight: number
  weightSlab: string
} {
  const { actualWeight, dimensions, courierPartner } = params
  
  // Calculate volumetric weight
  const volumetricWeight = calculateVolumetricWeight(dimensions, courierPartner)
  
  // Calculate charged weight
  let chargedWeight: number
  if (actualWeight !== undefined) {
    chargedWeight = calculateChargedWeight(actualWeight, volumetricWeight, courierPartner)
  } else {
    // If no actual weight, use volumetric
    chargedWeight = roundToWeightSlab(volumetricWeight, courierPartner)
  }
  
  return {
    actualWeight,
    volumetricWeight,
    chargedWeight,
    weightSlab: getWeightSlabLabel(chargedWeight, courierPartner),
  }
}

/**
 * Check if there's a significant weight discrepancy
 */
export function hasSignificantDiscrepancy(
  declaredWeight: number,
  chargedWeight: number,
  thresholdKg: number = 0.05, // 50g default
  thresholdPercent: number = 5, // 5% default
): boolean {
  const difference = Math.abs(chargedWeight - declaredWeight)
  const percentDiff = (difference / declaredWeight) * 100
  
  return difference > thresholdKg && percentDiff > thresholdPercent
}

/**
 * Get the volumetric divisor for a courier
 */
export function getVolumetricDivisor(courierPartner?: string): number {
  return courierPartner && VOLUMETRIC_DIVISORS[courierPartner]
    ? VOLUMETRIC_DIVISORS[courierPartner]
    : VOLUMETRIC_DIVISORS.DEFAULT
}

/**
 * Add or update a courier's volumetric divisor (for admin config)
 */
export function setCourierVolumetricDivisor(courierPartner: string, divisor: number): void {
  VOLUMETRIC_DIVISORS[courierPartner] = divisor
}

/**
 * Add or update a courier's weight slab increment (for admin config)
 */
export function setCourierWeightSlabIncrement(courierPartner: string, increment: number): void {
  WEIGHT_SLAB_INCREMENT[courierPartner] = increment
}

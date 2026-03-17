import { and, eq, isNull } from 'drizzle-orm'
import { db } from '../client'
import { b2bAdditionalCharges } from '../schema/zones'

type CourierScope = {
  courierId?: number | null
  serviceProvider?: string | null
  planId?: string | null
}

interface ComputeRovChargeParams extends CourierScope {
  /** Invoice / declared value for the shipment */
  invoiceValue: number
  /** Whether seller has opted into insurance */
  isInsurance: boolean
}

/**
 * Compute ROV (Risk on Value) charge for an order using admin-configured
 * additional charges. This mirrors the B2B calculator logic but is safe
 * to call from shipment creation flows (B2C or B2B).
 *
 * Rules:
 * - If insurance is not opted → returns 0
 * - If invoiceValue <= 0 → returns 0
 * - Base formula: max(rov_fixed_amount, invoiceValue × (rov_percentage / 100))
 *   or min(...) based on rov_method
 * - If insurance_charge is set and > 0 → used as override instead of calculated value
 */
export async function computeRovChargeForOrder({
  invoiceValue,
  isInsurance,
  courierId,
  serviceProvider,
  planId,
}: ComputeRovChargeParams): Promise<number> {
  if (!isInsurance) return 0
  if (!invoiceValue || invoiceValue <= 0) return 0

  // Build conditions to fetch additional charges row
  const conditions: any[] = []

  if (courierId !== undefined) {
    if (courierId === null) conditions.push(isNull(b2bAdditionalCharges.courier_id))
    else conditions.push(eq(b2bAdditionalCharges.courier_id, courierId))
  }

  if (serviceProvider !== undefined) {
    if (!serviceProvider) conditions.push(isNull(b2bAdditionalCharges.service_provider))
    else conditions.push(eq(b2bAdditionalCharges.service_provider, serviceProvider))
  }

  if (planId !== undefined) {
    if (!planId) conditions.push(isNull(b2bAdditionalCharges.plan_id))
    else conditions.push(eq(b2bAdditionalCharges.plan_id, planId))
  }

  // If no specific scope given, fall back to global row (all nullable keys)
  const whereClause =
    conditions.length > 0
      ? and(...conditions)
      : and(
          isNull(b2bAdditionalCharges.courier_id),
          isNull(b2bAdditionalCharges.service_provider),
          isNull(b2bAdditionalCharges.plan_id),
        )

  const [additionalCharges] = await db
    .select()
    .from(b2bAdditionalCharges)
    .where(whereClause)
    .limit(1)

  if (!additionalCharges) {
    console.warn('[computeRovChargeForOrder] No additional charges configured, returning 0')
    return 0
  }

  const rovFixedAmount = Number(additionalCharges.rov_fixed_amount || 0)
  const rovPercentage = Number(additionalCharges.rov_percentage || 0)
  const rovMethod = additionalCharges.rov_method || 'whichever_is_higher'

  const rovByFixed = rovFixedAmount
  const rovByPercentage = (invoiceValue * rovPercentage) / 100

  let rovCharge =
    rovMethod === 'whichever_is_lower'
      ? Math.min(rovByFixed || 0, rovByPercentage || 0)
      : Math.max(rovByFixed || 0, rovByPercentage || 0)

  // Optional Insurance Charge override (flat amount)
  const insuranceOverride = Number(additionalCharges.insurance_charge || 0)
  if (insuranceOverride > 0) {
    rovCharge = insuranceOverride
  }

  if (!Number.isFinite(rovCharge) || rovCharge <= 0) {
    return 0
  }

  return rovCharge
}

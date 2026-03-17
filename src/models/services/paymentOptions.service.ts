import { db } from '../client'
import { paymentOptions } from '../schema/paymentOptions'

/**
 * Get payment options settings
 * Returns the first (and only) row, or creates default if none exists
 */
export async function getPaymentOptions() {
  const [settings] = await db.select().from(paymentOptions).limit(1)

  if (settings) {
    return settings
  }

  // Create default settings (both enabled by default)
  const [newSettings] = await db
    .insert(paymentOptions)
    .values({
      codEnabled: true,
      prepaidEnabled: true,
    })
    .returning()

  return newSettings
}

/**
 * Update payment options settings
 */
export async function updatePaymentOptions(updates: {
  codEnabled?: boolean
  prepaidEnabled?: boolean
  minWalletRecharge?: number
}) {
  // Ensure settings exist
  await getPaymentOptions()

  const updateData: any = { updatedAt: new Date() }

  if (updates.codEnabled !== undefined) {
    updateData.codEnabled = updates.codEnabled
  }
  if (updates.prepaidEnabled !== undefined) {
    updateData.prepaidEnabled = updates.prepaidEnabled
  }
  if (updates.minWalletRecharge !== undefined) {
    const value = Number(updates.minWalletRecharge)
    updateData.minWalletRecharge = Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0
  }

  // Update the first (and only) row
  const [updated] = await db.update(paymentOptions).set(updateData).returning()

  // If no rows exist, create one
  if (!updated) {
    const [newSettings] = await db
      .insert(paymentOptions)
      .values({
        codEnabled: updates.codEnabled ?? true,
        prepaidEnabled: updates.prepaidEnabled ?? true,
        minWalletRecharge:
          updates.minWalletRecharge !== undefined && !isNaN(Number(updates.minWalletRecharge))
            ? Math.max(0, Math.floor(Number(updates.minWalletRecharge)))
            : 0,
      })
      .returning()

    return newSettings
  }

  return updated
}

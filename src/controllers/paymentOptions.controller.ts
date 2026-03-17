import { Request, Response } from 'express'
import { getPaymentOptions, updatePaymentOptions } from '../models/services/paymentOptions.service'

/**
 * Get payment options settings (public endpoint)
 * GET /api/payment-options
 */
export async function getPaymentOptionsController(req: Request, res: Response) {
  try {
    const settings = await getPaymentOptions()

    return res.json({
      codEnabled: settings.codEnabled,
      prepaidEnabled: settings.prepaidEnabled,
      minWalletRecharge: settings.minWalletRecharge ?? 0,
    })
  } catch (error: any) {
    console.error('Error getting payment options:', error)
    return res.status(500).json({ error: error.message || 'Failed to fetch payment options' })
  }
}

/**
 * Update payment options settings (admin only)
 * PUT /api/admin/payment-options
 */
export async function updatePaymentOptionsController(req: Request, res: Response) {
  try {
    const { codEnabled, prepaidEnabled, minWalletRecharge } = req.body

    if (
      codEnabled === undefined &&
      prepaidEnabled === undefined &&
      (minWalletRecharge === undefined || minWalletRecharge === null)
    ) {
      return res
        .status(400)
        .json({ error: 'At least one field (codEnabled, prepaidEnabled, minWalletRecharge) must be provided' })
    }

    if (minWalletRecharge !== undefined && minWalletRecharge !== null) {
      const value = Number(minWalletRecharge)
      if (!Number.isFinite(value) || value < 0) {
        return res.status(400).json({ error: 'minWalletRecharge must be a non-negative number' })
      }
    }

    const updates: { codEnabled?: boolean; prepaidEnabled?: boolean; minWalletRecharge?: number } = {}
    if (codEnabled !== undefined) {
      updates.codEnabled = Boolean(codEnabled)
    }
    if (prepaidEnabled !== undefined) {
      updates.prepaidEnabled = Boolean(prepaidEnabled)
    }
    if (minWalletRecharge !== undefined && minWalletRecharge !== null) {
      updates.minWalletRecharge = Number(minWalletRecharge)
    }

    const settings = await updatePaymentOptions(updates)

    return res.json({
      success: true,
      settings: {
        codEnabled: settings.codEnabled,
        prepaidEnabled: settings.prepaidEnabled,
        minWalletRecharge: settings.minWalletRecharge ?? 0,
      },
    })
  } catch (error: any) {
    console.error('Error updating payment options:', error)
    return res.status(500).json({ error: error.message || 'Failed to update payment options' })
  }
}


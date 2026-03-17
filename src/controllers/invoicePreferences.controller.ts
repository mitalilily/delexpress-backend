import { Response } from 'express'
import {
  getInvoicePreferences,
  upsertInvoicePreferences,
} from '../models/services/invoicePreferences.service'

// Single endpoint for create/update
export async function saveOrUpdateInvoicePreferences(req: any, res: Response) {
  try {
    const userId = req.user.sub // assumes auth middleware sets req.user
    const data = req.body

    // Log the incoming data for debugging
    console.log('📝 [Invoice Preferences] Saving preferences for user:', userId)
    console.log('📝 [Invoice Preferences] Received data:', {
      prefix: data.prefix,
      suffix: data.suffix,
      template: data.template,
      logoFile: data.logoFile ? `${data.logoFile.substring(0, 50)}...` : 'null/undefined',
      signatureFile: data.signatureFile
        ? `${data.signatureFile.substring(0, 50)}...`
        : 'null/undefined',
    })

    const preferences = await upsertInvoicePreferences(userId, data)

    console.log('✅ [Invoice Preferences] Successfully saved preferences:', {
      id: preferences.id,
      logoFile: preferences.logoFile ? `${preferences.logoFile.substring(0, 50)}...` : 'null',
      signatureFile: preferences.signatureFile
        ? `${preferences.signatureFile.substring(0, 50)}...`
        : 'null',
    })

    return res.json({ success: true, preferences })
  } catch (err) {
    console.error('❌ [Invoice Preferences] Error saving invoice preferences:', err)
    return res.status(500).json({ success: false, error: 'Internal server error' })
  }
}

export async function fetchInvoicePreferences(req: any, res: Response) {
  try {
    const userId = req.user.sub
    const preferences = await getInvoicePreferences(userId)

    return res.json({ success: true, preferences })
  } catch (err) {
    console.error('Error fetching invoice preferences:', err)
    return res.status(500).json({ success: false, error: 'Internal server error' })
  }
}

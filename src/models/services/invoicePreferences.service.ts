import { eq } from 'drizzle-orm'
import { db } from '../client'
import { invoicePreferences } from '../schema/invoicePreferences'
import { users } from '../schema/users'

export async function upsertInvoicePreferences(userId: string, data: any) {
  const {
    prefix,
    suffix,
    template,
    includeLogo,
    includeSignature,
    logoFile,
    signatureFile,
    sellerName,
    brandName,
    gstNumber,
    panNumber,
    sellerAddress,
    stateCode,
    supportEmail,
    supportPhone,
    invoiceNotes,
    termsAndConditions,
  } = data

  const existing = await db
    .select()
    .from(invoicePreferences)
    .where(eq(invoicePreferences.userId, userId))

  if (existing.length > 0) {
    // Update - preserve existing values if not provided
    const existingPrefs = existing[0]
    const updateData: any = {
      updatedAt: new Date(),
    }

        const updateOrNull = (value: any) =>
          value !== undefined
            ? value && typeof value === 'string'
              ? value.trim().length > 0
                ? value.trim()
                : null
              : value
            : undefined

        const setField = (key: keyof typeof invoicePreferences, value: any) => {
          if (value !== undefined) {
            updateData[key] = value
          }
        }

        if (prefix !== undefined) updateData.prefix = prefix
        if (suffix !== undefined) updateData.suffix = suffix
        if (template !== undefined) updateData.template = template
        if (includeLogo !== undefined) updateData.includeLogo = includeLogo
        else updateData.includeLogo = existingPrefs.includeLogo ?? true
        if (includeSignature !== undefined) updateData.includeSignature = includeSignature
        else updateData.includeSignature = existingPrefs.includeSignature ?? true

        setField('sellerName', updateOrNull(sellerName))
        setField('brandName', updateOrNull(brandName))
        setField('gstNumber', updateOrNull(gstNumber))
        setField('panNumber', updateOrNull(panNumber))
        setField('sellerAddress', updateOrNull(sellerAddress))
        setField('stateCode', updateOrNull(stateCode))
        setField('supportEmail', updateOrNull(supportEmail))
        setField('supportPhone', updateOrNull(supportPhone))
        setField('invoiceNotes', updateOrNull(invoiceNotes))
        setField('termsAndConditions', updateOrNull(termsAndConditions))

        if (logoFile !== undefined) {
          updateData.logoFile = logoFile && logoFile.trim() !== '' ? logoFile.trim() : null
          console.log(
            '📝 [Invoice Preferences] Updating logoFile:',
            updateData.logoFile ? `${updateData.logoFile.substring(0, 50)}...` : 'null',
          )
        } else {
          updateData.logoFile = existingPrefs.logoFile
          console.log(
            '📝 [Invoice Preferences] Preserving existing logoFile:',
            existingPrefs.logoFile ? `${existingPrefs.logoFile.substring(0, 50)}...` : 'null',
          )
        }

        if (signatureFile !== undefined) {
          updateData.signatureFile = signatureFile && signatureFile.trim() !== '' ? signatureFile.trim() : null
          console.log(
            '📝 [Invoice Preferences] Updating signatureFile:',
            updateData.signatureFile ? `${updateData.signatureFile.substring(0, 50)}...` : 'null',
          )
        } else {
          updateData.signatureFile = existingPrefs.signatureFile
          console.log(
            '📝 [Invoice Preferences] Preserving existing signatureFile:',
            existingPrefs.signatureFile ? `${existingPrefs.signatureFile.substring(0, 50)}...` : 'null',
          )
        }

    const updated = await db
      .update(invoicePreferences)
      .set(updateData)
      .where(eq(invoicePreferences.userId, userId))
      .returning()

    console.log('✅ [Invoice Preferences] Successfully updated preferences')
    return updated[0]
  } else {
    // Insert - use defaults for includeLogo/includeSignature if not provided
    const inserted = await db
      .insert(invoicePreferences)
      .values({
        userId,
        prefix: prefix ?? 'INV',
        suffix: suffix ?? '',
        template: template ?? 'classic',
        includeLogo: includeLogo ?? true,
        includeSignature: includeSignature ?? true,
        logoFile: logoFile && logoFile.trim() !== '' ? logoFile : null,
        signatureFile: signatureFile && signatureFile.trim() !== '' ? signatureFile : null,
        sellerName: sellerName && sellerName.trim() !== '' ? sellerName.trim() : null,
        brandName: brandName && brandName.trim() !== '' ? brandName.trim() : null,
        gstNumber: gstNumber && gstNumber.trim() !== '' ? gstNumber.trim() : null,
        panNumber: panNumber && panNumber.trim() !== '' ? panNumber.trim() : null,
        sellerAddress: sellerAddress && sellerAddress.trim() !== '' ? sellerAddress.trim() : null,
        stateCode: stateCode && stateCode.trim() !== '' ? stateCode.trim() : null,
        supportEmail: supportEmail && supportEmail.trim() !== '' ? supportEmail.trim() : null,
        supportPhone: supportPhone && supportPhone.trim() !== '' ? supportPhone.trim() : null,
        invoiceNotes: invoiceNotes && invoiceNotes.trim() !== '' ? invoiceNotes.trim() : null,
        termsAndConditions:
          termsAndConditions && termsAndConditions.trim() !== '' ? termsAndConditions.trim() : null,
      })
      .returning()

    console.log('✅ [Invoice Preferences] Successfully created new preferences')
    return inserted[0]
  }
}

export async function getInvoicePreferences(userId: string) {
  const result = await db
    .select()
    .from(invoicePreferences)
    .where(eq(invoicePreferences.userId, userId))

  return result[0] || null
}

export async function getAdminInvoicePreferences() {
  const [adminUser] = await db.select().from(users).where(eq(users.role, 'admin')).limit(1)
  if (!adminUser) {
    return null
  }
  return getInvoicePreferences(adminUser.id)
}

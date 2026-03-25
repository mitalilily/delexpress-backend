"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.upsertInvoicePreferences = upsertInvoicePreferences;
exports.getInvoicePreferences = getInvoicePreferences;
exports.getAdminInvoicePreferences = getAdminInvoicePreferences;
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../client");
const invoicePreferences_1 = require("../schema/invoicePreferences");
const users_1 = require("../schema/users");
async function upsertInvoicePreferences(userId, data) {
    const { prefix, suffix, template, includeLogo, includeSignature, logoFile, signatureFile, sellerName, brandName, gstNumber, panNumber, sellerAddress, stateCode, supportEmail, supportPhone, invoiceNotes, termsAndConditions, } = data;
    const existing = await client_1.db
        .select()
        .from(invoicePreferences_1.invoicePreferences)
        .where((0, drizzle_orm_1.eq)(invoicePreferences_1.invoicePreferences.userId, userId));
    if (existing.length > 0) {
        // Update - preserve existing values if not provided
        const existingPrefs = existing[0];
        const updateData = {
            updatedAt: new Date(),
        };
        const updateOrNull = (value) => value !== undefined
            ? value && typeof value === 'string'
                ? value.trim().length > 0
                    ? value.trim()
                    : null
                : value
            : undefined;
        const setField = (key, value) => {
            if (value !== undefined) {
                updateData[key] = value;
            }
        };
        if (prefix !== undefined)
            updateData.prefix = prefix;
        if (suffix !== undefined)
            updateData.suffix = suffix;
        if (template !== undefined)
            updateData.template = template;
        if (includeLogo !== undefined)
            updateData.includeLogo = includeLogo;
        else
            updateData.includeLogo = existingPrefs.includeLogo ?? true;
        if (includeSignature !== undefined)
            updateData.includeSignature = includeSignature;
        else
            updateData.includeSignature = existingPrefs.includeSignature ?? true;
        setField('sellerName', updateOrNull(sellerName));
        setField('brandName', updateOrNull(brandName));
        setField('gstNumber', updateOrNull(gstNumber));
        setField('panNumber', updateOrNull(panNumber));
        setField('sellerAddress', updateOrNull(sellerAddress));
        setField('stateCode', updateOrNull(stateCode));
        setField('supportEmail', updateOrNull(supportEmail));
        setField('supportPhone', updateOrNull(supportPhone));
        setField('invoiceNotes', updateOrNull(invoiceNotes));
        setField('termsAndConditions', updateOrNull(termsAndConditions));
        if (logoFile !== undefined) {
            updateData.logoFile = logoFile && logoFile.trim() !== '' ? logoFile.trim() : null;
            console.log('📝 [Invoice Preferences] Updating logoFile:', updateData.logoFile ? `${updateData.logoFile.substring(0, 50)}...` : 'null');
        }
        else {
            updateData.logoFile = existingPrefs.logoFile;
            console.log('📝 [Invoice Preferences] Preserving existing logoFile:', existingPrefs.logoFile ? `${existingPrefs.logoFile.substring(0, 50)}...` : 'null');
        }
        if (signatureFile !== undefined) {
            updateData.signatureFile = signatureFile && signatureFile.trim() !== '' ? signatureFile.trim() : null;
            console.log('📝 [Invoice Preferences] Updating signatureFile:', updateData.signatureFile ? `${updateData.signatureFile.substring(0, 50)}...` : 'null');
        }
        else {
            updateData.signatureFile = existingPrefs.signatureFile;
            console.log('📝 [Invoice Preferences] Preserving existing signatureFile:', existingPrefs.signatureFile ? `${existingPrefs.signatureFile.substring(0, 50)}...` : 'null');
        }
        const updated = await client_1.db
            .update(invoicePreferences_1.invoicePreferences)
            .set(updateData)
            .where((0, drizzle_orm_1.eq)(invoicePreferences_1.invoicePreferences.userId, userId))
            .returning();
        console.log('✅ [Invoice Preferences] Successfully updated preferences');
        return updated[0];
    }
    else {
        // Insert - use defaults for includeLogo/includeSignature if not provided
        const inserted = await client_1.db
            .insert(invoicePreferences_1.invoicePreferences)
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
            termsAndConditions: termsAndConditions && termsAndConditions.trim() !== '' ? termsAndConditions.trim() : null,
        })
            .returning();
        console.log('✅ [Invoice Preferences] Successfully created new preferences');
        return inserted[0];
    }
}
async function getInvoicePreferences(userId) {
    const result = await client_1.db
        .select()
        .from(invoicePreferences_1.invoicePreferences)
        .where((0, drizzle_orm_1.eq)(invoicePreferences_1.invoicePreferences.userId, userId));
    return result[0] || null;
}
async function getAdminInvoicePreferences() {
    const [adminUser] = await client_1.db.select().from(users_1.users).where((0, drizzle_orm_1.eq)(users_1.users.role, 'admin')).limit(1);
    if (!adminUser) {
        return null;
    }
    return getInvoicePreferences(adminUser.id);
}

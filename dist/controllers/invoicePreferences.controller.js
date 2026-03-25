"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.saveOrUpdateInvoicePreferences = saveOrUpdateInvoicePreferences;
exports.fetchInvoicePreferences = fetchInvoicePreferences;
const invoicePreferences_service_1 = require("../models/services/invoicePreferences.service");
// Single endpoint for create/update
async function saveOrUpdateInvoicePreferences(req, res) {
    try {
        const userId = req.user.sub; // assumes auth middleware sets req.user
        const data = req.body;
        // Log the incoming data for debugging
        console.log('📝 [Invoice Preferences] Saving preferences for user:', userId);
        console.log('📝 [Invoice Preferences] Received data:', {
            prefix: data.prefix,
            suffix: data.suffix,
            template: data.template,
            logoFile: data.logoFile ? `${data.logoFile.substring(0, 50)}...` : 'null/undefined',
            signatureFile: data.signatureFile
                ? `${data.signatureFile.substring(0, 50)}...`
                : 'null/undefined',
        });
        const preferences = await (0, invoicePreferences_service_1.upsertInvoicePreferences)(userId, data);
        console.log('✅ [Invoice Preferences] Successfully saved preferences:', {
            id: preferences.id,
            logoFile: preferences.logoFile ? `${preferences.logoFile.substring(0, 50)}...` : 'null',
            signatureFile: preferences.signatureFile
                ? `${preferences.signatureFile.substring(0, 50)}...`
                : 'null',
        });
        return res.json({ success: true, preferences });
    }
    catch (err) {
        console.error('❌ [Invoice Preferences] Error saving invoice preferences:', err);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}
async function fetchInvoicePreferences(req, res) {
    try {
        const userId = req.user.sub;
        const preferences = await (0, invoicePreferences_service_1.getInvoicePreferences)(userId);
        return res.json({ success: true, preferences });
    }
    catch (err) {
        console.error('Error fetching invoice preferences:', err);
        return res.status(500).json({ success: false, error: 'Internal server error' });
    }
}

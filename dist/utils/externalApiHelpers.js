"use strict";
/**
 * External API Helper Functions
 * These utilities are used across external API controllers
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.getIntegrationTypeFromProviderCode = exports.getOpaqueProviderCode = void 0;
// Map integration types to opaque codes that don't reveal the provider
const PROVIDER_CODE_MAP = {
    delhivery: 'XC7K9',
};
// Reverse map: provider code -> integration type
const PROVIDER_CODE_REVERSE_MAP = {
    XC7K9: 'delhivery',
};
/**
 * Generate an opaque provider code from integration_type
 * This hides the actual service provider from external API users
 * The code is opaque and cannot be reverse-engineered to determine the provider
 */
const getOpaqueProviderCode = (integrationType) => {
    const normalizedType = integrationType?.toLowerCase().trim() || 'delhivery';
    return PROVIDER_CODE_MAP[normalizedType] || 'XC7K9';
};
exports.getOpaqueProviderCode = getOpaqueProviderCode;
/**
 * Convert provider_code back to integration_type (for internal use only)
 * Used when external API users send provider_code in requests
 */
const getIntegrationTypeFromProviderCode = (providerCode) => {
    if (!providerCode)
        return null;
    const normalizedCode = providerCode.trim().toUpperCase();
    const integrationType = PROVIDER_CODE_REVERSE_MAP[normalizedCode];
    if (integrationType) {
        return integrationType;
    }
    return null;
};
exports.getIntegrationTypeFromProviderCode = getIntegrationTypeFromProviderCode;

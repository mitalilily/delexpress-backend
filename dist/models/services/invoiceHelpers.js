"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadInvoiceAssets = exports.formatPickupAddress = exports.formatPickupAddressLines = exports.normalizePickupDetails = void 0;
const axios_1 = __importDefault(require("axios"));
const upload_service_1 = require("./upload.service");
const normalizePickupDetails = (raw) => {
    if (!raw)
        return null;
    if (typeof raw === 'string') {
        try {
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object') {
                return parsed;
            }
            return null;
        }
        catch {
            return null;
        }
    }
    if (typeof raw === 'object') {
        return raw;
    }
    return null;
};
exports.normalizePickupDetails = normalizePickupDetails;
const formatPickupAddressLines = (details) => {
    if (!details)
        return [];
    const lines = [];
    if (details.address)
        lines.push(details.address.trim());
    const cityState = [details.city, details.state].filter(Boolean).join(', ');
    if (cityState)
        lines.push(cityState);
    if (details.pincode)
        lines.push(details.pincode);
    return lines;
};
exports.formatPickupAddressLines = formatPickupAddressLines;
const formatPickupAddress = (details) => {
    return (0, exports.formatPickupAddressLines)(details).join('\n');
};
exports.formatPickupAddress = formatPickupAddress;
const IMAGE_DOWNLOAD_TIMEOUT = 20000;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const downloadBuffer = async (key, context) => {
    try {
        const logoUrl = await (0, upload_service_1.presignDownload)(key);
        const finalUrl = Array.isArray(logoUrl) ? logoUrl[0] : logoUrl;
        if (!finalUrl)
            return undefined;
        const response = await axios_1.default.get(finalUrl, {
            responseType: 'arraybuffer',
            timeout: IMAGE_DOWNLOAD_TIMEOUT,
            maxContentLength: MAX_IMAGE_BYTES,
            maxBodyLength: MAX_IMAGE_BYTES,
        });
        const buffer = Buffer.from(response.data);
        if (buffer.length === 0) {
            console.warn(`⚠️ [Invoice Assets] ${context} image buffer was empty (${finalUrl})`);
            return undefined;
        }
        return buffer;
    }
    catch (err) {
        console.warn(`⚠️ [Invoice Assets] Failed to download ${context} image:`, err?.message || err);
        return undefined;
    }
};
const loadInvoiceAssets = async (options, contextLabel) => {
    const { companyLogoKey, includeSignature, signatureFile } = options;
    const logoBuffer = companyLogoKey
        ? await downloadBuffer(companyLogoKey, `${contextLabel} logo`)
        : undefined;
    let signatureBuffer;
    if (includeSignature && signatureFile) {
        signatureBuffer = await downloadBuffer(signatureFile, `${contextLabel} signature`);
    }
    return { logoBuffer, signatureBuffer };
};
exports.loadInvoiceAssets = loadInvoiceAssets;

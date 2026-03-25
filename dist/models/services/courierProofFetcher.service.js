"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchWeightProofFromCourier = fetchWeightProofFromCourier;
exports.fetchWeightProofWithRetry = fetchWeightProofWithRetry;
exports.extractWeightProofFromWebhook = extractWeightProofFromWebhook;
const axios_1 = __importDefault(require("axios"));
const delhiveryCredentials_service_1 = require("./delhiveryCredentials.service");
/**
 * Fetch weight proof from courier partner (when available)
 *
 * IMPORTANT: Most courier APIs don't provide dedicated weight proof endpoints.
 * This function attempts to extract proof URLs from tracking/shipment data where available.
 * For most couriers, proof must be extracted from webhook payloads or manually uploaded.
 */
async function fetchWeightProofFromCourier(courierPartner, awbNumber) {
    try {
        if (courierPartner?.toLowerCase() === 'delhivery') {
            return await fetchDelhiveryProof(awbNumber);
        }
        console.log(`No proof fetcher implemented for courier: ${courierPartner}`);
        return null;
    }
    catch (error) {
        console.error(`Error fetching proof from ${courierPartner}:`, error);
        return null;
    }
}
/**
 * Fetch proof from Delhivery API (if POD images available)
 * Note: Delhivery doesn't provide a dedicated weight proof API
 */
async function fetchDelhiveryProof(awb) {
    try {
        const credentials = await (0, delhiveryCredentials_service_1.getDelhiveryCredentials)();
        const apiKey = credentials.apiKey;
        const apiUrl = credentials.apiBase;
        if (!apiKey) {
            console.warn('Delhivery API key not configured in courier_credentials table');
            return null;
        }
        // Get tracking data from Delhivery
        const response = await axios_1.default.get(`${apiUrl}/api/v1/packages/json/`, {
            params: {
                waybill: awb,
                verbose: 3,
            },
            headers: {
                Authorization: `Token ${apiKey}`,
                'Content-Type': 'application/json',
            },
            timeout: 10000,
        });
        if (!response.data || !response.data.ShipmentData) {
            console.log('Delhivery tracking data not available for AWB:', awb);
            return null;
        }
        const proofImages = [];
        const shipmentData = response.data.ShipmentData[0];
        // Delhivery provides POD images in ShipmentData
        if (shipmentData?.PODDocument) {
            proofImages.push(shipmentData.PODDocument);
        }
        // Check scans for any document URLs
        if (Array.isArray(shipmentData?.Scans)) {
            shipmentData.Scans.forEach((scan) => {
                if (scan.ScanDetail?.document_url) {
                    proofImages.push(scan.ScanDetail.document_url);
                }
            });
        }
        if (proofImages.length === 0) {
            console.log('No proof images found in Delhivery tracking data');
            return null;
        }
        return {
            proofImages,
            metadata: {
                timestamp: shipmentData?.ScanDetail?.ScanDateTime,
                location: shipmentData?.ScanDetail?.ScannedLocation,
                source: 'delhivery_tracking',
            },
        };
    }
    catch (error) {
        console.error('Delhivery proof fetch error:', error.message);
        return null;
    }
}
/**
 * Fetch proof with retry logic (best effort)
 */
async function fetchWeightProofWithRetry(courierPartner, awbNumber, maxRetries = 2) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const proof = await fetchWeightProofFromCourier(courierPartner, awbNumber);
            if (proof && proof.proofImages.length > 0) {
                return proof;
            }
            // If no proof found on first attempt, wait before retry
            if (attempt < maxRetries) {
                await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
            }
        }
        catch (error) {
            console.error(`Attempt ${attempt} failed:`, error);
            if (attempt === maxRetries) {
                return null;
            }
        }
    }
    return null;
}
/**
 * Extract weight proof URL from webhook payload
 * Most courier webhooks directly provide weight slip URLs
 * This is the PRIMARY method for getting weight proofs
 */
function extractWeightProofFromWebhook(payload, courierPartner) {
    const result = {};
    try {
        switch (courierPartner?.toLowerCase()) {
            case 'delhivery':
                // Extract from Delhivery webhook payload
                if (payload.Shipment?.PODDocument) {
                    result.weightSlipUrl = payload.Shipment.PODDocument;
                }
                if (payload.Shipment?.ScanDetail) {
                    result.metadata = {
                        scannedAt: payload.Shipment.ScanDetail.ScanDateTime,
                        location: payload.Shipment.ScanDetail.ScannedLocation,
                    };
                    if (payload.Shipment.ScanDetail.document_url) {
                        result.weightSlipUrl = payload.Shipment.ScanDetail.document_url;
                    }
                }
                // Check Scans array
                if (payload.Shipment?.Scans && Array.isArray(payload.Shipment.Scans)) {
                    const docUrls = payload.Shipment.Scans.map((s) => s.ScanDetail?.document_url).filter((url) => url);
                    if (docUrls.length > 0) {
                        result.weightImages = docUrls;
                    }
                }
                break;
        }
    }
    catch (error) {
        console.error('Error extracting weight proof from webhook:', error);
    }
    return result;
}

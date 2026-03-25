"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getKycDetails = exports.storeKycDetails = exports.extractTextFromImage = void 0;
const kyc_service_1 = require("../models/services/kyc.service");
const ocr_service_1 = require("../models/services/ocr.service");
const upload_service_1 = require("../models/services/upload.service");
const extractTextFromImage = async (req, res) => {
    try {
        const { fileUrl, type } = req.body;
        if (!fileUrl) {
            return res.status(400).json({ error: "fileUrl is required" });
        }
        const signedUrl = await (0, upload_service_1.presignDownload)(fileUrl);
        const response = await fetch(signedUrl);
        if (!response?.ok) {
            throw new Error("Failed to download file from R2");
        }
        const buffer = Buffer.from(await response?.arrayBuffer());
        const text = await (0, ocr_service_1.extractText)(buffer);
        let parsedText = {};
        if (type === "aadhar")
            parsedText = { ...(0, ocr_service_1.parseAadhaarDetails)(text) };
        if (type === "bankCheque")
            parsedText = { accNo: (0, ocr_service_1.parseAccountNo)(text), ifsc: (0, ocr_service_1.parseIFSC)(text) };
        return res.json({ text: type ? parsedText : text });
    }
    catch (err) {
        console.error("OCR error:", err);
        return res
            .status(500)
            .json({ error: err.message || "Failed to extract text" });
    }
};
exports.extractTextFromImage = extractTextFromImage;
const storeKycDetails = async (req, res) => {
    const userId = req.user.sub;
    try {
        const form = req.body;
        const added = await (0, kyc_service_1.UpdateKYCDetails)(userId, form);
        return res.json({
            message: "KYC details saved successfully",
            kyc: added,
        });
    }
    catch (err) {
        console.error("KYC submission error:", err);
        return res.status(400).json({ message: err.message, kyc: {} });
    }
};
exports.storeKycDetails = storeKycDetails;
const getKycDetails = async (req, res) => {
    const userId = req.user.sub;
    try {
        const added = await (0, kyc_service_1.getUserKycService)(userId);
        return res.json({
            message: "KYC details fetched successfully",
            kyc: added,
        });
    }
    catch (err) {
        console.error("KYC Fetch error:", err);
        if (err?.statusCode === 200) {
            return res.status(200).json({ message: "No KYC details found", kyc: {} });
        }
        return res.status(400).json({ message: err.message, kyc: {} });
    }
};
exports.getKycDetails = getKycDetails;

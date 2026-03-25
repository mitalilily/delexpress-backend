"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.presignDownload = exports.downloadAndUploadToR2 = exports.presignUpload = void 0;
const client_s3_1 = require("@aws-sdk/client-s3");
const s3_request_presigner_1 = require("@aws-sdk/s3-request-presigner");
const axios_1 = __importDefault(require("axios"));
const r2Client_1 = require("../../config/r2Client");
const functions_1 = require("../../utils/functions");
const dotenv = __importStar(require("dotenv"));
const path_1 = __importDefault(require("path"));
// Load correct .env based on NODE_ENV
const env = process.env.NODE_ENV || 'development';
dotenv.config({ path: path_1.default.resolve(__dirname, `../../.env.${env}`) });
const PRESIGN_DOWNLOAD_EXPIRES_IN_SECONDS = 60 * 60 * 24; // 24h
const PRESIGN_CACHE_SAFETY_BUFFER_MS = 60 * 1000; // refresh 1 min before expiry
const presignDownloadCache = new Map();
const presignCacheKey = (bucket, key, options) => JSON.stringify({
    bucket,
    key,
    disposition: options?.disposition || null,
    downloadName: options?.downloadName || null,
    contentType: options?.contentType || null,
});
const presignUpload = async ({ filename, contentType, userId, folderKey = 'userPp', }) => {
    const bucket = (0, functions_1.getBucketName)();
    const key = `${folderKey}/${userId}/${Date.now()}-${filename}`;
    const command = new client_s3_1.PutObjectCommand({
        Bucket: bucket,
        Key: key,
        ContentType: contentType,
    });
    const uploadUrl = await (0, s3_request_presigner_1.getSignedUrl)(r2Client_1.r2, command, { expiresIn: 60 * 5 }); // 5 min
    const publicUrl = `${process.env.R2_ENDPOINT}/${bucket}/${key}`;
    return { uploadUrl, key, publicUrl, bucket };
};
exports.presignUpload = presignUpload;
/**
 * Download a file from a URL and upload it to R2, returning only the S3 key
 * This ensures we store keys only, not external URLs
 */
const downloadAndUploadToR2 = async ({ url, userId, filename, folderKey = 'labels', contentType = 'application/pdf', }) => {
    try {
        const bucket = (0, functions_1.getBucketName)();
        // Check if the input is a valid URL (starts with http:// or https://)
        const isValidUrl = /^https?:\/\//i.test(url);
        if (!isValidUrl) {
            // If it's not a URL, treat it as an R2 key
            // Check if it looks like an R2 key (contains slashes, doesn't start with http)
            console.log(`ℹ️ Input is not a URL, treating as R2 key: ${url}`);
            // If it's already a key (contains folder structure), return it as-is
            if (url.includes('/')) {
                console.log(`✅ Using existing R2 key: ${url}`);
                return url;
            }
            // If it's just a filename, construct a proper key path
            // This handles cases where Delhivery returns just a filename
            const key = `${folderKey}/${userId}/${url}`;
            console.log(`✅ Constructed R2 key from filename: ${key}`);
            return key;
        }
        // If it's already an R2 URL, extract the key instead of re-uploading
        const extractedKey = extractKeyFromUrl(url, bucket);
        if (extractedKey) {
            console.log(`ℹ️ URL is already an R2 URL, using existing key: ${extractedKey}`);
            return extractedKey;
        }
        // Download the file from the URL (external URL)
        console.log(`📥 Downloading file from URL: ${url}`);
        const response = await axios_1.default.get(url, {
            responseType: 'arraybuffer',
            timeout: 30000, // 30 second timeout
        });
        const fileBuffer = Buffer.from(response.data);
        // Upload to R2
        console.log(`📤 Uploading downloaded file to R2: ${filename}`);
        const { uploadUrl, key } = await (0, exports.presignUpload)({
            filename,
            contentType,
            userId,
            folderKey,
        });
        if (!uploadUrl || !key) {
            console.error('❌ Failed to get presigned upload URL');
            return null;
        }
        await axios_1.default.put(Array.isArray(uploadUrl) ? uploadUrl[0] : uploadUrl, fileBuffer, {
            headers: { 'Content-Type': contentType },
        });
        const finalKey = Array.isArray(key) ? key[0] : key;
        console.log(`✅ File uploaded to R2 successfully: ${finalKey}`);
        return finalKey;
    }
    catch (error) {
        console.error('❌ Failed to download and upload file to R2:', {
            url,
            filename,
            error: error?.message || error,
            stack: error?.stack,
        });
        return null;
    }
};
exports.downloadAndUploadToR2 = downloadAndUploadToR2;
/**
 * Extract S3/R2 key from a full URL
 * Example: https://xxx.r2.cloudflarestorage.com/bucket-name/folder/file.pdf -> folder/file.pdf
 */
const extractKeyFromUrl = (url, bucket) => {
    try {
        // Check if it's an R2 URL that contains our bucket
        if (url.includes(bucket)) {
            const urlObj = new URL(url);
            const pathParts = urlObj.pathname.split('/').filter(Boolean);
            // Find bucket index and return everything after it
            const bucketIndex = pathParts.indexOf(bucket);
            if (bucketIndex !== -1 && bucketIndex < pathParts.length - 1) {
                return pathParts.slice(bucketIndex + 1).join('/');
            }
        }
        // If it's an R2 endpoint URL format, try to extract key
        if (process.env.R2_ENDPOINT && url.startsWith(process.env.R2_ENDPOINT)) {
            const urlObj = new URL(url);
            const pathParts = urlObj.pathname.split('/').filter(Boolean);
            // Skip bucket name (first part) and get the rest as key
            if (pathParts.length > 1) {
                return pathParts.slice(1).join('/');
            }
        }
        return null;
    }
    catch (error) {
        console.error('Error extracting key from URL:', url, error);
        return null;
    }
};
const presignDownload = async (keyOrKeys, options) => {
    try {
        const bucket = (0, functions_1.getBucketName)();
        const now = Date.now();
        const responseContentDisposition = options?.disposition && options?.downloadName
            ? `${options.disposition}; filename="${options.downloadName}"`
            : undefined;
        const responseContentType = options?.contentType;
        if (typeof keyOrKeys === 'string') {
            const value = keyOrKeys.trim();
            // If empty, return null
            if (!value) {
                console.warn('⚠️ Empty key provided to presignDownload');
                return null;
            }
            // If it's a URL, try to extract the key and re-presign it (URLs expire)
            if (/^https?:\/\//i.test(value)) {
                const extractedKey = extractKeyFromUrl(value, bucket);
                if (extractedKey) {
                    console.log(`🔄 Extracted key from URL: ${extractedKey}, regenerating presigned URL`);
                    const command = new client_s3_1.GetObjectCommand({
                        Bucket: bucket,
                        Key: extractedKey,
                        ResponseContentDisposition: responseContentDisposition,
                        ResponseContentType: responseContentType,
                    });
                    const signedUrl = await (0, s3_request_presigner_1.getSignedUrl)(r2Client_1.r2, command, {
                        expiresIn: 60 * 60 * 24, // 24 hours
                    });
                    console.log(`✅ Presigned URL regenerated successfully for key: ${extractedKey}`);
                    return signedUrl;
                }
                else {
                    // If we can't extract key, it might be an external URL, return as-is but log warning
                    console.warn(`⚠️ Could not extract S3 key from URL, returning as-is: ${value}`);
                    return value;
                }
            }
            // It's already a key, presign it
            const cacheKey = presignCacheKey(bucket, value, options);
            const cached = presignDownloadCache.get(cacheKey);
            if (cached && cached.expiresAt - PRESIGN_CACHE_SAFETY_BUFFER_MS > now) {
                return cached.url;
            }
            console.log(`🔄 Presigning download URL for key: ${value} in bucket: ${bucket}`);
            const command = new client_s3_1.GetObjectCommand({
                Bucket: bucket,
                Key: value,
                ResponseContentDisposition: responseContentDisposition,
                ResponseContentType: responseContentType,
            });
            const signedUrl = await (0, s3_request_presigner_1.getSignedUrl)(r2Client_1.r2, command, {
                expiresIn: PRESIGN_DOWNLOAD_EXPIRES_IN_SECONDS,
            });
            console.log(`✅ Presigned URL generated successfully for key: ${value}`);
            presignDownloadCache.set(cacheKey, {
                url: signedUrl,
                expiresAt: now + PRESIGN_DOWNLOAD_EXPIRES_IN_SECONDS * 1000,
            });
            return signedUrl;
        }
        // Handle array of keys
        const urls = await Promise.all(keyOrKeys.map(async (key) => {
            const value = key?.trim();
            if (!value) {
                console.warn('⚠️ Empty key in array provided to presignDownload');
                return null;
            }
            // If it's a URL, try to extract the key and re-presign it
            if (/^https?:\/\//i.test(value)) {
                const extractedKey = extractKeyFromUrl(value, bucket);
                if (extractedKey) {
                    console.log(`🔄 Extracted key from URL: ${extractedKey}, regenerating presigned URL`);
                    const command = new client_s3_1.GetObjectCommand({
                        Bucket: bucket,
                        Key: extractedKey,
                        ResponseContentDisposition: responseContentDisposition,
                        ResponseContentType: responseContentType,
                    });
                    const signedUrl = await (0, s3_request_presigner_1.getSignedUrl)(r2Client_1.r2, command, {
                        expiresIn: 60 * 60 * 24, // 24 hours
                    });
                    console.log(`✅ Presigned URL regenerated successfully for key: ${extractedKey}`);
                    return signedUrl;
                }
                else {
                    console.warn(`⚠️ Could not extract S3 key from URL, returning as-is: ${value}`);
                    return value;
                }
            }
            // It's already a key, presign it
            const cacheKey = presignCacheKey(bucket, value, options);
            const cached = presignDownloadCache.get(cacheKey);
            if (cached && cached.expiresAt - PRESIGN_CACHE_SAFETY_BUFFER_MS > now) {
                return cached.url;
            }
            console.log(`🔄 Presigning download URL for key: ${value} in bucket: ${bucket}`);
            const command = new client_s3_1.GetObjectCommand({
                Bucket: bucket,
                Key: value,
                ResponseContentDisposition: responseContentDisposition,
                ResponseContentType: responseContentType,
            });
            const signedUrl = await (0, s3_request_presigner_1.getSignedUrl)(r2Client_1.r2, command, {
                expiresIn: PRESIGN_DOWNLOAD_EXPIRES_IN_SECONDS,
            });
            console.log(`✅ Presigned URL generated successfully for key: ${value}`);
            presignDownloadCache.set(cacheKey, {
                url: signedUrl,
                expiresAt: now + PRESIGN_DOWNLOAD_EXPIRES_IN_SECONDS * 1000,
            });
            return signedUrl;
        }));
        // Filter out null values
        return urls.filter((url) => url !== null);
    }
    catch (error) {
        // If it's a NoSuchKey error, log and return null instead of throwing
        if (error?.code === 'NoSuchKey' || error?.message?.includes('NoSuchKey')) {
            console.error('❌ File not found in S3/R2:', {
                keys: keyOrKeys,
                error: error?.message || error,
            });
            return typeof keyOrKeys === 'string' ? null : [];
        }
        console.error('❌ Error generating presigned download URL(s):', {
            error: error?.message || error,
            stack: error?.stack,
            keys: keyOrKeys,
        });
        throw new Error(`Failed to generate presigned URL(s): ${error?.message || 'Unknown error'}`);
    }
};
exports.presignDownload = presignDownload;

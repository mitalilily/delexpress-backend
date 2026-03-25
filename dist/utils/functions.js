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
exports.determineB2CZone = exports.getApproxZoneFromEDD = exports.calculateSLADays = exports.validateShipmentRequest = exports.compare = exports.hash = exports.getBucketName = exports.parsePhone = exports.generate8DigitsVerificationToken = void 0;
exports.deepMerge = deepMerge;
exports.buildPatch = buildPatch;
exports.isImageBlurrySharp = isImageBlurrySharp;
const bcrypt = __importStar(require("bcryptjs"));
const file_type_1 = __importDefault(require("file-type"));
const dotenv_1 = __importDefault(require("dotenv"));
const sharp_1 = __importDefault(require("sharp"));
const path_1 = __importDefault(require("path"));
// Load correct .env based on NODE_ENV
const env = process.env.NODE_ENV || 'development';
dotenv_1.default.config({ path: path_1.default.resolve(__dirname, `../../.env.${env}`) });
const generate8DigitsVerificationToken = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let token = '';
    for (let i = 0; i < 8; i++) {
        token += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return token;
};
exports.generate8DigitsVerificationToken = generate8DigitsVerificationToken;
/** Parse any user input → { prefix, national, e164 }.
 *  Assumes Indian 10‑digit nationals; tweak if you support more. */
const parsePhone = (input) => {
    const digits = input.replace(/\D/g, ''); // strip non‑digits
    let prefix = '91';
    let national = digits;
    if (digits.length > 10) {
        prefix = digits.slice(0, digits.length - 10);
        national = digits.slice(-10);
    }
    else if (digits.length === 10) {
        national = digits;
    }
    else {
        throw new Error('Phone number too short');
    }
    return { prefix, national, e164: `+${prefix}${national}` };
};
exports.parsePhone = parsePhone;
function deepMerge(target, patch) {
    const out = { ...target };
    for (const [k, v] of Object.entries(patch)) {
        if (v === undefined)
            continue; // ignore undefined
        if (v &&
            typeof v === 'object' &&
            !Array.isArray(v) &&
            out[k] !== null &&
            typeof out[k] === 'object') {
            out[k] = deepMerge(out[k], v);
        }
        else {
            out[k] = v; // primitives / null / array
        }
    }
    return out;
}
function buildPatch(existing, merged) {
    const patch = {};
    for (const k in merged) {
        if (JSON.stringify(merged[k]) !== JSON.stringify(existing[k])) {
            patch[k] = merged[k];
        }
    }
    return patch;
}
const getBucketName = () => {
    switch (process.env.NODE_ENV) {
        case 'production':
            return process.env.PROD_BUCKET;
        case 'staging':
            return process.env.STAGING_BUCKET;
        default:
            return process.env.DEV_BUCKET;
    }
};
exports.getBucketName = getBucketName;
const hash = (plain) => bcrypt.hash(plain, 10);
exports.hash = hash;
const compare = (plain, hashed) => bcrypt.compare(plain, hashed);
exports.compare = compare;
async function isImageBlurrySharp(buffer) {
    const type = await file_type_1.default.fromBuffer(buffer);
    if (!type || !['image/jpeg', 'image/png', 'image/webp'].includes(type.mime)) {
        throw new Error(`Unsupported image format: ${type?.mime ?? 'unknown'}`);
    }
    const image = (0, sharp_1.default)(buffer);
    const { width, height } = await image.metadata();
    const { data } = await image.greyscale().resize(100).raw().toBuffer({ resolveWithObject: true });
    let sum = 0;
    for (let i = 1; i < data.length - 1; i++) {
        const diff = data[i] - data[i - 1];
        sum += diff * diff;
    }
    const variance = sum / data.length;
    return variance < 50;
}
const validateShipmentRequest = (body) => {
    const errors = [];
    if (!body.order_number)
        errors.push('order_number is required');
    if (!['cod', 'prepaid', 'reverse'].includes(body.payment_type))
        errors.push('payment_type is invalid');
    if (!body.order_amount)
        errors.push('order_amount is required');
    const c = body.consignee || {};
    if (!c.name)
        errors.push('consignee[name] is required');
    if (!c.address)
        errors.push('consignee[address] is required');
    if (!c.city)
        errors.push('consignee[city] is required');
    if (!c.state)
        errors.push('consignee[state] is required');
    if (!c.pincode)
        errors.push('consignee[pincode] is required');
    if (!c.phone)
        errors.push('consignee[phone] is required');
    const p = body.pickup || {};
    if (!p.warehouse_name)
        errors.push('pickup[warehouse_name] is required');
    if (!p.name)
        errors.push('pickup[name] is required');
    if (!p.address)
        errors.push('pickup[address] is required');
    if (!p.city)
        errors.push('pickup[city] is required');
    if (!p.state)
        errors.push('pickup[state] is required');
    if (!p.pincode)
        errors.push('pickup[pincode] is required');
    if (!p.phone)
        errors.push('pickup[phone] is required');
    // Optional: validate RTO if is_rto_different = yes
    if (body.is_rto_different === 'yes' && !body.rto)
        errors.push('rto details are required when is_rto_different is yes');
    return errors;
};
exports.validateShipmentRequest = validateShipmentRequest;
const calculateSLADays = (edd) => {
    const [day, month, year] = edd.split('-').map(Number);
    const eddDate = new Date(year, month - 1, day);
    const today = new Date();
    const diffTime = eddDate.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); // convert ms to days
    return diffDays;
};
exports.calculateSLADays = calculateSLADays;
// Derive approximate zone from SLA
const getApproxZoneFromEDD = (edd) => {
    const slaDays = (0, exports.calculateSLADays)(edd);
    if (slaDays <= 2)
        return 'A';
    if (slaDays <= 4)
        return 'B';
    if (slaDays <= 6)
        return 'C';
    return 'D';
};
exports.getApproxZoneFromEDD = getApproxZoneFromEDD;
const determineB2CZone = (origin, destination) => {
    const hasTag = (loc, tag) => loc.tags?.map((t) => t.toLowerCase()).includes(tag.toLowerCase());
    // 1. Special Zone (highest priority)
    if (hasTag(origin, 'special_zones') || hasTag(destination, 'special_zones')) {
        return 'SPECIAL_ZONE';
    }
    // 2. Within City
    if (origin.city?.toLowerCase() === destination.city?.toLowerCase()) {
        return 'WITHIN_CITY';
    }
    // 3. Within State
    if (origin.state?.toLowerCase() === destination.state?.toLowerCase()) {
        return 'WITHIN_STATE';
    }
    // 4. Within Region
    const regions = ['north', 'south', 'east', 'west'];
    for (const r of regions) {
        if (hasTag(origin, r) && hasTag(destination, r)) {
            return 'WITHIN_REGION';
        }
    }
    // 5. Metro to Metro
    if (hasTag(origin, 'metros') &&
        hasTag(destination, 'metros') &&
        origin.city?.toLowerCase() !== destination.city?.toLowerCase()) {
        return 'METRO_TO_METRO';
    }
    // 6. ROI (fallback)
    return 'ROI';
};
exports.determineB2CZone = determineB2CZone;

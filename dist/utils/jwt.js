"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyRefreshToken = exports.verifyAccessToken = exports.signRefreshToken = exports.signAccessToken = void 0;
const crypto_1 = require("crypto");
const dotenv_1 = __importDefault(require("dotenv"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const path_1 = __importDefault(require("path"));
// Load correct .env based on NODE_ENV
const env = process.env.NODE_ENV || 'development';
dotenv_1.default.config({ path: path_1.default.resolve(__dirname, `../../.env.${env}`) });
const ACCESS_SECRET = process.env.ACCESS_TOKEN_SECRET;
const REFRESH_SECRET = process.env.REFRESH_TOKEN_SECRET;
const signAccessToken = (id, role) => jsonwebtoken_1.default.sign({ sub: id, role }, ACCESS_SECRET, { expiresIn: '24h' });
exports.signAccessToken = signAccessToken;
const signRefreshToken = (id, role) => {
    const jti = (0, crypto_1.randomUUID)();
    return {
        token: jsonwebtoken_1.default.sign({ sub: id, role, jti }, REFRESH_SECRET, {
            expiresIn: '7d',
        }),
        jti,
    };
};
exports.signRefreshToken = signRefreshToken;
const verifyAccessToken = (token) => jsonwebtoken_1.default.verify(token, ACCESS_SECRET);
exports.verifyAccessToken = verifyAccessToken;
const verifyRefreshToken = (token) => jsonwebtoken_1.default.verify(token, REFRESH_SECRET);
exports.verifyRefreshToken = verifyRefreshToken;

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DelhiveryManifestError = exports.HttpError = void 0;
class HttpError extends Error {
    constructor(statusCode, message) {
        super(message);
        this.statusCode = statusCode;
        this.name = 'HttpError';
        Error.captureStackTrace(this, this.constructor);
    }
}
exports.HttpError = HttpError;
class DelhiveryManifestError extends HttpError {
    constructor(statusCode, message, details) {
        super(statusCode, message);
        this.details = details;
        this.isManifestError = true;
        this.name = 'DelhiveryManifestError';
    }
}
exports.DelhiveryManifestError = DelhiveryManifestError;

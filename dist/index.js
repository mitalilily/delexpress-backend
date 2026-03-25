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
const dotenv = __importStar(require("dotenv"));
const path_1 = __importDefault(require("path"));
const app_1 = require("./app");
require("./crons");
const client_1 = require("./models/client");
// Determine environment
const env = process.env.NODE_ENV || 'development';
console.log('node env', env);
// Load correct .env file
dotenv.config({ path: path_1.default.resolve(__dirname, `../.env.${env}`) });
// Render provides PORT as a string env var, so coerce it to a real TCP port number.
const PORT = Number(process.env.PORT) || 5002;
// Test database connection before starting server
async function startServer() {
    console.log('🔍 Testing database connection...');
    const dbConnected = await (0, client_1.testDatabaseConnection)();
    if (!dbConnected) {
        console.error('❌ Failed to connect to database. Server will not start.');
        process.exit(1);
    }
    // Set server timeout to 3.5 minutes (210000ms) to allow for slow external API calls
    // Default Node.js server timeout is 2 minutes (120000ms)
    app_1.server.timeout = 210000; // 3.5 minutes
    app_1.server.listen(PORT, '0.0.0.0', () => {
        const url = env === 'production' ? `https://api.DelExpress.in` : `http://localhost:${PORT}`;
        console.log(`🚀 Server running on port ${PORT} in ${env} mode at ${url}`);
    });
}
startServer().catch((err) => {
    console.error('❌ Failed to start server:', err);
    process.exit(1);
});

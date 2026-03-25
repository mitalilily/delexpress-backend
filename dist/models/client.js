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
Object.defineProperty(exports, "__esModule", { value: true });
exports.testDatabaseConnection = exports.db = exports.pool = void 0;
exports.initPool = initPool;
const dotenv = __importStar(require("dotenv"));
const node_postgres_1 = require("drizzle-orm/node-postgres");
const path = __importStar(require("path")); // ✅ use this instead of `import path from 'path'`
const pg_1 = require("pg");
const schema = __importStar(require("../schema/schema"));
// Load environment file based on NODE_ENV
const env = process.env.NODE_ENV || 'development';
console.log('ENVIRONMENT', env);
const envFilePath = path.resolve(__dirname, `../../.env.${env}`);
console.log(`🔍 Loading env file: ${envFilePath}`);
dotenv.config({ path: envFilePath });
if (!process.env.DATABASE_URL) {
    throw new Error('❌ DATABASE_URL is missing');
}
exports.pool = new pg_1.Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: env === 'production' ? { rejectUnauthorized: false } : false,
});
// console.log('DEBUG: pool created?', !!pool, 'pool.constructor.name=', pool?.constructor?.name)
exports.db = (0, node_postgres_1.drizzle)(exports.pool, {
    schema: schema,
});
// ✅ New function you can call explicitly in scripts
function initPool() {
    console.log('ℹ️ initPool called');
    return { pool: exports.pool, db: exports.db };
}
// Surface unexpected pool-level errors
exports.pool.on('error', (err) => {
    console.error('❌ PG Pool error:', {
        message: err?.message,
        stack: err?.stack,
    });
});
/**
 * Test database connection on startup
 * Returns true if connection succeeds, false otherwise
 */
const testDatabaseConnection = async () => {
    try {
        const client = await exports.pool.connect();
        try {
            const result = await client.query('SELECT NOW() as current_time, version() as pg_version');
            const { current_time, pg_version } = result.rows[0];
            console.log('✅ Database connection succeeded');
            // Parse PostgreSQL version (format: "PostgreSQL 15.3 on x86_64...")
            const versionMatch = pg_version.match(/PostgreSQL\s+([\d.]+)/);
            const version = versionMatch ? versionMatch[1] : 'unknown';
            console.log(`   PostgreSQL version: ${version}`);
            console.log(`   Server time: ${current_time}`);
            return true;
        }
        finally {
            client.release();
        }
    }
    catch (err) {
        console.error('❌ Database connection failed:');
        console.error(`   Error: ${err.message}`);
        if (err.code) {
            console.error(`   Code: ${err.code}`);
        }
        if (err.host) {
            console.error(`   Host: ${err.host}`);
        }
        if (err.port) {
            console.error(`   Port: ${err.port}`);
        }
        if (process.env.NODE_ENV === 'development' && err.stack) {
            console.error(`   Stack: ${err.stack}`);
        }
        return false;
    }
};
exports.testDatabaseConnection = testDatabaseConnection;

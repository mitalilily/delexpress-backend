"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.server = exports.app = void 0;
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const express_1 = __importDefault(require("express"));
const http_1 = __importDefault(require("http"));
const path_1 = __importDefault(require("path"));
const socketServer_1 = require("./config/socketServer");
const delhivery_webhook_1 = require("./controllers/webhooks/delhivery.webhook");
const ekart_webhook_1 = require("./controllers/webhooks/ekart.webhook");
const xpressbees_webhook_1 = require("./controllers/webhooks/xpressbees.webhook");
const shopify_controller_1 = require("./controllers/shopify.controller");
const adminCourier_routes_1 = __importDefault(require("./routes/adminRoutes/adminCourier.routes"));
const adminSupport_routes_1 = __importDefault(require("./routes/adminRoutes/adminSupport.routes"));
const adminUser_routes_1 = __importDefault(require("./routes/adminRoutes/adminUser.routes"));
const adminWallet_routes_1 = __importDefault(require("./routes/adminRoutes/adminWallet.routes"));
const b2b_routes_1 = __importDefault(require("./routes/adminRoutes/b2b.routes"));
const billingInvoice_admin_routes_1 = __importDefault(require("./routes/adminRoutes/billingInvoice.admin.routes"));
const billingPreferences_admin_routes_1 = __importDefault(require("./routes/adminRoutes/billingPreferences.admin.routes"));
const codRemittance_admin_routes_1 = __importDefault(require("./routes/adminRoutes/codRemittance.admin.routes"));
const developer_routes_1 = __importDefault(require("./routes/adminRoutes/developer.routes"));
const location_routes_1 = __importDefault(require("./routes/adminRoutes/location.routes"));
const order_routes_1 = __importDefault(require("./routes/adminRoutes/order.routes"));
const paymentOptions_admin_routes_1 = __importDefault(require("./routes/adminRoutes/paymentOptions.admin.routes"));
const plan_routes_1 = __importDefault(require("./routes/adminRoutes/plan.routes"));
const weightReconciliation_admin_routes_1 = __importDefault(require("./routes/adminRoutes/weightReconciliation.admin.routes"));
const zone_routes_1 = __importDefault(require("./routes/adminRoutes/zone.routes"));
const authRoutes_1 = __importDefault(require("./routes/authRoutes"));
const bank_routes_1 = __importDefault(require("./routes/bank.routes"));
const billingInvoice_routes_1 = __importDefault(require("./routes/billingInvoice.routes"));
const billingPreferences_routes_1 = __importDefault(require("./routes/billingPreferences.routes"));
const blogs_routes_1 = __importDefault(require("./routes/blogs.routes"));
const codRemittance_routes_1 = __importDefault(require("./routes/codRemittance.routes"));
const courier_routes_1 = __importDefault(require("./routes/courier.routes"));
const courierPriority_routes_1 = __importDefault(require("./routes/courierPriority.routes"));
const dashboard_routes_1 = __importDefault(require("./routes/dashboard.routes"));
const employee_routes_1 = __importDefault(require("./routes/employee.routes"));
const externalApi_routes_1 = __importDefault(require("./routes/externalApi.routes"));
const globalSearch_routes_1 = __importDefault(require("./routes/globalSearch.routes"));
const integrationRoutes_1 = __importDefault(require("./routes/integrationRoutes"));
const invoice_routes_1 = __importDefault(require("./routes/invoice.routes"));
const invoicePreferences_routes_1 = __importDefault(require("./routes/invoicePreferences.routes"));
const labelPreferences_routes_1 = __importDefault(require("./routes/labelPreferences.routes"));
const ndr_routes_1 = __importDefault(require("./routes/ndr.routes"));
const notifications_routes_1 = __importDefault(require("./routes/notifications.routes"));
const order_routes_2 = __importDefault(require("./routes/order.routes"));
const paymentOptions_routes_1 = __importDefault(require("./routes/paymentOptions.routes"));
const pickup_routes_1 = __importDefault(require("./routes/pickup.routes"));
const pickupAddresses_route_1 = __importDefault(require("./routes/pickupAddresses.route"));
const returns_routes_1 = __importDefault(require("./routes/returns.routes"));
const rto_routes_1 = __importDefault(require("./routes/rto.routes"));
const staticPages_routes_1 = __importDefault(require("./routes/staticPages.routes"));
const support_routes_1 = __importDefault(require("./routes/support.routes"));
const upload_route_1 = __importDefault(require("./routes/upload.route"));
const userProfileRoutes_1 = __importDefault(require("./routes/userProfileRoutes"));
const reports_routes_1 = __importDefault(require("./routes/reports.routes"));
const userRoutes_1 = __importDefault(require("./routes/userRoutes"));
const walletRoutes_1 = __importDefault(require("./routes/walletRoutes"));
const weightReconciliation_routes_1 = __importDefault(require("./routes/weightReconciliation.routes"));
// Routes imports
// import other routes here...
// Determine environment
const env = process.env.NODE_ENV || 'development';
// Load correct .env file
dotenv_1.default.config({ path: path_1.default.resolve(__dirname, `../.env.${env}`) });
const app = (0, express_1.default)();
exports.app = app;
const server = http_1.default.createServer(app); // ✅ HTTP server for socket.io
exports.server = server;
// Init socket.io server
(0, socketServer_1.initSocketServer)(server);
app.use((0, cookie_parser_1.default)());
const localOrigins = [
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:5176',
    'http://127.0.0.1:5173',
    'http://127.0.0.1:5174',
    'http://127.0.0.1:5176',
    'http://localhost:3000',
    'http://localhost:3001',
    'http://127.0.0.1:3000',
    'http://127.0.0.1:3001',
    'http://localhost:4173',
    'http://127.0.0.1:4173',
    'https://admin.meracourierwala.com',
    'https://app.meracourierwala.com',
];
const envOrigins = (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
const allowedOrigins = [...new Set([...localOrigins, ...envOrigins])];
const corsOptions = {
    origin: (origin, callback) => {
        const isPlatformPreview = typeof origin === 'string' &&
            (origin.endsWith('.netlify.app') ||
                origin.endsWith('.netlify.live') ||
                origin.endsWith('.onrender.com') ||
                origin.endsWith('.vercel.app'));
        if (!origin || allowedOrigins.includes(origin) || isPlatformPreview) {
            callback(null, true);
            return;
        }
        callback(new Error(`Not allowed by CORS: ${origin}`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-refresh-token'],
    optionsSuccessStatus: 204,
};
app.use((0, cors_1.default)(corsOptions));
app.options(/.*/, (0, cors_1.default)(corsOptions));
app.get('/', (_req, res) => {
    res.status(200).json({
        ok: true,
        service: 'DelExpress backend',
    });
});
app.get('/health', (_req, res) => {
    res.status(200).json({
        ok: true,
        service: 'DelExpress backend',
    });
});
// Shopify webhooks require raw body for HMAC verification
app.post('/api/webhook/shopify/orders', express_1.default.raw({ type: 'application/json' }), shopify_controller_1.shopifyOrderWebhookController);
app.use(express_1.default.json());
app.use(express_1.default.urlencoded({ extended: true }));
app.use('/api/user', userRoutes_1.default);
app.use('/api/profile', userProfileRoutes_1.default);
app.use('/api/auth', authRoutes_1.default);
app.use('/api/integrations', integrationRoutes_1.default);
app.use('/api/payments', walletRoutes_1.default);
app.use('/api/uploads', upload_route_1.default);
app.use('/api/bank-account', bank_routes_1.default);
app.use('/api/pickup-addresses', pickupAddresses_route_1.default);
app.use('/api', pickup_routes_1.default);
app.use('/api', returns_routes_1.default);
app.use('/api/couriers', courier_routes_1.default);
app.use('/api/courier', courierPriority_routes_1.default);
app.use('/api/support', support_routes_1.default);
app.use('/api/admin', adminSupport_routes_1.default);
app.use('/api/admin/users', adminUser_routes_1.default);
app.use('/api/admin/orders', order_routes_1.default);
app.use('/api/admin/developer', developer_routes_1.default);
app.use('/api/admin/couriers', adminCourier_routes_1.default);
app.use('/api/admin/zones', zone_routes_1.default);
app.use('/api/admin/b2b', b2b_routes_1.default);
app.use('/api/notifications', notifications_routes_1.default);
app.use('/api/orders', order_routes_2.default);
app.use('/api', invoicePreferences_routes_1.default);
app.use('/api', invoice_routes_1.default);
app.use('/api', billingInvoice_routes_1.default);
app.use('/api', billingInvoice_admin_routes_1.default);
app.use('/api/blogs', blogs_routes_1.default);
app.use('/api/static-pages', staticPages_routes_1.default);
app.use('/api/dashboard', dashboard_routes_1.default);
app.use('/api/reports', reports_routes_1.default);
app.use('/api/search', globalSearch_routes_1.default);
app.use('/api/serviceability', location_routes_1.default);
app.use('/api/user-management', employee_routes_1.default);
app.use('/api/label-preference', labelPreferences_routes_1.default);
app.use('/api/plans', plan_routes_1.default);
app.use('/api/billing-preferences', billingPreferences_routes_1.default);
app.use('/api/cod-remittance', codRemittance_routes_1.default);
app.use('/api/admin/cod-remittance', codRemittance_admin_routes_1.default);
app.use('/api/admin/weight-reconciliation', weightReconciliation_admin_routes_1.default);
app.use('/api/admin/wallets', adminWallet_routes_1.default);
app.use('/api/admin/payment-options', paymentOptions_admin_routes_1.default);
app.use('/api/admin/billing-preferences', billingPreferences_admin_routes_1.default);
app.use('/api/payment-options', paymentOptions_routes_1.default);
app.use('/api/weight-reconciliation', weightReconciliation_routes_1.default);
app.use('/api', ndr_routes_1.default);
app.use('/api', rto_routes_1.default);
app.use('/api/v1', externalApi_routes_1.default);
// Ekart webhook
app.post('/api/webhook/ekart', express_1.default.json(), ekart_webhook_1.ekartWebhookHandler);
app.post('/api/webhook/ekart/track', express_1.default.json(), ekart_webhook_1.ekartWebhookHandler);
app.post('/api/webhook/xpressbees', express_1.default.json({
    verify: (req, _res, buf) => {
        req.rawBody = buf.toString('utf8');
    },
}), xpressbees_webhook_1.xpressbeesWebhookHandler);
app.post('/api/webhook/xpressbees/track', express_1.default.json({
    verify: (req, _res, buf) => {
        req.rawBody = buf.toString('utf8');
    },
}), xpressbees_webhook_1.xpressbeesWebhookHandler);
// Delhivery webhooks - separate endpoints for Scan Push and Document Push
app.post('/api/webhook/delhivery/scan', express_1.default.json(), delhivery_webhook_1.delhiveryScanPushHandler); // Scan Push (Status Updates)
app.post('/api/webhook/delhivery/document', express_1.default.json(), delhivery_webhook_1.delhiveryDocumentPushHandler); // Document Push (POD, Sorter Image, QC Image)
// Legacy unified endpoint (auto-detects type) - kept for backward compatibility
app.post('/api/webhook/delhivery/order', express_1.default.json(), delhivery_webhook_1.delhiveryWebhookHandler);

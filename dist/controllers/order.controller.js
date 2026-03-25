"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.trackOrderController = exports.retryFailedManifestController = exports.generateManifestController = exports.getB2BOrdersController = exports.getB2COrdersController = exports.getAllOrdersController = exports.checkOrderNumberAvailabilityController = exports.createB2BShipmentController = exports.createB2CShipmentController = void 0;
const shiprocket_service_1 = require("../models/services/shiprocket.service");
const createB2CShipmentController = async (req, res) => {
    try {
        const id = req.user?.sub;
        // Local order creation (via dashboard), so is_external_api = false
        // Set a longer timeout for B2C order creation (3 minutes)
        // External courier API calls (Delhivery) can take time
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Order creation timed out after 3 minutes')), 180000);
        });
        const shipmentPromise = (0, shiprocket_service_1.createB2CShipmentService)(req.body, id, false);
        const shipment = (await Promise.race([shipmentPromise, timeoutPromise]));
        res.status(200).json({ success: true, shipment });
    }
    catch (error) {
        console.error('Error creating B2C shipment:', {
            message: error?.message || 'Unknown error',
            statusCode: error?.statusCode ?? error?.response?.status ?? 500,
            code: error?.code ?? null,
            stack: error?.stack || null,
            response: error?.response?.data || null,
            request: {
                order_number: req.body?.order_number,
                integration_type: req.body?.integration_type,
                payment_type: req.body?.payment_type,
                courier_id: req.body?.courier_id ?? null,
            },
        });
        const statusCode = typeof error?.statusCode === 'number' ? error.statusCode : 500;
        const errorMessage = error.message?.includes('timeout') || error.code === 'ECONNABORTED'
            ? 'Order creation is taking longer than expected. Please try again or contact support if the issue persists.'
            : error.message || 'Failed to create order. Please try again.';
        res.status(statusCode).json({ success: false, message: errorMessage });
    }
};
exports.createB2CShipmentController = createB2CShipmentController;
const createB2BShipmentController = async (req, res) => {
    try {
        const userId = req.user?.sub; // Assuming you have auth middleware
        if (!userId)
            return res.status(401).json({ message: 'Unauthorized' });
        const params = req.body;
        // Basic validation (you can enhance this with Zod/Yup)
        if (!params.order_number || !params.consignee || !params?.order_items?.length) {
            return res.status(400).json({ message: 'Invalid shipment payload' });
        }
        // Call service to create shipment (local order creation, so is_external_api = false)
        const shipmentData = await (0, shiprocket_service_1.createB2BShipmentService)(params, userId, false);
        return res.status(200).json({
            message: 'B2B shipment created successfully',
            shipment: shipmentData,
        });
    }
    catch (err) {
        console.error('B2B Shipment Controller Error:', err);
        const statusCode = typeof err?.statusCode === 'number' ? err.statusCode : 500;
        return res.status(statusCode).json({ message: err.message || 'Internal server error' });
    }
};
exports.createB2BShipmentController = createB2BShipmentController;
const checkOrderNumberAvailabilityController = async (req, res) => {
    try {
        const userId = req.user?.sub;
        if (!userId) {
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        }
        const orderNumber = req.query.orderNumber;
        const result = await (0, shiprocket_service_1.checkMerchantOrderNumberAvailability)(userId, orderNumber);
        return res.status(200).json({
            success: true,
            data: {
                orderNumber: result.normalizedOrderNumber,
                available: result.available,
                message: result.available
                    ? 'Order ID is available.'
                    : `Order ID "${result.normalizedOrderNumber}" already exists for this merchant.`,
            },
        });
    }
    catch (error) {
        const statusCode = typeof error?.statusCode === 'number' ? error.statusCode : 500;
        return res.status(statusCode).json({
            success: false,
            message: error?.message || 'Failed to check order ID availability.',
        });
    }
};
exports.checkOrderNumberAvailabilityController = checkOrderNumberAvailabilityController;
const getAllOrdersController = async (req, res) => {
    try {
        const userId = req.user?.sub;
        if (!userId) {
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        }
        // Pagination params
        const page = parseInt(req.query.page, 10) || 1;
        const limit = parseInt(req.query.limit, 10) || 10;
        // Filters from query
        const filters = {
            status: req.query.status,
            fromDate: req.query.fromDate,
            toDate: req.query.toDate,
            search: req.query.search,
        };
        const { orders, totalCount, totalPages } = await (0, shiprocket_service_1.getAllOrdersService)(userId, {
            page,
            limit,
            filters,
        });
        res.status(200).json({ success: true, orders, totalCount, totalPages });
    }
    catch (error) {
        console.error('Error fetching all orders:', error.message);
        res.status(500).json({ success: false, message: error.message });
    }
};
exports.getAllOrdersController = getAllOrdersController;
const getB2COrdersController = async (req, res) => {
    try {
        const userId = req.user?.sub;
        if (!userId) {
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        }
        // Pagination params
        const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
        const limit = Math.min(parseInt(req.query.limit, 10) || 10, 100);
        const rawStatus = req.query.status || undefined;
        const normalizedStatus = rawStatus
            ? rawStatus
                .trim()
                .toLowerCase()
                .replace(/[\s-]+/g, '_')
            : undefined;
        // Filters from query
        const filters = {
            status: normalizedStatus || undefined,
            type: req.query.type,
            courier: req.query.courier,
            warehouse: req.query.warehouse,
            fromDate: req.query.fromDate,
            toDate: req.query.toDate,
            search: req.query.search,
            sortBy: req.query.sortBy || 'created_at',
            sortOrder: req.query.sortOrder || 'desc',
        };
        const { orders, totalCount, totalPages } = await (0, shiprocket_service_1.getB2COrdersByUserService)(userId, page, limit, filters);
        return res.status(200).json({
            success: true,
            orders,
            totalCount,
            totalPages,
        });
    }
    catch (error) {
        console.error('❌ Error fetching B2C orders', {
            userId: req?.user?.sub,
            query: req?.query,
            message: error?.message,
            stack: error?.stack,
        });
        // Detect Drizzle/PG query errors
        if (typeof error.message === 'string' && error.message.includes('Failed query')) {
            return res.status(200).json({
                success: true,
                orders: [],
                totalCount: 0,
                totalPages: 0,
            });
        }
        // Fallback generic error
        return res.status(500).json({
            success: false,
            message: 'Something went wrong while fetching orders. Please try again later.',
        });
    }
};
exports.getB2COrdersController = getB2COrdersController;
const getB2BOrdersController = async (req, res) => {
    try {
        const userId = req.user?.sub;
        if (!userId) {
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        }
        // Pagination params
        const page = parseInt(req.query.page, 10) || 1;
        const limit = parseInt(req.query.limit, 10) || 10;
        // Filters from query
        const filters = {
            status: req.query.status,
            fromDate: req.query.fromDate,
            toDate: req.query.toDate,
            search: req.query.search,
            companyName: req.query.companyName, // optional B2B-specific filter
        };
        const { orders, totalCount, totalPages } = await (0, shiprocket_service_1.getB2BOrdersByUserService)(userId, page, limit, filters);
        res.status(200).json({ success: true, orders, totalCount, totalPages });
    }
    catch (error) {
        console.error('❌ Error fetching B2B orders', {
            userId: req?.user?.sub,
            query: req?.query,
            message: error?.message,
            stack: error?.stack,
        });
        res.status(500).json({ success: false, message: error.message });
    }
};
exports.getB2BOrdersController = getB2BOrdersController;
const generateManifestController = async (req, res) => {
    try {
        const userId = req.user?.sub;
        if (!userId) {
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        }
        const { awbs, type = 'b2c' } = req.body;
        if (!awbs || !Array.isArray(awbs) || awbs.length === 0) {
            return res.status(400).json({ success: false, message: 'AWBs are required' });
        }
        if (!['b2c', 'b2b'].includes(type)) {
            return res.status(400).json({ success: false, message: 'Invalid manifest type' });
        }
        // Manifest generation can take a while when couriers process multiple orders.
        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Manifest generation timed out after 10 minutes')), 600000);
        });
        const manifestPromise = (0, shiprocket_service_1.generateManifestService)({
            awbs,
            type,
            userId,
        });
        const { manifest_id, manifest_url, manifest_key, warnings } = (await Promise.race([
            manifestPromise,
            timeoutPromise,
        ]));
        return res.status(200).json({
            success: true,
            message: 'Manifest generated and saved successfully',
            manifest_id,
            manifest_url,
            manifest_key,
            warnings,
        });
    }
    catch (error) {
        console.error('Generate manifest error:', error);
        const statusCode = typeof error?.statusCode === 'number' ? error.statusCode : 500;
        // Don't expose internal error details, provide user-friendly message
        const errorMessage = error.message?.includes('timeout') || error.code === 'ECONNABORTED'
            ? 'Manifest generation is taking longer than expected. Please try again or contact support if the issue persists.'
            : error.message || 'Failed to generate manifest. Please try again.';
        return res.status(statusCode).json({ success: false, message: errorMessage });
    }
};
exports.generateManifestController = generateManifestController;
const retryFailedManifestController = async (req, res) => {
    try {
        const userId = req.user?.sub;
        if (!userId) {
            return res.status(401).json({ success: false, message: 'Unauthorized' });
        }
        const { orderId } = req.params;
        if (!orderId) {
            return res.status(400).json({ success: false, message: 'Order ID is required' });
        }
        const result = await (0, shiprocket_service_1.retryFailedManifestService)(String(orderId), userId);
        return res.status(200).json({
            success: true,
            message: 'Manifest retry completed successfully.',
            ...result,
        });
    }
    catch (error) {
        console.error('Retry failed manifest error:', error);
        const statusCode = typeof error?.statusCode === 'number' ? error.statusCode : 500;
        return res.status(statusCode).json({
            success: false,
            message: error?.message || 'Failed to retry manifest.',
        });
    }
};
exports.retryFailedManifestController = retryFailedManifestController;
// export const getB2BOrdersController = async (req: Request, res: Response) => {
//   try {
//     const orders = await getAllB2BOrdersService()
//     res.status(200).json({ success: true, orders })
//   } catch (error: any) {
//     console.error('Error fetching B2B orders:', error.message)
//     res.status(500).json({ success: false, message: error.message })
//   }
// }
const trackOrderController = async (req, res) => {
    try {
        const { awb, orderNumber, contact } = req.query;
        let awbNumber = awb ? String(awb) : undefined;
        if (!awbNumber && orderNumber && contact) {
            // Determine if contact is email or phone
            const contactStr = String(contact);
            const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactStr);
            const isPhone = /^\d{7,15}$/.test(contactStr);
            if (!isEmail && !isPhone) {
                return res.status(400).json({
                    success: false,
                    message: 'Contact must be a valid email or phone number',
                });
            }
            // Get the order by orderNumber + contact
            const orderData = await (0, shiprocket_service_1.trackByOrderService)({
                orderNumber: String(orderNumber),
                email: isEmail ? contactStr : undefined,
                phone: isPhone ? contactStr : undefined,
            });
            awbNumber = orderData?.awb_number ?? '';
            if (!awbNumber) {
                return res.status(400).json({
                    success: false,
                    message: 'AWB number not found for this order',
                });
            }
        }
        if (awbNumber) {
            // Fetch full tracking info using AWB
            const trackingData = await (0, shiprocket_service_1.trackByAwbService)(awbNumber);
            return res.json({ success: true, data: trackingData });
        }
        return res.status(400).json({
            success: false,
            message: "Provide either 'awb' or ('orderNumber' with 'contact')",
        });
    }
    catch (err) {
        console.error(err);
        return res.status(500).json({ success: false, message: err.message });
    }
};
exports.trackOrderController = trackOrderController;

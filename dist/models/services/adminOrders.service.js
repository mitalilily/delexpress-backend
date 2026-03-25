"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.regenerateOrderDocumentsServiceAdmin = exports.getAllOrdersServiceAdmin = void 0;
const axios_1 = __importDefault(require("axios"));
const drizzle_orm_1 = require("drizzle-orm");
const client_1 = require("../client");
const b2bOrders_1 = require("../schema/b2bOrders");
const b2cOrders_1 = require("../schema/b2cOrders");
const invoicePreferences_1 = require("../schema/invoicePreferences");
const userProfile_1 = require("../schema/userProfile");
const users_1 = require("../schema/users");
const orderSanitizer_1 = require("../../utils/orderSanitizer");
const generateCustomLabelService_1 = require("./generateCustomLabelService");
const dayjs_1 = __importDefault(require("dayjs"));
const invoice_service_1 = require("./invoice.service");
const invoiceHelpers_1 = require("./invoiceHelpers");
const upload_service_1 = require("./upload.service");
const invoiceNumber_service_1 = require("./invoiceNumber.service");
const getAllOrdersServiceAdmin = async ({ page = 1, limit = 10, filters = {}, }) => {
    const offset = (page - 1) * limit;
    // Fetch B2C orders
    const b2cOrdersRaw = await client_1.db.select().from(b2cOrders_1.b2c_orders);
    const b2cOrders = (b2cOrdersRaw ?? []).map((o) => ({ ...o, type: 'b2c' }));
    // Fetch B2B orders
    const b2bOrdersRaw = await client_1.db.select().from(b2bOrders_1.b2b_orders);
    const b2bOrders = (b2bOrdersRaw ?? []).map((o) => ({ ...o, type: 'b2b' }));
    // Combine both
    let combinedOrders = [...b2cOrders, ...b2bOrders];
    // ✅ Append user profiles
    const userIds = combinedOrders
        .map((order) => order.user_id)
        .filter((id) => Boolean(id));
    let userProfilesMap = new Map();
    let usersMap = new Map();
    if (userIds.length > 0) {
        const uniqueUserIds = Array.from(new Set(userIds));
        const profiles = await client_1.db
            .select()
            .from(userProfile_1.userProfiles)
            .where((0, drizzle_orm_1.inArray)(userProfile_1.userProfiles.userId, uniqueUserIds));
        userProfilesMap = new Map(profiles.map((profile) => [profile.userId, profile]));
        const userRows = await client_1.db.select().from(users_1.users).where((0, drizzle_orm_1.inArray)(users_1.users.id, uniqueUserIds));
        usersMap = new Map(userRows.map((u) => [u.id, u]));
    }
    combinedOrders = combinedOrders.map((order) => {
        const userId = order.user_id;
        const profile = userId ? userProfilesMap.get(userId) || null : null;
        const userRecord = userId ? usersMap.get(userId) || null : null;
        const companyName = profile?.companyInfo?.companyName ||
            profile?.companyInfo?.displayName ||
            null;
        return {
            ...order,
            userProfile: profile,
            merchantName: companyName || userRecord?.email || userRecord?.phone || null,
            merchantEmail: userRecord?.email || null,
            merchantPhone: userRecord?.phone || null,
        };
    });
    // ✅ Apply filters
    if (filters.userId) {
        combinedOrders = combinedOrders.filter((o) => o.user_id === filters.userId);
    }
    if (filters.status) {
        combinedOrders = combinedOrders.filter((o) => o.order_status === filters.status);
    }
    if (filters.fromDate) {
        combinedOrders = combinedOrders.filter((o) => o.created_at ? new Date(o.created_at) >= new Date(filters.fromDate) : false);
    }
    if (filters.toDate) {
        combinedOrders = combinedOrders.filter((o) => o.created_at ? new Date(o.created_at) <= new Date(filters.toDate) : false);
    }
    if (filters.search) {
        const keyword = filters.search.toLowerCase();
        combinedOrders = combinedOrders.filter((o) => {
            return (o.order_number?.toLowerCase().includes(keyword) ||
                o.buyer_name?.toLowerCase().includes(keyword) ||
                o.buyer_phone?.includes(keyword) ||
                o.awb_number?.includes(keyword)
            // o.userProfile?.name?.toLowerCase().includes(keyword) || // ✅ search in user profile
            // o.userProfile?.email?.toLowerCase().includes(keyword)
            );
        });
    }
    // ✅ Sort safely
    const sortBy = filters.sortBy || 'created_at';
    const sortOrder = filters.sortOrder === 'asc' ? 'asc' : 'desc';
    combinedOrders.sort((a, b) => {
        if (sortBy !== 'created_at')
            return 0;
        const timeA = a.created_at ? new Date(a.created_at).getTime() : 0;
        const timeB = b.created_at ? new Date(b.created_at).getTime() : 0;
        return sortOrder === 'asc' ? timeA - timeB : timeB - timeA;
    });
    // Counts + pagination
    const totalCount = combinedOrders.length;
    if (totalCount === 0) {
        return {
            orders: [],
            totalCount: 0,
            totalPages: 0,
        };
    }
    const totalPages = Math.ceil(totalCount / limit);
    const paginatedOrders = combinedOrders.slice(offset, offset + limit);
    const enrichedOrders = await (0, orderSanitizer_1.sanitizeOrdersForCustomer)(paginatedOrders);
    return {
        orders: enrichedOrders,
        totalCount,
        totalPages,
    };
};
exports.getAllOrdersServiceAdmin = getAllOrdersServiceAdmin;
const toNumber = (value, fallback = 0) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
};
const normalizeProducts = (rawProducts, fallbackAmount = 0) => {
    let productsData = [];
    if (Array.isArray(rawProducts)) {
        productsData = rawProducts;
    }
    else if (typeof rawProducts === 'string' && rawProducts.trim()) {
        try {
            const parsed = JSON.parse(rawProducts);
            productsData = Array.isArray(parsed) ? parsed : [];
        }
        catch {
            productsData = [];
        }
    }
    const products = productsData.map((p) => ({
        name: p?.name ?? p?.productName ?? p?.box_name ?? 'N/A',
        price: toNumber(p?.price),
        qty: Math.max(1, toNumber(p?.qty ?? p?.quantity, 1)),
        sku: p?.sku ?? p?.skuCode ?? '',
        hsn: p?.hsn ?? p?.hsnCode ?? '',
        discount: Math.max(0, toNumber(p?.discount)),
        tax_rate: Math.max(0, toNumber(p?.tax_rate ?? p?.taxRate)),
    }));
    if (products.length > 0)
        return products;
    return [
        {
            name: 'Product',
            price: toNumber(fallbackAmount),
            qty: 1,
            sku: '',
            hsn: '',
            discount: 0,
            tax_rate: 0,
        },
    ];
};
const regenerateOrderDocumentsServiceAdmin = async ({ orderId, regenerateLabel = true, regenerateInvoice = true, }) => {
    if (!regenerateLabel && !regenerateInvoice) {
        throw new Error('At least one document must be selected for regeneration');
    }
    const [b2cOrder] = await client_1.db.select().from(b2cOrders_1.b2c_orders).where((0, drizzle_orm_1.eq)(b2cOrders_1.b2c_orders.id, orderId)).limit(1);
    const [b2bOrder] = b2cOrder
        ? [undefined]
        : await client_1.db.select().from(b2bOrders_1.b2b_orders).where((0, drizzle_orm_1.eq)(b2bOrders_1.b2b_orders.id, orderId)).limit(1);
    const order = b2cOrder || b2bOrder;
    if (!order)
        throw new Error('Order not found');
    const orderType = b2cOrder ? 'b2c' : 'b2b';
    const userId = order.user_id;
    if (!userId)
        throw new Error('Order user not found');
    let newLabelKey = null;
    let newInvoiceKey = null;
    if (regenerateLabel) {
        const labelKey = await (0, generateCustomLabelService_1.generateLabelForOrder)(order, userId, client_1.db);
        if (!labelKey || typeof labelKey !== 'string') {
            throw new Error('Label regeneration failed');
        }
        newLabelKey = labelKey.trim();
    }
    let generatedInvoiceData = null;
    if (regenerateInvoice) {
        const [prefs] = await client_1.db
            .select()
            .from(invoicePreferences_1.invoicePreferences)
            .where((0, drizzle_orm_1.eq)(invoicePreferences_1.invoicePreferences.userId, userId))
            .limit(1);
        const [profile] = await client_1.db.select().from(userProfile_1.userProfiles).where((0, drizzle_orm_1.eq)(userProfile_1.userProfiles.userId, userId)).limit(1);
        const companyInfo = profile?.companyInfo || {};
        const gstDetails = profile?.gstDetails || {};
        const companyName = companyInfo.companyName || companyInfo.businessName || companyInfo.brandName || '';
        const companyGST = gstDetails.gstNumber || companyInfo.gstNumber || '';
        const invoiceNumber = await (0, invoiceNumber_service_1.resolveInvoiceNumber)({
            userId,
            existingInvoiceNumber: order?.invoice_number,
            prefix: prefs?.prefix ?? undefined,
            suffix: prefs?.suffix ?? undefined,
        });
        const invoiceDateDisplay = (0, dayjs_1.default)().format('DD MMM YYYY');
        const invoiceDateStored = (0, dayjs_1.default)().format('YYYY-MM-DD');
        const pickupDetails = (0, invoiceHelpers_1.normalizePickupDetails)(order.pickup_details);
        const pickupPincode = pickupDetails?.pincode;
        const serviceType = order.service_type || order.integration_type || order.courier_partner || '';
        const pickupAddress = (0, invoiceHelpers_1.formatPickupAddress)(pickupDetails);
        const sellerAddress = pickupAddress || companyInfo.companyAddress || companyInfo.address || '';
        const sellerStateCode = pickupDetails?.state || companyInfo.state || '';
        const sellerName = pickupDetails?.warehouse_name ||
            companyInfo.brandName ||
            companyInfo.companyName ||
            companyInfo.businessName ||
            'Seller';
        const brandName = companyInfo.brandName || companyInfo.companyName || pickupDetails?.warehouse_name || '';
        const gstNumber = companyGST || companyInfo.gstNumber || companyInfo.gst || '';
        const panNumber = companyInfo.panNumber || companyInfo.pan || '';
        const supportPhone = pickupDetails?.phone ||
            companyInfo.companyContactNumber ||
            companyInfo.contactNumber ||
            prefs?.supportPhone ||
            '';
        const supportEmail = companyInfo.contactEmail || companyInfo.companyEmail || prefs?.supportEmail || '';
        const products = normalizeProducts(order.products, toNumber(order.order_amount));
        const { logoBuffer, signatureBuffer } = await (0, invoiceHelpers_1.loadInvoiceAssets)({
            companyLogoKey: companyInfo.companyLogoUrl ?? undefined,
            includeSignature: prefs?.includeSignature,
            signatureFile: prefs?.signatureFile ?? undefined,
        }, order.order_number || String(order.id));
        const invoiceAmount = toNumber(order.order_amount) +
            toNumber(order.shipping_charges) +
            toNumber(order.gift_wrap) +
            toNumber(order.transaction_fee) -
            (toNumber(order.discount) + toNumber(order.prepaid_amount));
        generatedInvoiceData = {
            number: invoiceNumber,
            date: invoiceDateStored,
            amount: invoiceAmount,
        };
        const invoiceBuffer = await (0, invoice_service_1.generateInvoicePDF)({
            invoiceNumber,
            invoiceDate: invoiceDateDisplay,
            invoiceAmount,
            buyerName: order.buyer_name,
            buyerPhone: order.buyer_phone,
            buyerEmail: order.buyer_email ?? '',
            buyerAddress: order.address,
            buyerCity: order.city,
            buyerState: order.state,
            buyerPincode: order.pincode,
            products,
            shippingCharges: toNumber(order.shipping_charges),
            giftWrap: toNumber(order.gift_wrap),
            transactionFee: toNumber(order.transaction_fee),
            discount: toNumber(order.discount),
            prepaidAmount: toNumber(order.prepaid_amount),
            courierName: order.courier_partner ?? '',
            courierId: String(order.courier_id ?? ''),
            logoBuffer,
            orderType: order.order_type || 'prepaid',
            courierCod: order.order_type === 'cod' ? toNumber(order.cod_charges) : 0,
            signatureBuffer,
            companyName: sellerName,
            supportEmail,
            supportPhone,
            companyGST: gstNumber,
            sellerName,
            brandName,
            sellerAddress,
            sellerStateCode,
            gstNumber,
            panNumber,
            invoiceNotes: prefs?.invoiceNotes ?? '',
            termsAndConditions: prefs?.termsAndConditions ?? '',
            orderId: order.order_number,
            awbNumber: order.awb_number ?? '',
            courierPartner: order.courier_partner ?? '',
            serviceType,
            pickupPincode: pickupPincode ?? '',
            deliveryPincode: order.pincode ?? '',
            orderDate: order.order_date ?? '',
            rtoCharges: Number(order.rto_charges ?? 0),
            layout: (prefs?.template ?? 'classic'),
        });
        const { uploadUrl, key } = await (0, upload_service_1.presignUpload)({
            filename: `invoice-${order.id}.pdf`,
            contentType: 'application/pdf',
            userId,
            folderKey: 'invoices',
        });
        const finalUploadUrl = Array.isArray(uploadUrl) ? uploadUrl[0] : uploadUrl;
        await axios_1.default.put(finalUploadUrl, invoiceBuffer, {
            headers: { 'Content-Type': 'application/pdf' },
            validateStatus: (status) => status >= 200 && status < 300,
            timeout: 60000,
        });
        const finalKey = Array.isArray(key) ? key[0] : key;
        if (!finalKey || typeof finalKey !== 'string') {
            throw new Error('Invoice upload key missing');
        }
        newInvoiceKey = finalKey.trim();
    }
    const updates = { updated_at: new Date() };
    if (newLabelKey)
        updates.label = newLabelKey;
    if (newInvoiceKey)
        updates.invoice_link = newInvoiceKey;
    if (newInvoiceKey && generatedInvoiceData) {
        updates.invoice_number = generatedInvoiceData.number;
        updates.invoice_date = generatedInvoiceData.date;
        updates.invoice_amount = generatedInvoiceData.amount;
    }
    if (orderType === 'b2c') {
        await client_1.db.update(b2cOrders_1.b2c_orders).set(updates).where((0, drizzle_orm_1.eq)(b2cOrders_1.b2c_orders.id, orderId));
    }
    else {
        await client_1.db.update(b2bOrders_1.b2b_orders).set(updates).where((0, drizzle_orm_1.eq)(b2bOrders_1.b2b_orders.id, orderId));
    }
    return {
        orderId,
        orderType,
        label: newLabelKey,
        invoice_link: newInvoiceKey,
    };
};
exports.regenerateOrderDocumentsServiceAdmin = regenerateOrderDocumentsServiceAdmin;

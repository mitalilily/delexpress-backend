"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const order_controller_1 = require("../controllers/order.controller");
const requireAuth_1 = require("../middlewares/requireAuth");
const router = (0, express_1.Router)();
// POST /b2c/shipment
router.post('/b2c/create', requireAuth_1.requireAuth, order_controller_1.createB2CShipmentController);
router.post('/b2b/create', requireAuth_1.requireAuth, order_controller_1.createB2BShipmentController);
router.get('/check-order-number', requireAuth_1.requireAuth, order_controller_1.checkOrderNumberAvailabilityController);
router.get('/b2c/list', requireAuth_1.requireAuth, order_controller_1.getB2COrdersController);
router.get('/b2b/list', requireAuth_1.requireAuth, order_controller_1.getB2BOrdersController);
router.post('/b2c/manifest', requireAuth_1.requireAuth, order_controller_1.generateManifestController);
router.post('/b2c/:orderId/retry-manifest', requireAuth_1.requireAuth, order_controller_1.retryFailedManifestController);
router.get('/all', requireAuth_1.requireAuth, order_controller_1.getAllOrdersController);
router.get('/track', order_controller_1.trackOrderController);
exports.default = router;

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const ndr_controller_1 = require("../controllers/ndr.controller");
const ndrActions_controller_1 = require("../controllers/ndrActions.controller");
const ndr_controller_2 = require("../controllers/ndr.controller");
const requireAuth_1 = require("../middlewares/requireAuth");
const isAdmin_1 = require("../middlewares/isAdmin");
const r = (0, express_1.Router)();
r.get('/ndr', requireAuth_1.requireAuth, ndr_controller_1.getMyNdrEvents);
// my timeline
r.get('/ndr/timeline', requireAuth_1.requireAuth, ndr_controller_1.getMyNdrTimeline);
r.get('/admin/ndr', requireAuth_1.requireAuth, isAdmin_1.isAdminMiddleware, ndr_controller_1.getAdminNdrEvents);
// timeline
r.get('/admin/ndr/timeline', requireAuth_1.requireAuth, isAdmin_1.isAdminMiddleware, ndr_controller_1.getAdminNdrTimeline);
// export + kpis
r.get('/admin/ndr/export', requireAuth_1.requireAuth, isAdmin_1.isAdminMiddleware, ndr_controller_2.exportAdminNdrCsv);
r.get('/admin/ndr/kpis', requireAuth_1.requireAuth, isAdmin_1.isAdminMiddleware, ndr_controller_2.getAdminNdrKpis);
// NDR actions
r.post('/ndr/reattempt', requireAuth_1.requireAuth, ndrActions_controller_1.ndrReattemptController);
r.post('/ndr/change-address', requireAuth_1.requireAuth, ndrActions_controller_1.ndrChangeAddressController);
r.post('/ndr/change-phone', requireAuth_1.requireAuth, ndrActions_controller_1.ndrChangePhoneController);
r.post('/ndr/delhivery/pickup-reschedule', requireAuth_1.requireAuth, ndrActions_controller_1.delhiveryPickupRescheduleController);
r.post('/ndr/bulk', requireAuth_1.requireAuth, ndrActions_controller_1.ndrBulkActionController);
// Delhivery UPL status proxy
r.get('/ndr/delhivery/upl-status', requireAuth_1.requireAuth, ndrActions_controller_1.delhiveryUplStatusController);
exports.default = r;

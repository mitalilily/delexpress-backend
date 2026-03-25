"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const rto_controller_1 = require("../controllers/rto.controller");
const requireAuth_1 = require("../middlewares/requireAuth");
const isAdmin_1 = require("../middlewares/isAdmin");
const r = (0, express_1.Router)();
r.get('/rto', requireAuth_1.requireAuth, rto_controller_1.getMyRtoEvents);
// Admin-only RTO listing
r.get('/admin/rto', requireAuth_1.requireAuth, isAdmin_1.isAdminMiddleware, rto_controller_1.getAdminRtoEvents);
// Admin RTO KPIs
r.get('/admin/rto/kpis', requireAuth_1.requireAuth, isAdmin_1.isAdminMiddleware, rto_controller_1.getAdminRtoKpis);
// Admin RTO export
r.get('/admin/rto/export', requireAuth_1.requireAuth, isAdmin_1.isAdminMiddleware, rto_controller_1.exportAdminRto);
exports.default = r;

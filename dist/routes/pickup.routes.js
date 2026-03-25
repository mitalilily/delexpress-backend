"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const pickup_controller_1 = require("../controllers/pickup.controller");
const requireAuth_1 = require("../middlewares/requireAuth");
const r = (0, express_1.Router)();
r.post('/shipments/cancel', requireAuth_1.requireAuth, pickup_controller_1.cancelShipment);
exports.default = r;

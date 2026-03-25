"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const returns_controller_1 = require("../controllers/returns.controller");
const requireAuth_1 = require("../middlewares/requireAuth");
const r = (0, express_1.Router)();
r.post('/returns/create', requireAuth_1.requireAuth, returns_controller_1.createReversePickup);
r.post('/returns/quote', requireAuth_1.requireAuth, returns_controller_1.quoteReverse);
exports.default = r;

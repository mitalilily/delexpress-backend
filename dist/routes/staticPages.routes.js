"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const staticPages_controller_1 = require("../controllers/staticPages.controller");
const isAdmin_1 = require("../middlewares/isAdmin");
const requireAuth_1 = require("../middlewares/requireAuth");
const router = (0, express_1.Router)();
// Public: fetch a static page by slug
router.get('/:slug', staticPages_controller_1.StaticPagesController.getBySlug);
// Admin only: create or update a static page by slug
router.put('/:slug', requireAuth_1.requireAuth, isAdmin_1.isAdminMiddleware, staticPages_controller_1.StaticPagesController.upsertBySlug);
exports.default = router;

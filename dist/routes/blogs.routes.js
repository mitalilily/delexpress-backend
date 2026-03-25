"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const blogs_controller_1 = require("../controllers/blogs.controller");
const isAdmin_1 = require("../middlewares/isAdmin");
const requireAuth_1 = require("../middlewares/requireAuth");
const router = (0, express_1.Router)();
router.get('/', blogs_controller_1.BlogController.list); // list + filters + search
router.get('/stats', requireAuth_1.requireAuth, isAdmin_1.isAdminMiddleware, blogs_controller_1.BlogController.stats); // quick stats
router.get('/:id', blogs_controller_1.BlogController.get); // get single blog
router.post('/', requireAuth_1.requireAuth, isAdmin_1.isAdminMiddleware, blogs_controller_1.BlogController.create); // create blog
router.put('/:id', requireAuth_1.requireAuth, isAdmin_1.isAdminMiddleware, blogs_controller_1.BlogController.update); // update blog
exports.default = router;

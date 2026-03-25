"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BlogController = void 0;
const blog_service_1 = require("../models/services/blog.service");
exports.BlogController = {
    async create(req, res, next) {
        try {
            // slug comes from frontend
            const payload = req.body;
            const created = await blog_service_1.BlogService.create(payload);
            res.status(201).json({ data: created });
        }
        catch (err) {
            next(err);
        }
    },
    async update(req, res, next) {
        try {
            const id = Number(req.params.id);
            const updated = await blog_service_1.BlogService.update(id, req.body);
            res.json({ data: updated });
        }
        catch (err) {
            next(err);
        }
    },
    async list(req, res, next) {
        try {
            const filters = req.query || {};
            const page = Number(req.query.page || 1);
            const limit = Number(req.query.limit || 10);
            const result = await blog_service_1.BlogService.list(filters, { page, limit });
            res.json({ data: result.rows, total: result.total });
        }
        catch (err) {
            next(err);
        }
    },
    async stats(req, res, next) {
        try {
            const stats = await blog_service_1.BlogService.getStats();
            res.json({ data: stats });
        }
        catch (err) {
            next(err);
        }
    },
    async get(req, res, next) {
        try {
            const param = req.params.id; // could be numeric id or slug
            let blog;
            if (!isNaN(Number(param))) {
                // param is a number → treat as ID
                blog = await blog_service_1.BlogService.getById(Number(param));
            }
            else {
                // param is a string → treat as slug
                blog = await blog_service_1.BlogService.getBySlug(param);
            }
            if (!blog) {
                return res.status(404).json({ message: 'Blog not found' });
            }
            res.json({ data: blog });
        }
        catch (err) {
            next(err);
        }
    },
};

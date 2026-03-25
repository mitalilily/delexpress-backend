"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StaticPagesController = void 0;
const staticPages_service_1 = require("../models/services/staticPages.service");
exports.StaticPagesController = {
    async getBySlug(req, res, next) {
        try {
            const { slug } = req.params;
            const page = await staticPages_service_1.StaticPagesService.getBySlug(slug);
            if (!page) {
                return res.status(404).json({ message: 'Page not found' });
            }
            return res.json({ data: page });
        }
        catch (err) {
            next(err);
        }
    },
    async upsertBySlug(req, res, next) {
        try {
            const { slug } = req.params;
            const { title, content } = req.body;
            if (!content || typeof content !== 'string' || !content.trim()) {
                return res.status(400).json({ message: 'Content is required' });
            }
            const page = await staticPages_service_1.StaticPagesService.upsertBySlug(slug, { title, content });
            return res.json({ data: page });
        }
        catch (err) {
            next(err);
        }
    },
};

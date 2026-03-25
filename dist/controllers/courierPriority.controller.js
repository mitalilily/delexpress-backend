"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CourierPriorityController = void 0;
const courierPriority_service_1 = require("../models/services/courierPriority.service");
exports.CourierPriorityController = {
    create: async (req, res) => {
        try {
            const user_id = req.user.sub;
            const { name, personalised_order } = req.body;
            const profile = await courierPriority_service_1.CourierPriorityService.createCourierPriorityProfile(user_id, name, personalised_order);
            res.status(201).json(profile);
        }
        catch (err) {
            res.status(500).json({ error: 'Failed to create profile', details: err });
        }
    },
    getByUser: async (req, res) => {
        try {
            const userId = req.user.sub;
            const profiles = await courierPriority_service_1.CourierPriorityService.getCourierPriorityProfilesByUser(userId);
            res.json(profiles);
        }
        catch (err) {
            res.status(500).json({ error: 'Failed to fetch profiles', details: err });
        }
    },
    getOne: async (req, res) => {
        try {
            const id = req.params.id;
            const profile = await courierPriority_service_1.CourierPriorityService.getCourierPriorityProfile(id);
            res.json(profile);
        }
        catch (err) {
            res.status(500).json({ error: 'Failed to fetch profile', details: err });
        }
    },
    update: async (req, res) => {
        try {
            const id = req.params.id;
            const profile = await courierPriority_service_1.CourierPriorityService.updatCourierPriorityeProfile(id, req.body);
            res.json(profile);
        }
        catch (err) {
            res.status(500).json({ error: 'Failed to update profile', details: err });
        }
    },
    delete: async (req, res) => {
        try {
            const id = req.params.id;
            await courierPriority_service_1.CourierPriorityService.deleteCourierPriorityProfile(id);
            res.json({ message: 'Profile deleted' });
        }
        catch (err) {
            res.status(500).json({ error: 'Failed to delete profile', details: err });
        }
    },
};

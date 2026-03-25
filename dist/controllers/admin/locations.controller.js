"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LocationController = void 0;
const location_service_1 = require("../../models/services/location.service");
exports.LocationController = {
    create: async (req, res) => {
        try {
            const location = await location_service_1.LocationService.create(req.body);
            res.status(201).json(location);
        }
        catch (err) {
            console.error(err);
            res.status(500).json({ message: 'Failed to create location' });
        }
    },
    list: async (req, res) => {
        try {
            const page = Number(req.query.page) || 1;
            const limit = Number(req.query.limit) || 20;
            const filters = {
                pincode: req.query.pincode,
                city: req.query.city,
                state: req.query.state,
            };
            const result = await location_service_1.LocationService.list({ page, limit, filters });
            res.json(result);
        }
        catch (err) {
            console.error(err);
            res.status(500).json({ message: 'Failed to fetch locations' });
        }
    },
    getById: async (req, res) => {
        try {
            const location = await location_service_1.LocationService.getById(req.params.id);
            if (!location)
                return res.status(404).json({ message: 'Location not found' });
            res.json(location);
        }
        catch (err) {
            console.error(err);
            res.status(500).json({ message: 'Failed to fetch location' });
        }
    },
    update: async (req, res) => {
        try {
            const location = await location_service_1.LocationService.update(req.params.id, req.body);
            if (!location)
                return res.status(404).json({ message: 'Location not found' });
            res.json(location);
        }
        catch (err) {
            console.error(err);
            res.status(500).json({ message: 'Failed to update location' });
        }
    },
    delete: async (req, res) => {
        try {
            const deleted = await location_service_1.LocationService.delete(req.params.id);
            if (!deleted)
                return res.status(404).json({ message: 'Location not found' });
            res.json({ message: 'Location deleted successfully' });
        }
        catch (err) {
            console.error(err);
            res.status(500).json({ message: 'Failed to delete location' });
        }
    },
};

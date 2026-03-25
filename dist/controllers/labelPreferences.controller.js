"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.labelPreferencesController = void 0;
const labelPreferences_service_1 = require("../models/services/labelPreferences.service");
exports.labelPreferencesController = {
    async get(req, res) {
        try {
            const userId = req.user.sub;
            const prefs = await labelPreferences_service_1.labelPreferencesService.getByUser(userId);
            console.log('PREFS', prefs);
            if (!prefs) {
                return res.status(404).json({ message: 'No label preferences found' });
            }
            res.json(prefs);
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    },
    async save(req, res) {
        try {
            const userId = req.user.sub;
            const prefs = await labelPreferences_service_1.labelPreferencesService.createOrUpdate(userId, req.body);
            res.json(prefs);
        }
        catch (err) {
            res.status(500).json({ error: err.message });
        }
    },
};

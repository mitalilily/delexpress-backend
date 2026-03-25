"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const locations_controller_1 = require("../../controllers/admin/locations.controller");
const router = express_1.default.Router();
router.post('/locations', locations_controller_1.LocationController.create);
router.get('/locations', locations_controller_1.LocationController.list);
router.get('/locations/:id', locations_controller_1.LocationController.getById);
router.put('/locations/:id', locations_controller_1.LocationController.update);
router.delete('/locations/:id', locations_controller_1.LocationController.delete);
exports.default = router;

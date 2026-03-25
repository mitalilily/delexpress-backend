"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const requireAuth_1 = require("../middlewares/requireAuth");
const pickupAddresses_controller_1 = require("../controllers/pickupAddresses.controller");
const router = express_1.default.Router();
router.use(requireAuth_1.requireAuth);
router.post("/", pickupAddresses_controller_1.createPickupAddressHandler);
router.get("/", pickupAddresses_controller_1.getPickupAddressesHandler);
router.patch("/:id", pickupAddresses_controller_1.updatePickupAddressHandler);
router.get("/export", pickupAddresses_controller_1.exportPickupAddressesHandler);
router.post("/import", pickupAddresses_controller_1.importPickupAddressesHandler);
exports.default = router;

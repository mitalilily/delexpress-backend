import express from "express";
import { requireAuth } from "../middlewares/requireAuth";
import {
  createPickupAddressHandler,
  exportPickupAddressesHandler,
  getPickupAddressesHandler,
  importPickupAddressesHandler,
  updatePickupAddressHandler,
} from "../controllers/pickupAddresses.controller";

const router = express.Router();

router.use(requireAuth);
router.post("/", createPickupAddressHandler);
router.get("/", getPickupAddressesHandler);
router.patch("/:id", updatePickupAddressHandler);
router.get("/export", exportPickupAddressesHandler);
router.post("/import", importPickupAddressesHandler);
export default router;

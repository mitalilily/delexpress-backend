import { Router } from "express";
import {
  integrateMagentoStore,
  integrateShopifyStore,
  integrateWixStore,
  integrateWooCommerceStore,
} from "../controllers/platformIntegration.controller";
import { syncShopifyOrdersController } from '../controllers/shopify.controller'
import { requireAuth } from '../middlewares/requireAuth'
import { deleteStoreById } from "../models/services/PlatformIntegration.service";

const router = Router();

router.use(requireAuth)

router.post("/shopify-auth", integrateShopifyStore);
router.post('/shopify/sync-orders', syncShopifyOrdersController)
router.post("/woocommerce-auth", integrateWooCommerceStore);
router.post("/magento-auth", integrateMagentoStore);
router.post("/wix-auth", integrateWixStore);
router.delete("/stores/:storeId", deleteStoreById);

export default router;

import { Router } from "express";
import {
  createPresignedUrl,
  getPresignedDownloadUrl,
} from "../controllers/upload.controller";
import { requireAuth } from "../middlewares/requireAuth";

const router = Router();

router.post("/presign", requireAuth, createPresignedUrl);
router.post("/presign-download-url", requireAuth, getPresignedDownloadUrl);

export default router;

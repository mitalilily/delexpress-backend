"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const upload_controller_1 = require("../controllers/upload.controller");
const requireAuth_1 = require("../middlewares/requireAuth");
const router = (0, express_1.Router)();
router.post("/presign", requireAuth_1.requireAuth, upload_controller_1.createPresignedUrl);
router.post("/presign-download-url", requireAuth_1.requireAuth, upload_controller_1.getPresignedDownloadUrl);
exports.default = router;

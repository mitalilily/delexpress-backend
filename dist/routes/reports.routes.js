"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const reports_controller_1 = require("../controllers/reports.controller");
const requireAuth_1 = require("../middlewares/requireAuth");
const router = express_1.default.Router();
router.post('/custom-export', requireAuth_1.requireAuth, reports_controller_1.exportCustomReportCsvController);
exports.default = router;

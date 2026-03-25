"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const globalSearch_controller_1 = require("../controllers/globalSearch.controller");
const requireAuth_1 = require("../middlewares/requireAuth");
const router = express_1.default.Router();
router.get('/search', requireAuth_1.requireAuth, globalSearch_controller_1.globalSearchController);
exports.default = router;

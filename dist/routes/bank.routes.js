"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const requireAuth_1 = require("../middlewares/requireAuth");
const bankAcount_controller_1 = require("../controllers/bankAcount.controller");
const router = express_1.default.Router();
router.use(requireAuth_1.requireAuth);
router.post("/", bankAcount_controller_1.addBankAccountHandler);
router.patch("/:id", bankAcount_controller_1.editBankAccount);
router.delete("/:id", bankAcount_controller_1.removeBankAccount);
router.get("/", bankAcount_controller_1.getBankAccountsHandler);
exports.default = router;

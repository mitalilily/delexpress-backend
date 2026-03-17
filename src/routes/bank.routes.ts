import express from "express";
import { requireAuth } from "../middlewares/requireAuth";
import {
  addBankAccountHandler,
  editBankAccount,
  getBankAccountsHandler,
  removeBankAccount,
} from "../controllers/bankAcount.controller";

const router = express.Router();

router.use(requireAuth);
router.post("/", addBankAccountHandler);
router.patch("/:id", editBankAccount);
router.delete("/:id", removeBankAccount);
router.get("/", getBankAccountsHandler);

export default router;

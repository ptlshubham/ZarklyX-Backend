import express from "express";
import  StockTransactionApi from "./stock-transaction/stock-transaction-api";
import StockBalanceApi from "./stock-balance/stock-balance-api";

const router = express.Router();

// Unified transaction routes (inward, outward, adjustment)
router.use("/transaction", StockTransactionApi);

// Stock balance routes
router.use("/balance", StockBalanceApi);

export default router;

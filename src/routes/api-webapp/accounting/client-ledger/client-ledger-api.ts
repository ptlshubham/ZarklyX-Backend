import express, { Request, Response } from "express";
import {
    getClientLedgerHandler,
    getClientBalanceHandler,
    getClientLedgerSummaryHandler,
    getAllClientsWithBalanceHandler,
} from "./client-ledger-handler";

const router = express.Router();

/**
 * GET /api/accounting/client-ledger/:clientId
 * Get client ledger with running balance
 * Query params: fromDate, toDate, limit, offset
 */
router.get("/:clientId", getClientLedgerHandler);

/**
 * GET /api/accounting/client-ledger/:clientId/balance
 * Get client's current balance (pending amount)
 */
router.get("/:clientId/balance", getClientBalanceHandler);

/**
 * GET /api/accounting/client-ledger/:clientId/summary
 * Get client ledger summary (total debits, credits, balance)
 */
router.get("/:clientId/summary", getClientLedgerSummaryHandler);

/**
 * GET /api/accounting/client-ledger/all/balances
 * Get all clients with their pending balances
 * Query params: includeZeroBalance (boolean)
 */
router.get("/all/balances", getAllClientsWithBalanceHandler);

export default router;

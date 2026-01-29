import express from "express";
import asyncHandler from "express-async-handler";
import {
  addStockInward,
  addStockOutward,
  addStockAdjustment,
  getAllStockTransactions,
  getStockTransactionsByType,
  getStockTransactionsByWarehouse,
  getStockTransactionsByItem,
  getStockTransactionsByWarehouseAndItem,
  getStockTransactionById,
} from "./stock-transaction-handler";
import { serverError } from "../../../../../utils/responseHandler";
 
const router = express.Router();

// Add inward transaction
router.post(
  "/addInward",
  asyncHandler(async (req, res) => {
    try {
      const payload = req.body;

      if (!payload || !payload.companyId) {
        res.status(400).json({
          success: false,
          message: "companyId is required.",
          field: "companyId",
        });
        return;
      }

      if (!Array.isArray(payload.data) || payload.data.length === 0) {
        res.status(400).json({
          success: false,
          message: "Data array is required.",
          field: "data",
        });
        return;
      }

      await addStockInward(payload);

      res.status(200).json({
        success: true,
        message: "Stock inward added successfully",
      });
    } catch (error: any) {
      console.error("Stock inward API Error:", error);
      serverError(res, "Something went wrong during stock inward creation.");
    }
  })
);

// Add outward transaction
router.post(
  "/addOutward",
  asyncHandler(async (req, res) => {
    try {
      const payload = req.body;

      if (!payload || !payload.companyId) {
        res.status(400).json({
          success: false,
          message: "companyId is required.",
          field: "companyId",
        });
        return;
      }

      if (!Array.isArray(payload.data) || payload.data.length === 0) {
        res.status(400).json({
          success: false,
          message: "Data array is required.",
          field: "data",
        });
        return;
      }

      await addStockOutward(payload);

      res.status(200).json({
        success: true,
        message: "Stock outward added successfully",
      });
    } catch (error: any) {
      console.error("Stock outward API Error:", error);

      if (error.message === "Insufficient stock for outward") {
        res.status(400).json({ success: false, message: error.message });
        return;
      }

      serverError(res, "Something went wrong during stock outward creation.");
    }
  })
);

// Add adjustment transaction
router.post(
  "/addAdjustment",
  asyncHandler(async (req, res) => {
    try {
      const payload = req.body;

      if (!payload || !payload.companyId) {
        res.status(400).json({
          success: false,
          message: "companyId is required.",
          field: "companyId",
        });
        return;
      }

      if (!Array.isArray(payload.data) || payload.data.length === 0) {
        res.status(400).json({
          success: false,
          message: "Data array is required.",
          field: "data",
        });
        return;
      }

      await addStockAdjustment(payload);

      res.status(200).json({
        success: true,
        message: "Stock adjusted successfully",
      });
    } catch (error: any) {
      console.error("Stock adjustment API Error:", error);

      if (error.message === "Adjustment causes negative stock") {
        res.status(400).json({ success: false, message: error.message });
        return;
      }

      serverError(res, "Something went wrong during stock adjustment.");
    }
  })
);

// Get all transactions
router.get(
  "/getAllStockTransaction/:companyId",
  asyncHandler(async (req, res) => {
    try {
      const { companyId } = req.params;

      if (!companyId) {
        res.status(400).json({
          success: false,
          message: "companyId is required.",
          field: "companyId",
        });
        return;
      }

      const data = await getAllStockTransactions(companyId);

      res.status(200).json({
        success: true,
        message: "Stock transactions retrieved successfully.",
        data,
      });
    } catch (error: any) {
      console.error("Stock transaction getAll Error:", error);
      serverError(res, "Something went wrong during transaction retrieval.");
    }
  })
);

// Get transactions by type
router.get(
  "/getStockTransactionsByType/:companyId/:transactionType",
  asyncHandler(async (req, res) => {
    try {
      const { companyId, transactionType } = req.params;

      if (!companyId || !transactionType) {
        res.status(400).json({
          success: false,
          message: "companyId and transactionType are required.",
        });
        return;
      }

      if (!["INWARD", "OUTWARD", "ADJUSTMENT"].includes(transactionType)) {
        res.status(400).json({
          success: false,
          message: "Invalid transactionType. Must be INWARD, OUTWARD, or ADJUSTMENT.",
        });
        return;
      }

      const data = await getStockTransactionsByType(
        companyId,
        transactionType as "INWARD" | "OUTWARD" | "ADJUSTMENT"
      );

      res.status(200).json({
        success: true,
        message: "Stock transactions by type retrieved successfully.",
        data,
      });
    } catch (error: any) {
      console.error("Stock transaction getByType Error:", error);
      serverError(res, "Something went wrong during transaction retrieval.");
    }
  })
);

// Get transactions by warehouse
router.get(
  "/getByWarehouse/:companyId/:warehouseId",
  asyncHandler(async (req, res) => {
    try {
      const { companyId, warehouseId } = req.params;

      if (!companyId || !warehouseId) {
        res.status(400).json({
          success: false,
          message: "companyId and warehouseId are required.",
        });
        return;
      }

      const data = await getStockTransactionsByWarehouse(companyId, warehouseId);

      res.status(200).json({
        success: true,
        message: "Stock transactions by warehouse retrieved successfully.",
        data,
      });
    } catch (error: any) {
      console.error("Stock transaction getByWarehouse Error:", error);
      serverError(res, "Something went wrong during transaction retrieval.");
    }
  })
);

// Get transactions by item
router.get(
  "/getByItem/:companyId/:itemId",
  asyncHandler(async (req, res) => {
    try {
      const { companyId, itemId } = req.params;

      if (!companyId || !itemId) {
        res.status(400).json({
          success: false,
          message: "companyId and itemId are required.",
        });
        return;
      }

      const data = await getStockTransactionsByItem(companyId, itemId);

      res.status(200).json({
        success: true,
        message: "Stock transactions by item retrieved successfully.",
        data,
      });
    } catch (error: any) {
      console.error("Stock transaction getByItem Error:", error);
      serverError(res, "Something went wrong during transaction retrieval.");
    }
  })
);

// Get transactions by warehouse and item
router.get(
  "/getByWarehouseAndItem/:companyId/:warehouseId/:itemId",
  asyncHandler(async (req, res) => {
    try {
      const { companyId, warehouseId, itemId } = req.params;

      if (!companyId || !warehouseId || !itemId) {
        res.status(400).json({
          success: false,
          message: "companyId, warehouseId and itemId are required.",
        });
        return;
      }

      const data = await getStockTransactionsByWarehouseAndItem(
        companyId,
        warehouseId,
        itemId
      );

      res.status(200).json({
        success: true,
        message: "Stock transactions retrieved successfully.",
        data,
      });
    } catch (error: any) {
      console.error("Stock transaction getByWarehouseAndItem Error:", error);
      serverError(res, "Something went wrong during transaction retrieval.");
    }
  })
);

// Get transaction by id
router.get(
  "/getById/:id/:companyId",
  asyncHandler(async (req, res) => {
    try {
      const { id, companyId } = req.params;

      if (!id || !companyId) {
        res.status(400).json({
          success: false,
          message: "id and companyId are required.",
        });
        return;
      }

      const data = await getStockTransactionById(id, companyId);

      if (!data) {
        res.status(404).json({
          success: false,
          message: "Stock transaction not found.",
        });
        return;
      }

      res.status(200).json({
        success: true,
        message: "Stock transaction retrieved successfully.",
        data,
      });
    } catch (error: any) {
      console.error("Stock transaction getById Error:", error);
      serverError(res, "Something went wrong during transaction retrieval.");
    }
  })
);

export default router;

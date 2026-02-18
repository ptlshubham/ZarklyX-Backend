import express from "express";
import asyncHandler from "express-async-handler";
import {
  getAllStockBalances,
  getStockByWarehouse,
  getStockByItem,
  getStock,
} from "./stock-balance-handler";
import { serverError } from "../../../../../utils/responseHandler";

const router = express.Router();

router.get(
  "/getAllStock/:companyId",
  asyncHandler(async (req, res) => {
    try {
      let { companyId } = req.params;
      if(Array.isArray(companyId)){companyId=companyId[0];}

      if (!companyId) {
        res.status(400).json({
          success: false,
          message: "companyId is required.",
          field: "companyId",
        });
        return;
      }

      const data = await getAllStockBalances(companyId);

      res.status(200).json({
        success: true,
        message: "Stock balances retrieved successfully.",
        data,
      });
    } catch (error: any) {
      console.error("Stock balance getAll Error:", error);
      serverError(res, "Something went wrong during stock retrieval.");
    }
  })
);

router.get(
  "/getStockByWarehouse/:companyId/:warehouseId",
  asyncHandler(async (req, res) => {
    try {
      let { companyId, warehouseId } = req.params;
      if(Array.isArray(companyId)){companyId=companyId[0];}
      if(Array.isArray(warehouseId)){warehouseId=warehouseId[0];}

      if (!companyId || !warehouseId) {
        res.status(400).json({
          success: false,
          message: "companyId and warehouseId are required.",
        });
        return;
      }

      const data = await getStockByWarehouse(companyId, warehouseId);

      res.status(200).json({
        success: true,
        message: "Stock by warehouse retrieved successfully.",
        data,
      });
    } catch (error: any) {
      console.error("Stock balance getByWarehouse Error:", error);
      serverError(res, "Something went wrong during stock retrieval.");
    }
  })
);

router.get(
  "/getStockByItem/:companyId/:itemId",
  asyncHandler(async (req, res) => {
    try {
      let { companyId, itemId } = req.params;
      if(Array.isArray(companyId)){companyId=companyId[0];}
      if(Array.isArray(itemId)){itemId=itemId[0];}

      if (!companyId || !itemId) {
        res.status(400).json({
          success: false,
          message: "companyId and itemId are required.",
        });
        return;
      }

      const data = await getStockByItem(companyId, itemId);

      res.status(200).json({
        success: true,
        message: "Stock by item retrieved successfully.",
        data,
      });
    } catch (error: any) {
      console.error("Stock balance getByItem Error:", error);
      serverError(res, "Something went wrong during stock retrieval.");
    }
  })
);

router.get(
  "/getStockById/:companyId/:warehouseId/:itemId",
  asyncHandler(async (req, res) => {
    try {
      let { companyId, warehouseId, itemId } = req.params;
      if(Array.isArray(companyId)){companyId=companyId[0];}
      if(Array.isArray(warehouseId)){warehouseId=warehouseId[0];}
      if(Array.isArray(itemId)){itemId=itemId[0];}

      if (!companyId || !warehouseId || !itemId) {
        res.status(400).json({
          success: false,
          message: "companyId, warehouseId and itemId are required.",
        });
        return;
      }

      const data = await getStock(companyId, warehouseId, itemId);

      if (!data) {
        res.status(404).json({
          success: false,
          message: "Stock record not found.",
        });
        return;
      }

      res.status(200).json({
        success: true,
        message: "Stock retrieved successfully.",
        data,
      });
    } catch (error: any) {
      console.error("Stock balance getStock Error:", error);
      serverError(res, "Something went wrong during stock retrieval.");
    }
  })
);

export default router;

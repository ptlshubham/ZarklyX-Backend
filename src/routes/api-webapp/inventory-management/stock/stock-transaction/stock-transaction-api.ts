import express from "express";
import asyncHandler from "express-async-handler";
import dbInstance from "../../../../../db/core/control-db";
import { serverError } from "../../../../../utils/responseHandler";
import { Warehouse } from "../../warehouse/warehouse-model";
import { Item } from "../../../accounting/item/item-model";
import {
  createStockTransaction,
  getOrCreateStockBalance,
  getStockBalanceForUpdate,
  increaseStock,
  decreaseStock,
  fetchStockTransactions,
} from "./stock-transaction-handler";
import {
  sendInwardEmail,
  sendOutwardEmail,
  sendAdjustmentEmail,
} from "../../../../../services/stock-email.service";
import { systemLog } from "../../../../../middleware/system-log.middleware";
import { authMiddleware } from "../../../../../middleware/auth.middleware";

const router = express.Router();

// Add inward transaction

router.post(
  "/addInward",
  authMiddleware,
  systemLog({
    module: "STOCK",
    operation: "CREATE",
    action: "Stock Inward",
    metadata: {
      description: "Added stock inward transaction",
    }
  }),
  asyncHandler(async (req, res) => {
    const t = await dbInstance.transaction();
    try {
      const { companyId, data } = req.body;

      if (!companyId) {
        res.status(400).json({ success: false, message: "companyId required" });
        return;
      }

      if (!Array.isArray(data) || data.length === 0) {
        res.status(400).json({ success: false, message: "data required" });
        return;
      }

      const emailItemsByWarehouse: Record<string, any[]> = {};

      for (const row of data) {
        const amount = row.quantity * row.rate;

        await createStockTransaction(
          {
            companyId,
            transactionDate: row.inwardDate,
            transactionType: "INWARD",
            warehouseId: row.warehouseId,
            itemId: row.itemId,
            quantity: row.quantity,
            rate: row.rate,
            amount,
            vendorId: row.vendorId ?? null,
            batchNumber: row.batchNumber ?? null,
            expiryDate: row.expiryDate ?? null,
            referenceNumber: row.referenceNumber ?? null,
            notes: row.notes ?? null,
          },
          t
        );

        const stock = await getOrCreateStockBalance(
          {
            companyId,
            warehouseId: row.warehouseId,
            itemId: row.itemId,
          },
          t
        );

        await increaseStock(stock, row.quantity, t);

        if (!emailItemsByWarehouse[row.warehouseId]) {
          emailItemsByWarehouse[row.warehouseId] = [];
        }

        emailItemsByWarehouse[row.warehouseId].push({
          itemId: row.itemId,
          quantity: row.quantity,
          rate: row.rate,
          batchNumber: row.batchNumber,
          referenceNumber: row.referenceNumber,
        });
      }

      await t.commit();
      
      // Send inward email
      await sendInwardEmail({
        companyId,
        warehouses: emailItemsByWarehouse,
      });

      res.status(200).json({
        success: true,
        message: "Stock inward added successfully",
      });
    } catch (error) {
      await t.rollback();
      serverError(res, "Something went wrong during stock inward creation.");
    }
  })
);

// Add outward transaction

router.post(
  "/addOutward",
  authMiddleware,
  systemLog({
    module: "STOCK",
    operation: "CREATE",
    action: "Stock Outward",
    metadata: {
      description: "Added stock outward transaction",
    }
  }),
  asyncHandler(async (req, res) => {
    const t = await dbInstance.transaction();
    try {
      const { companyId, data } = req.body;

      const emailWarehouses: Record<string, any[]> = {};

      for (const row of data) {
        const stock = await getStockBalanceForUpdate(
          {
            companyId,
            warehouseId: row.warehouseId,
            itemId: row.itemId,
          },
          t
        );

        if (!stock || stock.quantity < row.quantity) {

          const item = await Item.findByPk(row.itemId, {
            attributes: ["itemName"],
            raw: true,
          })

          const itemName = item?.itemName || "item";

          const warehouse = await Warehouse.findByPk(row.warehouseId, {
            attributes: ["name"],
            raw: true,
          })

          const warehouseName = warehouse?.name || "warehouse";

          res.status(400).json({
            success: false,
            message: `Insufficient stock for item ${itemName} in warehouse ${warehouseName}`,
          });
          await t.rollback();
          return;
        }

        await createStockTransaction(
          {
            companyId,
            transactionDate: row.outwardDate,
            transactionType: "OUTWARD",
            warehouseId: row.warehouseId,
            itemId: row.itemId,
            quantity: row.quantity,
            rate: row.rate ?? 0,
            amount: row.quantity * (row.rate ?? 0),
            referenceNumber: row.referenceNumber ?? null,
            notes: row.notes ?? null,
          },
          t
        );

        await decreaseStock(stock, row.quantity, t);

        if (!emailWarehouses[row.warehouseId]) {
          emailWarehouses[row.warehouseId] = [];
        }

        emailWarehouses[row.warehouseId].push({
          itemId: row.itemId,
          quantity: row.quantity,
          remainingStock: stock.quantity - row.quantity,
          referenceNumber: row.referenceNumber,
        });

      }

      await t.commit();
 
      // Send outward email
      await sendOutwardEmail({
        companyId,
        warehouses: emailWarehouses,
      });

      res.status(200).json({ success: true, message: "Stock outward added successfully" });
    } catch (error: any) {
      await t.rollback();
      serverError(res, "Something went wrong during stock outward creation.");
    }
  })
);

// Add adjustment transaction

router.post(
  "/addAdjustment",
  authMiddleware,
  systemLog({
    module: "STOCK",
    operation: "CREATE",
    action: "Stock Adjustment",
    metadata: {
      description: "Added stock adjustment transaction",
    }
  }),
  asyncHandler(async (req, res) => {
    const t = await dbInstance.transaction();
    try {
      const { companyId, data } = req.body;

      const emailWarehouses: Record<string, any[]> = {};

      for (const row of data) {
        const stock = await getOrCreateStockBalance(
          {
            companyId,
            warehouseId: row.warehouseId,
            itemId: row.itemId,
          },
          t
        );

        if (row.adjustmentType === "DECREASE" && stock.quantity < row.quantity) {

          const item = await Item.findByPk(row.itemId, {
            attributes: ["itemName"],
            raw: true,
          })

          const itemName = item?.itemName || "item";

          const warehouse = await Warehouse.findByPk(row.warehouseId, {
            attributes: ["name"],
            raw: true,
          })

          const warehouseName = warehouse?.name || "warehouse";

          res.status(400).json({
            success: false,
            message: `Insufficient stock for item ${itemName} in warehouse ${warehouseName}`,
          });
          await t.rollback();
          return;
        }

        await createStockTransaction(
          {
            companyId,
            transactionDate: row.adjustmentDate,
            transactionType: "ADJUSTMENT",
            warehouseId: row.warehouseId,
            itemId: row.itemId,
            quantity:
              row.adjustmentType === "INCREASE"
                ? row.quantity
                : -row.quantity,
            rate: 0,
            amount: 0,
            reason: row.reason ?? null,
            notes: row.notes ?? null,
          },
          t
        );

        row.adjustmentType === "INCREASE"
          ? await increaseStock(stock, row.quantity, t)
          : await decreaseStock(stock, row.quantity, t);

        const previousBalance = stock.quantity;
        const currentBalance =
          row.adjustmentType === "INCREASE"
            ? previousBalance + row.quantity
            : previousBalance - row.quantity;

        if (!emailWarehouses[row.warehouseId]) {
          emailWarehouses[row.warehouseId] = [];
        }

        emailWarehouses[row.warehouseId].push({
          itemId: row.itemId,
          adjustmentType: row.adjustmentType,
          quantity: row.quantity,
          reason: row.reason,
          previousBalance,
          currentBalance,
        });
      }

      await t.commit();

      // Send adjustment email
      await sendAdjustmentEmail({
        companyId,
        warehouses: emailWarehouses,
      });

      res.status(200).json({ success: true, message: "Stock adjusted successfully" });
    } catch (error: any) {
      await t.rollback();
      serverError(res, "Something went wrong during stock adjustment.");
    }
  })
);

// Get stock transactions

router.get(
  "/getStockTransactions",
  authMiddleware,
  asyncHandler(async (req, res) => {

    const companyId = req.user?.companyId

    const { type, warehouseId, itemId } = req.query;

    if (!companyId) {
      res.status(400).json({ success: false, message: "companyId required" });
      return;
    }

    const where: any = { companyId };
    if (type) where.transactionType = type;
    if (warehouseId) where.warehouseId = warehouseId;
    if (itemId) where.itemId = itemId;

    const data = await fetchStockTransactions(where);

    res.status(200).json({ success: true, data });
  })
);

export default router;
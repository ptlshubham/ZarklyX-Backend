import { StockTransaction } from "./stock-transaction-model";
import { StockBalance } from "../stock-balance/stock-balance-model";
import dbInstance from "../../../../../db/core/control-db";
import { Transaction } from "sequelize";

// Add inward transaction
export const addStockInward = async (payload: any) => {
  const t = await dbInstance.transaction();

  try {
    for (const row of payload.data) {
      const amount = row.quantity * row.rate;

      await StockTransaction.create(
        {
          companyId: payload.companyId,
          transactionDate: row.inwardDate,
          transactionType: "INWARD",
          warehouseId: row.warehouseId,
          itemId: row.itemId,
          quantity: row.quantity,
          rate: row.rate,
          amount,
          vendorId: row.vendorId || null,
          batchNumber: row.batchNumber || null,
          expiryDate: row.expiryDate || null,
          referenceNumber: row.referenceNumber || null,
          notes: row.notes || null,
        },
        { transaction: t }
      );

      const [stock] = await StockBalance.findOrCreate({
        where: { companyId: payload.companyId, warehouseId: row.warehouseId, itemId: row.itemId },
        defaults: {
          companyId: payload.companyId,
          warehouseId: row.warehouseId,
          itemId: row.itemId,
          quantity: 0,
        },
        transaction: t,
        lock: t.LOCK.UPDATE,
      });

      await stock.increment("quantity", {
        by: row.quantity,
        transaction: t,
      });
    }

    await t.commit();
  } catch (e) {
    await t.rollback();
    throw e;
  }
};

// Add outward transaction
export const addStockOutward = async (payload: any) => {
  const t = await dbInstance.transaction();

  try {
    for (const row of payload.data) {
      const stock = await StockBalance.findOne({
        where: {
          companyId: payload.companyId,
          warehouseId: row.warehouseId,
          itemId: row.itemId,
        },
        transaction: t,
        lock: t.LOCK.UPDATE,
      });

      if (!stock || stock.quantity < row.quantity) {
        throw new Error("Insufficient stock for outward");
      }

      await StockTransaction.create(
        {
          companyId: payload.companyId,
          transactionDate: row.outwardDate,
          transactionType: "OUTWARD",
          warehouseId: row.warehouseId,
          itemId: row.itemId,
          quantity: row.quantity,
          rate: row.rate || 0,
          amount: (row.quantity * (row.rate || 0)),
          referenceNumber: row.referenceNumber || null,
          notes: row.notes || null,
        },
        { transaction: t }
      );

      await stock.decrement("quantity", {
        by: row.quantity,
        transaction: t,
      });
    }

    await t.commit();
    return true;
  } catch (error) {
    await t.rollback();
    throw error;
  }
};

// Add adjustment transaction
export const addStockAdjustment = async (payload: any) => {
  const t = await dbInstance.transaction();

  try {
    for (const row of payload.data) {
      const [stock] = await StockBalance.findOrCreate({
        where: {
          companyId: payload.companyId,
          warehouseId: row.warehouseId,
          itemId: row.itemId,
        },
        defaults: {
          companyId: payload.companyId,
          warehouseId: row.warehouseId,
          itemId: row.itemId,
          quantity: 0,
        },
        transaction: t,
        lock: t.LOCK.UPDATE,
      });

      if (
        row.adjustmentType === "DECREASE" &&
        stock.quantity < row.quantity
      ) {
        throw new Error("Adjustment causes negative stock");
      }

      await StockTransaction.create(
        {
          companyId: payload.companyId,
          transactionDate: row.adjustmentDate,
          transactionType: "ADJUSTMENT",
          warehouseId: row.warehouseId,
          itemId: row.itemId,
          quantity: row.adjustmentType === "INCREASE" ? row.quantity : -row.quantity,
          rate: 0,
          amount: 0,
          reason: row.reason || null,
          notes: row.notes || null,
        },
        { transaction: t }
      );

      if (row.adjustmentType === "INCREASE") {
        await stock.increment("quantity", {
          by: row.quantity,
          transaction: t,
        });
      } else {
        await stock.decrement("quantity", {
          by: row.quantity,
          transaction: t,
        });
      }
    }

    await t.commit();
    return true;
  } catch (error) {
    await t.rollback();
    throw error;
  }
};

// Read handlers
export const getAllStockTransactions = async (companyId: string) => {
  return await StockTransaction.findAll({
    where: { companyId },
    order: [["transactionDate", "DESC"]],
  });
};

export const getStockTransactionsByType = async (
  companyId: string,
  transactionType: "INWARD" | "OUTWARD" | "ADJUSTMENT"
) => {
  return await StockTransaction.findAll({
    where: { companyId, transactionType },
    order: [["transactionDate", "DESC"]],
  });
};

export const getStockTransactionsByWarehouse = async (
  companyId: string,
  warehouseId: string
) => {
  return await StockTransaction.findAll({
    where: { companyId, warehouseId },
    order: [["transactionDate", "DESC"]],
  });
};

export const getStockTransactionsByItem = async (
  companyId: string,
  itemId: string
) => {
  return await StockTransaction.findAll({
    where: { companyId, itemId },
    order: [["transactionDate", "DESC"]],
  });
};

export const getStockTransactionsByWarehouseAndItem = async (
  companyId: string,
  warehouseId: string,
  itemId: string
) => {
  return await StockTransaction.findAll({
    where: { companyId, warehouseId, itemId },
    order: [["transactionDate", "DESC"]],
  });
};

export const getStockTransactionById = async (
  id: string,
  companyId: string
) => {
  return await StockTransaction.findOne({
    where: { id, companyId },
  });
};

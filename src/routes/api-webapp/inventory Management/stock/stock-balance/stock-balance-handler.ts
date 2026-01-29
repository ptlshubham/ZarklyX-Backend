import { StockBalance } from "./stock-balance-model";
import { Transaction } from "sequelize";

export const upsertStockBalance = async (
  companyId: string,
  warehouseId: string,
  itemId: string,
  qtyChange: number,
  t: Transaction
) => {
  const [stock] = await StockBalance.findOrCreate({
    where: { companyId, warehouseId, itemId },
    defaults: { companyId, warehouseId, itemId, quantity: 0 },
    transaction: t,
    lock: t.LOCK.UPDATE,
  });

  if (stock.quantity + qtyChange < 0) {
    throw new Error("Stock cannot be negative");
  }

  await stock.update(
    { quantity: stock.quantity + qtyChange },
    { transaction: t }
  );
};

export const getAllStockBalances = async (companyId: string) => {
  return await StockBalance.findAll({
    where: { companyId },
    order: [["updatedAt", "DESC"]],
  });
};

export const getStockByWarehouse = async (
  companyId: string,
  warehouseId: string
) => {
  return await StockBalance.findAll({
    where: { companyId, warehouseId },
    order: [["updatedAt", "DESC"]],
  });
};

export const getStockByItem = async (companyId: string, itemId: string) => {
  return await StockBalance.findAll({
    where: { companyId, itemId },
    order: [["updatedAt", "DESC"]],
  });
};

export const getStock = async (
  companyId: string,
  warehouseId: string,
  itemId: string
) => {
  return await StockBalance.findOne({
    where: { companyId, warehouseId, itemId },
  });
};

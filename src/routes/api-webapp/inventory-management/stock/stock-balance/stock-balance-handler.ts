import { StockBalance } from "./stock-balance-model";
import { Transaction } from "sequelize";

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

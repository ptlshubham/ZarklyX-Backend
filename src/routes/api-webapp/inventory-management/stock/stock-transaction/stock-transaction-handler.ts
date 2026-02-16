import { StockTransaction } from "./stock-transaction-model";
import { StockBalance } from "../stock-balance/stock-balance-model";
import { Transaction } from "sequelize";


export const createStockTransaction = async (
  data: any,
  transaction: Transaction
) => {
  return await StockTransaction.create(data, { transaction });
};

export const getOrCreateStockBalance = async (
  where: {
    companyId: string;
    warehouseId: string;
    itemId: string;
  },
  transaction: Transaction
) => {
  const [stock] = await StockBalance.findOrCreate({
    where,
    defaults: { ...where, quantity: 0 },
    transaction,
    lock: transaction.LOCK.UPDATE,
  });

  return stock;
};

export const getStockBalanceForUpdate = async (
  where: {
    companyId: string;
    warehouseId: string;
    itemId: string;
  },
  transaction: Transaction
) => {
  return await StockBalance.findOne({
    where,
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
};

export const increaseStock = async (
  stock: StockBalance,
  quantity: number,
  transaction: Transaction
) => {
  await stock.increment("quantity", { by: quantity, transaction });
};

export const decreaseStock = async (
  stock: StockBalance,
  quantity: number,
  transaction: Transaction
) => {
  await stock.decrement("quantity", { by: quantity, transaction });
};

export const fetchStockTransactions = async (
  where: any
) => {
  return await StockTransaction.findAll({
    where,
    order: [["transactionDate", "DESC"]],
  });
};

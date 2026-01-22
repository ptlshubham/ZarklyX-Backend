import { Op, Transaction } from "sequelize";
import { ExpenseItem } from "./expense-item-model";

// Create a new item
export async function createExpenseItem(body: any, t: Transaction) {
  return await ExpenseItem.create(body, { transaction: t });
}

// Get all active expenses items by company
export const getActiveExpenseItemsByCompany = async (companyId: string) => {
  const whereClause: any = { 
    companyId, 
    isActive: true, 
    isDeleted: false 
  };

  return await ExpenseItem.findAll({
    where: whereClause,
    order: [["expenseName", "ASC"]],
  });
};

// Get all expenses items (including inactive) by company
export const getAllExpenseItemsByCompany = async (companyId: string) => {
  const whereClause: any = { 
    companyId, 
    isDeleted: false 
  };

  return await ExpenseItem.findAll({
    where: whereClause,
    order: [["expenseName", "ASC"]],
  });
};

// Get single expense item by id
export const getExpenseItemById = async (id: string, companyId: string) => {
  return await ExpenseItem.findOne({
    where: { id, companyId, isDeleted: false },
  });
};

// Update expense item
export const updateExpenseItem = async (id: string, companyId: string, body: any, t: Transaction) => {
  return await ExpenseItem.update(
    body,
    { 
      where: { id, companyId, isDeleted: false }, 
      transaction: t 
    }
  );
};

// soft delete expense item
export const deactivateExpenseItem = async (id: string, companyId: string, t: Transaction) => {
  return await ExpenseItem.update(
    { isActive: false, isDeleted: true },
    { 
      where: { id, companyId, isDeleted: false }, 
      transaction: t 
    }
  );
};

// Activate expense item
export const activateExpenseItem = async (id: string, companyId: string, t: Transaction) => {
  return await ExpenseItem.update(
    { isActive: true, isDeleted: false },
    { 
      where: { id, companyId, isDeleted: false }, 
      transaction: t 
    }
  );
};

// hard delete expense item
export const deleteExpenseItem = async (id: string, companyId: string, t: Transaction) => {
  return await ExpenseItem.destroy(
    { 
      where: { id, companyId }, 
      transaction: t 
    }
  );
};

// Search items by multiple optional fields
export const searchExpenseItems = async (
  companyId: string,
  filters: {
    expenseName?: string;
  }
) => {
  const whereConditions: any = {
    companyId,
    isActive: true,
    isDeleted: false,
  };

  // Search by item name
  if (filters.expenseName) {
    whereConditions.itemName = {
      [Op.like]: `%${filters.expenseName}%`
    };
  }

  return await ExpenseItem.findAll({
    where: whereConditions,
    order: [["expenseName", "ASC"]],
    limit: 50,
  });
};

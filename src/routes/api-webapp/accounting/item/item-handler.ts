import { Op, Transaction } from "sequelize";
import { Item } from "./item-model";
import { Unit } from "../unit/unit-model";

// Create a new item
export async function createItem(body: any, t: Transaction) {
  return await Item.create(body, { transaction: t });
}

// Get all active items by company
export const getActiveItemsByCompany = async (companyId: string, itemType?: 'product' | 'service') => {
  const whereClause: any = { 
    companyId, 
    isActive: true, 
    isDeleted: false 
  };
  
  if (itemType) {
    whereClause.itemType = itemType;
  }

  return await Item.findAll({
    where: whereClause,
    include: [
      {
        model: Unit,
        as: 'unit',
        attributes: ['id', 'unitName', 'unitCode']
      }
    ],
    order: [["itemName", "ASC"]],
  });
};

// Get all items (including inactive) by company
export const getAllItemsByCompany = async (companyId: string, itemType?: 'product' | 'service') => {
  const whereClause: any = { 
    companyId, 
    isDeleted: false 
  };
  
  if (itemType) {
    whereClause.itemType = itemType;
  }

  return await Item.findAll({
    where: whereClause,
    include: [
      {
        model: Unit,
        as: 'unit',
        attributes: ['id', 'unitName', 'unitCode']
      }
    ],
    order: [["itemName", "ASC"]],
  });
};

// Get single item by id
export const getItemById = async (id: string, companyId: string) => {
  return await Item.findOne({
    where: { id, companyId, isDeleted: false },
    include: [
      {
        model: Unit,
        as: 'unit',
        attributes: ['id', 'unitName', 'unitCode']
      }
    ],
  });
};

// Update item
export const updateItem = async (id: string, companyId: string, body: any, t: Transaction) => {
  return await Item.update(
    body,
    { 
      where: { id, companyId, isDeleted: false }, 
      transaction: t 
    }
  );
};

// soft delete item
export const deactivateItem = async (id: string, companyId: string, t: Transaction) => {
  return await Item.update(
    { isActive: false, isDeleted: true },
    { 
      where: { id, companyId, isDeleted: false }, 
      transaction: t 
    }
  );
};

// Activate item
export const activateItem = async (id: string, companyId: string, t: Transaction) => {
  return await Item.update(
    { isActive: true, isDeleted: false },
    { 
      where: { id, companyId, isDeleted: false }, 
      transaction: t 
    }
  );
};

// hard delete item
export const deleteItem = async (id: string, companyId: string, t: Transaction) => {
  return await Item.destroy(
    { 
      where: { id, companyId }, 
      transaction: t 
    }
  );
};

// Search items by multiple optional fields
export const searchItems = async (
  companyId: string,
  filters: {
    itemName?: string;
    itemType?: 'product' | 'service';
    sku?: string;
    minPrice?: number;
    maxPrice?: number;
    minQuantity?: number;
    maxQuantity?: number;
    unitId?: string;
  }
) => {
  const whereConditions: any = {
    companyId,
    isActive: true,
    isDeleted: false,
  };

  // Search by item name
  if (filters.itemName) {
    whereConditions.itemName = {
      [Op.like]: `%${filters.itemName}%`
    };
  }

  // Filter by item type
  if (filters.itemType) {
    whereConditions.itemType = filters.itemType;
  }

  // Search by SKU
  if (filters.sku) {
    whereConditions.sku = {
      [Op.like]: `%${filters.sku}%`
    };
  }

  // Filter by price range
  if (filters.minPrice !== undefined || filters.maxPrice !== undefined) {
    whereConditions.unitPrice = {};
    if (filters.minPrice !== undefined) {
      whereConditions.unitPrice[Op.gte] = filters.minPrice;
    }
    if (filters.maxPrice !== undefined) {
      whereConditions.unitPrice[Op.lte] = filters.maxPrice;
    }
  }

  // Filter by quantity range (for products)
  if (filters.minQuantity !== undefined || filters.maxQuantity !== undefined) {
    whereConditions.quantity = {};
    if (filters.minQuantity !== undefined) {
      whereConditions.quantity[Op.gte] = filters.minQuantity;
    }
    if (filters.maxQuantity !== undefined) {
      whereConditions.quantity[Op.lte] = filters.maxQuantity;
    }
  }

  // Filter by unit
  if (filters.unitId) {
    whereConditions.unitId = filters.unitId;
  }

  return await Item.findAll({
    where: whereConditions,
    include: [
      {
        model: Unit,
        as: 'unit',
        attributes: ['id', 'unitName', 'unitCode']
      }
    ],
    order: [["itemName", "ASC"]],
    limit: 50,
  });
};

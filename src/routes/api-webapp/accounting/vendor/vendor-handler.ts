import { Op, Transaction } from "sequelize";
import { Vendor } from "./vendor-model";

// Create a new vendor
export async function createVendor(body: any, t: Transaction) {
  return await Vendor.create(body, { transaction: t });
}

// Get all active vendors by company
export const getActiveVendorsByCompany = async (companyId: string) => {
  return await Vendor.findAll({
    where: { 
      companyId, 
      isActive: true, 
      isDeleted: false 
    },
    order: [["companyName", "ASC"]],
  });
};

// Get all vendors (including inactive) by company
export const getAllVendorsByCompany = async (companyId: string) => {
  return await Vendor.findAll({
    where: { 
      companyId, 
      isDeleted: false 
    },
    order: [["companyName", "ASC"]],
  });
};

// Get single vendor by id
export const getVendorById = async (id: string, companyId: string) => {
  return await Vendor.findOne({
    where: { id, companyId, isDeleted: false },
  });
};

// Update vendor
export const updateVendor = async (id: string, companyId: string, body: any, t: Transaction) => {
  return await Vendor.update(
    body,
    { 
      where: { id, companyId, isDeleted: false }, 
      transaction: t 
    }
  );
};

// Deactivate vendor
export const deactivateVendor = async (id: string, companyId: string, t: Transaction) => {
  return await Vendor.update(
    { isActive: false },
    { 
      where: { id, companyId, isDeleted: false }, 
      transaction: t 
    }
  );
};

// Activate vendor
export const activateVendor = async (id: string, companyId: string, t: Transaction) => {
  return await Vendor.update(
    { isActive: true },
    { 
      where: { id, companyId, isDeleted: false }, 
      transaction: t 
    }
  );
};

// Soft delete vendor
export const deleteVendor = async (id: string, companyId: string, t: Transaction) => {
  return await Vendor.update(
    { isDeleted: true, isActive: false },
    { 
      where: { id, companyId, isDeleted: false }, 
      transaction: t 
    }
  );
};

// Search vendors by multiple optional fields
export const searchVendors = async (
  companyId: string, 
  filters: {
    companyName?: string;
    contactPerson?: string;
    email?: string;
    phone?: string;
    city?: string;
  }
) => {
  const whereConditions: any[] = [];

  // Build search conditions for each provided filter
  if (filters.companyName) {
    whereConditions.push({
      companyName: {
        [Op.like]: `%${filters.companyName}%`
      }
    });
  }

  if (filters.contactPerson) {
    whereConditions.push({
      contactPerson: {
        [Op.like]: `%${filters.contactPerson}%`
      }
    });
  }

  if (filters.email) {
    whereConditions.push({
      email: {
        [Op.like]: `%${filters.email}%`
      }
    });
  }

  if (filters.phone) {
    whereConditions.push({
      phone: {
        [Op.like]: `%${filters.phone}%`
      }
    });
  }

  if (filters.city) {
    whereConditions.push({
      city: {
        [Op.like]: `%${filters.city}%`
      }
    });
  }

  // If no filters provided, return empty array
  if (whereConditions.length === 0) {
    return [];
  }

  return await Vendor.findAll({
    where: {
      companyId,
      isActive: true,
      isDeleted: false,
      [Op.and]: whereConditions
    },
    order: [["companyName", "ASC"]],
    limit: 50,
  });
};

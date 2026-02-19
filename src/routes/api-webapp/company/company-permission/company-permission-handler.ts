import { Transaction } from "sequelize";
import { CompanyPermission } from "./company-permission-model";
import { Permissions } from "../../../api-webapp/superAdmin/permissions/permissions-model";
import { Company } from "../company-model";

/**
 * Create a single company permission addon
 */
export async function createCompanyPermission(
  companyId: string,
  permissionId: string,
  price: number,
  source: "plan" | "addon" = "addon",
  subscriptionId: string | null = null,
  isActive: boolean = true,
  transaction?: Transaction
): Promise<CompanyPermission | null> {
  try {
    // Check if company exists
    const company = await Company.findByPk(companyId);
    if (!company) return null;

    // Check if permission exists
    const permission = await Permissions.findByPk(permissionId);
    if (!permission) return null;

    // Check for existing record
    const existing = await CompanyPermission.findOne({
      where: { companyId, permissionId },
      transaction,
    });

    if (existing) return null; // Already exists

    const companyPermission = await CompanyPermission.create(
      {
        companyId,
        permissionId,
        subscriptionId, // NULL for separately purchased addons
        source,
        purchaseDate: new Date(),
        price,
        isActive,
        isDeleted: false,
      },
      { transaction }
    );

    return companyPermission;
  } catch (error) {
    console.error("Error creating company permission:", error);
    throw error;
  }
}

/**
 * Bulk create company permission addons
 */
export async function bulkCreateCompanyPermissions(
  companyId: string,
  permissions: Array<{ permissionId: string; subscriptionId?: string | null; price: number }>,
  source: "plan" | "addon" = "addon",
  transaction?: Transaction
): Promise<CompanyPermission[]> {
  try {
    // Check if company exists
    const company = await Company.findByPk(companyId);
    if (!company) throw new Error("Company not found");

    const permissionIds = permissions.map((p) => p.permissionId);

    // Check if permissions exist
    const permissionRecords = await Permissions.findAll({
      where: { id: permissionIds, isActive: true, isDeleted: false },
    });

    if (permissionRecords.length !== permissionIds.length) {
      throw new Error("One or more permissions not found or inactive");
    }

    // Filter out existing records
    const existingRecords = await CompanyPermission.findAll({
      where: { companyId, permissionId: permissionIds },
      attributes: ["permissionId"],
      transaction,
    });

    const existingPermissionIds = new Set(
      existingRecords.map((r) => r.permissionId)
    );

    const newPermissions = permissions.filter(
      (p) => !existingPermissionIds.has(p.permissionId)
    );

    if (newPermissions.length === 0) {
      return []; // All already exist
    }

    const companyPermissions = await CompanyPermission.bulkCreate(
      newPermissions.map((p) => ({
        companyId,
        permissionId: p.permissionId,
        subscriptionId: p.subscriptionId ?? null, // NULL for separately purchased addons
        source,
        purchaseDate: new Date(),
        price: p.price,
        isActive: true,
        isDeleted: false,
      })),
      { transaction, ignoreDuplicates: true }
    );

    return companyPermissions;
  } catch (error) {
    console.error("Error bulk creating company permissions:", error);
    throw error;
  }
}

/**
 * Get all permission addons for a company
 */
export async function getPermissionsByCompanyId(
  companyId: string,
  includeInactive: boolean = false
): Promise<CompanyPermission[]> {
  try {
    const where: any = { companyId, isDeleted: false };

    if (!includeInactive) {
      where.isActive = true;
    }

    const companyPermissions = await CompanyPermission.findAll({
      where,
      include: [
        {
          model: Permissions,
          as: "permission",
          attributes: ["id", "name", "description", "action", "moduleId", "price"],
        },
      ],
      order: [["purchaseDate", "DESC"]],
    });

    return companyPermissions;
  } catch (error) {
    console.error("Error fetching company permissions:", error);
    throw error;
  }
}

/**
 * Get company permissions by source
 */
export async function getCompanyPermissionsBySource(
  companyId: string,
  source: "plan" | "addon"
): Promise<CompanyPermission[]> {
  try {
    const companyPermissions = await CompanyPermission.findAll({
      where: {
        companyId,
        source,
        isActive: true,
        isDeleted: false,
      },
      include: [
        {
          model: Permissions,
          as: "permission",
          attributes: ["id", "name", "description", "action", "moduleId"],
        },
      ],
      order: [["purchaseDate", "DESC"]],
    });

    return companyPermissions;
  } catch (error) {
    console.error("Error fetching company permissions by source:", error);
    throw error;
  }
}

/**
 * Update company permission
 */
export async function updateCompanyPermission(
  id: string,
  updates: {
    price?: number;
    source?: "plan" | "addon";
    isActive?: boolean;
  },
  transaction?: Transaction
): Promise<CompanyPermission | null> {
  try {
    const companyPermission = await CompanyPermission.findOne({
      where: { id, isDeleted: false },
      lock: transaction ? Transaction.LOCK.UPDATE : undefined,
      transaction,
    });

    if (!companyPermission) return null;

    await companyPermission.update(updates, { transaction });

    return companyPermission;
  } catch (error) {
    console.error("Error updating company permission:", error);
    throw error;
  }
}

/**
 * Delete (soft delete) company permission
 */
export async function deleteCompanyPermission(
  id: string,
  transaction?: Transaction
): Promise<boolean> {
  try {
    const companyPermission = await CompanyPermission.findOne({
      where: { id, isDeleted: false },
      lock: transaction ? Transaction.LOCK.UPDATE : undefined,
      transaction,
    });

    if (!companyPermission) return false;

    await companyPermission.update(
      { isDeleted: true, isActive: false },
      { transaction }
    );

    return true;
  } catch (error) {
    console.error("Error deleting company permission:", error);
    throw error;
  }
}

/**
 * Delete all permission addons for a company
 */
export async function deleteAllCompanyPermissions(
  companyId: string,
  transaction?: Transaction
): Promise<number> {
  try {
    const [affectedCount] = await CompanyPermission.update(
      { isDeleted: true, isActive: false },
      {
        where: { companyId, isDeleted: false },
        transaction,
      }
    );

    return affectedCount;
  } catch (error) {
    console.error("Error deleting all company permissions:", error);
    throw error;
  }
}

/**
 * Calculate total cost of company permission addons
 */
export async function calculateCompanyPermissionCost(
  companyId: string
): Promise<number> {
  try {
    const permissions = await CompanyPermission.findAll({
      where: {
        companyId,
        source: "addon",
        isActive: true,
        isDeleted: false,
      },
      attributes: ["price"],
    });

    const total = permissions.reduce(
      (sum, permission) => sum + parseFloat(permission.price.toString()),
      0
    );

    return total;
  } catch (error) {
    console.error("Error calculating company permission cost:", error);
    throw error;
  }
}

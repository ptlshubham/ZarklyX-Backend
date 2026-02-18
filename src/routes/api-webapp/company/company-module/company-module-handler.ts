import { Transaction } from "sequelize";
import { CompanyModule } from "../../../api-webapp/company/company-module/company-module-model";
import { Modules } from "../../../api-webapp/superAdmin/modules/modules-model";
import { CompanyPermission } from "../../../api-webapp/company/company-permission/company-permission-model";
import { Permissions } from "../../../api-webapp/superAdmin/permissions/permissions-model";

// Create a new company module mapping
export const createCompanyModule = async (fields: {
  companyId: string;
  moduleId: string;
  subscriptionId?: string | null;
  source?: "plan" | "addon";
  price?: number;
  isActive?: boolean;
  isDeleted?: boolean;
}, t: Transaction) => {
  return await CompanyModule.create({
    ...fields,
    subscriptionId: fields.subscriptionId ?? null, // NULL for separately purchased addons
    source: fields.source ?? "addon",
    price: fields.price ?? 0,
    isActive: fields.isActive ?? true,
    isDeleted: fields.isDeleted ?? false,
    purchaseDate: new Date(),
  }, { transaction: t });
};

// Bulk create company modules (for subscription plan modules or addon purchases)
export const bulkCreateCompanyModules = async (
  companyId: string,
  modules: Array<{ moduleId: string; subscriptionId?: string | null; source?: "plan" | "addon"; price?: number }>,
  t: Transaction
) => {
  const moduleMappings = modules.map(module => ({
    companyId,
    moduleId: module.moduleId,
    subscriptionId: module.subscriptionId ?? null, // NULL for separately purchased addons
    source: module.source || "addon",
    price: module.price || 0,
    isActive: true,
    isDeleted: false,
    purchaseDate: new Date(),
  }));
  return await CompanyModule.bulkCreate(moduleMappings, { transaction: t });
};

// Get all company modules
export const getCompanyModules = async () => {
  return await CompanyModule.findAll();
};

// Get active company modules
export const getActiveCompanyModules = async () => {
  return await CompanyModule.findAll({
    where: { isActive: true, isDeleted: false },
  });
};

// Get company module by ID
export const getCompanyModuleById = async (id: string) => {
  return await CompanyModule.findOne({
    where: { id, isActive: true, isDeleted: false },
  });
};

// Get modules by company ID (critical for RBAC - check what modules a company has access to)
export const getModulesByCompanyId = async (companyId: string) => {
  return await CompanyModule.findAll({
    where: { companyId, isActive: true, isDeleted: false },
  });
};

// Check if company has access to a specific module
export const checkCompanyModuleAccess = async (companyId: string, moduleId: string) => {
  const module = await CompanyModule.findOne({
    where: { companyId, moduleId, isActive: true, isDeleted: false },
  });
  return !!module;
};

// Update company module
export const updateCompanyModule = async (id: string, updateFields: any, t: Transaction) => {
  const [affectedRows] = await CompanyModule.update(
    updateFields,
    { where: { id }, transaction: t }
  );
  return affectedRows > 0;
};

// Delete company module (soft delete)
export const deleteCompanyModule = async (id: string, t: Transaction) => {
  await CompanyModule.update(
    { isActive: false, isDeleted: true },
    { where: { id }, transaction: t }
  );
  return true;
};

// Disable all modules for a company (used when subscription expires)
export const disableAllCompanyModules = async (companyId: string, t: Transaction) => {
  await CompanyModule.update(
    { isActive: false, isDeleted: true },
    { where: { companyId }, transaction: t }
  );
  return true;
};

// Get company modules with their associated permissions
export const getCompanyModulesWithPermissions = async (companyId: string) => {
  // Get all active company modules
  const companyModules = await CompanyModule.findAll({
    where: { companyId, isActive: true, isDeleted: false },
    include: [{
      model: Modules,
      as: "module",
      attributes: ['id', 'name', 'description', 'price'],
    }],
  });

  // Get all active company permissions
  const companyPermissions = await CompanyPermission.findAll({
    where: { companyId, isActive: true, isDeleted: false },
    include: [{
      model: Permissions,
      as: "permission",
      attributes: ['id', 'name', 'description', 'action', 'moduleId', 'price'],
    }],
  });

  // Group permissions by moduleId
  const permissionsByModule = companyPermissions.reduce((acc, cp) => {
    const moduleId = (cp as any).permission?.moduleId;
    if (moduleId) {
      if (!acc[moduleId]) acc[moduleId] = [];
      acc[moduleId].push({
        id: cp.id,
        permissionId: cp.permissionId,
        permissionName: (cp as any).permission?.name,
        permissionDescription: (cp as any).permission?.description,
        action: (cp as any).permission?.action,
        source: cp.source,
        purchaseDate: cp.purchaseDate,
        price: cp.price,
      });
    }
    return acc;
  }, {} as Record<string, any[]>);

  // Combine modules with their permissions
  const modulesWithPermissions = companyModules.map(cm => ({
    id: cm.id,
    moduleId: cm.moduleId,
    moduleName: (cm as any).module?.name,
    moduleDescription: (cm as any).module?.description,
    source: cm.source,
    purchaseDate: cm.purchaseDate,
    price: cm.price,
    permissions: permissionsByModule[cm.moduleId] || [],
  }));

  return modulesWithPermissions;
};

import { Transaction } from "sequelize";
import { Modules } from "../../../api-webapp/superAdmin/modules/modules-model";
import { Permissions } from "../../../api-webapp/superAdmin/permissions/permissions-model";

// Create a new permission
export const createPermission = async (fields: {
  name: string;
  description: string;
  displayName: string;
  moduleId: string;
  action: string;
  price: number;
  isActive?: boolean;
  isDeleted?: boolean;
  isSystemPermission?: boolean;
  isSubscriptionExempt?: boolean;
  isFreeForAll?: boolean;
}, t: Transaction) => {
  return await Permissions.create({
    name: fields.name,
    description: fields.description,
    displayName: fields.displayName,
    moduleId: fields.moduleId,
    action: fields.action,
    price: fields.price,
    isActive: fields.isActive !== undefined ? fields.isActive : true,
    isDeleted: fields.isDeleted !== undefined ? fields.isDeleted : false,
    isSystemPermission: fields.isSystemPermission !== undefined ? fields.isSystemPermission : false,
    isSubscriptionExempt: fields.isSubscriptionExempt !== undefined ? fields.isSubscriptionExempt : false,
    isFreeForAll: fields.isFreeForAll !== undefined ? fields.isFreeForAll : false,
  }, { transaction: t });
};

// Bulk create permissions
export const createPermissions = async (
  permissionsArray: Array<{
    name: string;
    description: string;
    displayName: string;
    moduleId: string;
    action: string;
    price: number;
    isActive?: boolean;
    isDeleted?: boolean;
    isSystemPermission?: boolean;
    isSubscriptionExempt?: boolean;
    isFreeForAll?: boolean;
  }>,
  t: Transaction
) => {
  const createdPermissions = [];
  const errors = [];

  for (const fields of permissionsArray) {
    try {
      const permission = await Permissions.create({
        name: fields.name,
        description: fields.description,
        displayName: fields.displayName,
        moduleId: fields.moduleId,
        action: fields.action,
        price: fields.price,
        isActive: fields.isActive !== undefined ? fields.isActive : true,
        isDeleted: fields.isDeleted !== undefined ? fields.isDeleted : false,
        isSystemPermission: fields.isSystemPermission !== undefined ? fields.isSystemPermission : false,
        isSubscriptionExempt: fields.isSubscriptionExempt !== undefined ? fields.isSubscriptionExempt : false,
        isFreeForAll: fields.isFreeForAll !== undefined ? fields.isFreeForAll : false,
      }, { transaction: t });
      createdPermissions.push(permission);
    } catch (error: any) {
      errors.push({
        permission: fields.name,
        error: error.message || "Failed to create permission",
      });
    }
  }

  return {
    created: createdPermissions,
    errors: errors,
    total: permissionsArray.length,
    success: createdPermissions.length,
    failed: errors.length,
  };
};

// Get all permissions
export const getAllPermissions = async () => {
  return await Permissions.findAll({
    include: [
      {
        model: Modules,
        as: "module"
      }
    ]
  });
};

export const getActivePermissions = async () => {
  return await Permissions.findAll({
    where: { isActive: true, isDeleted: false }
  })
}

// Get permission by ID
export const getPermissionById = async (id: string) => {
  return await Permissions.findOne({
    where: { id: id, isActive: true },
  });
};

// Get permissions by module ID
export const getPermissionsByModuleId = async (moduleId: string) => {
  return await Permissions.findAll({
    where: { moduleId: moduleId, isActive: true, isDeleted: false },
    include: [
      {
        model: Modules,
        as: "module"
      }
    ]
  })
}

// Update permission
export const updatePermission = async (id: string, updateFields: any, t: Transaction) => {
  const permission = await Permissions.findOne({
    where: { id: id, isActive: true, isDeleted: false },
  });
  if (!permission) return null;
  await permission.update(updateFields, { transaction: t });
  await permission.reload();
  return permission;
};

// Delete permission (soft delete)
export const deletePermission = async (id: string, t: Transaction) => {
  const permission = await Permissions.findByPk(id);
  if (!permission) return false;
  await permission.update({ isActive: false, isDeleted: true }, { transaction: t });
  return true;
};

// Toggle permission active status
export const togglePermissionActive = async (id: string, t: Transaction) => {
  const permission = await Permissions.findByPk(id);
  if (!permission) return null;
  permission.isActive = !permission.isActive;
  await permission.save({ transaction: t });
  return permission;
};

// Hard delete permission (permanent deletion from database)
export const hardDeletePermission = async (id: string, t: Transaction) => {
  const permission = await Permissions.findByPk(id);
  if (!permission) return false;
  await permission.destroy({ transaction: t });
  return true;
};

// Get all permissions grouped by modules in hierarchical structure
export const getPermissionsByModules = async () => {
  // Fetch all modules with their permissions
  const modules = await Modules.findAll({
    where: { isDeleted: false },
    include: [
      {
        model: Permissions,
        as: "permissions",
        where: { isDeleted: false },
        required: false,
        attributes: ["id", "name", "description", "displayName", "action", "price", "isSystemPermission", "isSubscriptionExempt", "isFreeForAll", "isActive"],
      }
    ],
    order: [
      ["name", "ASC"],
      [{ model: Permissions, as: "permissions" }, "action", "ASC"]
    ],
    raw: false, // Need nested objects
  });

  // Convert to plain objects and build hierarchy
  const modulesData = modules.map(m => m.toJSON());
  
  // Create a map for quick lookup
  const moduleMap = new Map();
  const rootModules: any[] = [];

  // First pass: Create module objects with children arrays
  modulesData.forEach((module: any) => {
    moduleMap.set(module.id, { ...module, children: [] });
  });

  // Second pass: Build hierarchy
  modulesData.forEach((module: any) => {
    const moduleWithChildren = moduleMap.get(module.id);
    if (module.parentModuleId) {
      const parent = moduleMap.get(module.parentModuleId);
      if (parent) {
        parent.children.push(moduleWithChildren);
      } else {
        // If parent not found, treat as root
        rootModules.push(moduleWithChildren);
      }
    } else {
      // Root module (no parent)
      rootModules.push(moduleWithChildren);
    }
  });

  return rootModules;
};

// Get active permissions grouped by active modules in hierarchical structure
export const getActivePermissionsByModules = async () => {
  // Fetch all active modules with their active permissions
  const modules = await Modules.findAll({
    where: { isActive: true, isDeleted: false },
    include: [
      {
        model: Permissions,
        as: "permissions",
        where: { isActive: true, isDeleted: false },
        required: false,
        attributes: ["id", "name", "description", "displayName", "action", "price", "isSystemPermission", "isSubscriptionExempt", "isFreeForAll", "isActive"],
      }
    ],
    order: [
      ["name", "ASC"],
      [{ model: Permissions, as: "permissions" }, "action", "ASC"]
    ],
    raw: false, // Need nested objects
  });

  // Convert to plain objects and build hierarchy
  const modulesData = modules.map(m => m.toJSON());
  
  // Create a map for quick lookup
  const moduleMap = new Map();
  const rootModules: any[] = [];

  // First pass: Create module objects with children arrays
  modulesData.forEach((module: any) => {
    moduleMap.set(module.id, { ...module, children: [] });
  });

  // Second pass: Build hierarchy
  modulesData.forEach((module: any) => {
    const moduleWithChildren = moduleMap.get(module.id);
    if (module.parentModuleId) {
      const parent = moduleMap.get(module.parentModuleId);
      if (parent) {
        parent.children.push(moduleWithChildren);
      } else {
        // If parent not found, treat as root
        rootModules.push(moduleWithChildren);
      }
    } else {
      // Root module (no parent)
      rootModules.push(moduleWithChildren);
    }
  });

  return rootModules;
};

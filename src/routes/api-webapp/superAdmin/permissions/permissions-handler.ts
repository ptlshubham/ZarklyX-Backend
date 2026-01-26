import { Transaction } from "sequelize";
import { Modules } from "../../../api-webapp/superAdmin/modules/modules-model";
import { Permissions } from "../../../api-webapp/superAdmin/permissions/permissions-model";

// Create a new permission
export const createPermission = async (fields: {
  name: string;
  description: string;
  moduleId: string;
  action: string;
  isActive?: boolean;
  isDeleted?: boolean;
  isSystemPermission?: boolean;
  isSubscriptionExempt?: boolean;
}, t: Transaction) => {
  return await Permissions.create({
    ...fields,
    isActive: fields.isActive !== undefined ? fields.isActive : true,
    isDeleted: fields.isDeleted !== undefined ? fields.isDeleted : false,
    isSystemPermission: fields.isSystemPermission !== undefined ? fields.isSystemPermission : false,
    isSubscriptionExempt: fields.isSubscriptionExempt !== undefined ? fields.isSubscriptionExempt : false,
  }, { transaction: t });
};

// Bulk create permissions
export const createPermissions = async (
  permissionsArray: Array<{
    name: string;
    description: string;
    moduleId: string;
    action: string;
    isActive?: boolean;
    isDeleted?: boolean;
    isSystemPermission?: boolean;
    isSubscriptionExempt?: boolean;
  }>,
  t: Transaction
) => {
  const createdPermissions = [];
  const errors = [];

  for (const fields of permissionsArray) {
    try {
      const permission = await Permissions.create({
        ...fields,
        isActive: fields.isActive !== undefined ? fields.isActive : true,
        isDeleted: fields.isDeleted !== undefined ? fields.isDeleted : false,
        isSystemPermission: fields.isSystemPermission !== undefined ? fields.isSystemPermission : false,
        isSubscriptionExempt: fields.isSubscriptionExempt !== undefined ? fields.isSubscriptionExempt : false,
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
  return await Permissions.findAll();
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

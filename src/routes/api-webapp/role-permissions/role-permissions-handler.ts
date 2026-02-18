import { Transaction, Op } from "sequelize";
import { RolePermissions } from "../../api-webapp/role-permissions/role-permissions-model";
import { Role } from "../../api-webapp/roles/role-model";
import { Permissions } from "../../api-webapp/superAdmin/permissions/permissions-model";

/**
 * Assign a permission to a role
 */
export async function assignPermissionToRole(
  roleId: string,
  permissionId: string,
  transaction: Transaction
) {
  // Check if already assigned
  const existing = await RolePermissions.findOne({
    where: { roleId, permissionId },
    transaction,
  });

  if (existing) {
    return existing;
  }

  return await RolePermissions.create(
    { roleId, permissionId },
    { transaction }
  );
}

/**
 * Bulk assign permissions to a role
 */
export async function assignBulkPermissionsToRole(
  roleId: string,
  permissionIds: string[],
  transaction: Transaction
) {
  if (permissionIds.length === 0) return [];

  const existingAssignments = await RolePermissions.findAll({
    where: {
      roleId,
      permissionId: {
        [Op.in]: permissionIds,
      },
    },
    transaction,
  });

  const existingPermissionIds = new Set(
    existingAssignments.map(a => a.permissionId)
  );

  const newAssignments = permissionIds
    .filter(pid => !existingPermissionIds.has(pid))
    .map(permissionId => ({
      roleId,
      permissionId,
    }));

  if (newAssignments.length === 0) {
    return existingAssignments;
  }

  const created = await RolePermissions.bulkCreate(newAssignments, {
    transaction,
    ignoreDuplicates: true,
  });

  return [...existingAssignments, ...created];
}

/**
 * Remove a permission from a role
 */
export async function removePermissionFromRole(
  roleId: string,
  permissionId: string,
  transaction?: Transaction
) {
  const deleted = await RolePermissions.destroy({
    where: { roleId, permissionId },
    transaction,
  });

  return deleted > 0;
}

/**
 * Bulk remove permissions from a role
 */
export async function removePermissionsFromRole(
  roleId: string,
  permissionIds: string[],
  transaction?: Transaction
) {
  const deleted = await RolePermissions.destroy({
    where: {
      roleId,
      permissionId: { [Op.in]: permissionIds },
    },
    transaction,
  });

  return deleted;
}

/**
 * Get all permissions for a role
 */
export async function getRolePermissions(roleId: string) {
  return await RolePermissions.findAll({
    where: { roleId },
    include: [
      {
        model: Permissions,
        as: "permission",
      },
    ],
  });
}

/**
 * Get all roles that have a specific permission
 */
export async function getRolesWithPermission(permissionId: string) {
  return await RolePermissions.findAll({
    where: { permissionId },
    include: [
      {
        model: Role,
        as: "role",
      },
      {
        model: Permissions,
        as: "permissions",
      }
    ],
  });
}

/**
 * Check if a role has a specific permission
 */
export async function roleHasPermission(
  roleId: string,
  permissionId: string
): Promise<boolean> {
  const assignment = await RolePermissions.findOne({
    where: { roleId, permissionId },
  });

  return !!assignment;
}

/**
 * Replace all permissions for a role (sync permissions)
 */
export async function syncRolePermissions(
  roleId: string,
  permissionIds: string[],
  transaction?: Transaction
) {
  // Remove all existing permissions
  await RolePermissions.destroy({
    where: { roleId },
    transaction,
  });

  // Add new permissions
  const assignments = permissionIds.map((permissionId) => ({
    roleId,
    permissionId,
  }));

  if (assignments.length > 0) {
    return await RolePermissions.bulkCreate(assignments, { transaction });
  }

  return [];
}

/**
 * Get permission IDs for a role
 */
export async function getRolePermissionIds(roleId: string): Promise<string[]> {
  const rolePermissions = await RolePermissions.findAll({
    where: { roleId },
    attributes: ["permissionId"],
  });

  return rolePermissions.map((rp) => rp.permissionId);
}

/**
 * Clone permissions from one role to another
 */
export async function cloneRolePermissions(
  sourceRoleId: string,
  targetRoleId: string,
  transaction: Transaction
) {
  const sourcePermissions = await getRolePermissionIds(sourceRoleId);
  
  if (sourcePermissions.length === 0) {
    return [];
  }

  return await assignBulkPermissionsToRole(targetRoleId, sourcePermissions, transaction);
}

/**
 * Get count of permissions assigned to a role
 */
export async function getRolePermissionCount(roleId: string): Promise<number> {
  return await RolePermissions.count({
    where: { roleId },
  });
}

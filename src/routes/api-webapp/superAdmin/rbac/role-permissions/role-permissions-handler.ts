import { Op } from "sequelize";
import { ZarklyXRole } from "../../../../api-webapp/superAdmin/rbac/roles/roles-model";
import { ZarklyXPermission } from "../../../../api-webapp/superAdmin/rbac/permissions/permissions-model";
import { ZarklyXRolePermission } from "../../../../api-webapp/superAdmin/rbac/role-permissions/role-permissions-model";

/**
 * Assign permissions to a role (replaces existing permissions)
 */
export async function assignBulkPermissionsToRole(
  roleId: string,
  permissionIds: string[],
  assignedBy: string
) {
  try {
    // Input validation
    if (!permissionIds || permissionIds.length === 0) {
      return {
        success: false,
        message: "At least one permission ID is required",
      };
    }

    // Verify role exists
    const role = await ZarklyXRole.findOne({
      where: { id: roleId, isDeleted: false },
    });

    if (!role) {
      return {
        success: false,
        message: "Role not found",
      };
    }

    // Prevent modifying system role permissions
    if (role.isSystemRole) {
      return {
        success: false,
        message: "Cannot modify permissions of system roles",
      };
    }

    // Verify all permissions exist and are active
    const permissions = await ZarklyXPermission.findAll({
      where: {
        id: { [Op.in]: permissionIds },
        isActive: true,
        isDeleted: false,
      },
    });

    if (permissions.length !== permissionIds.length) {
      const foundIds = permissions.map((p) => p.id);
      const missingIds = permissionIds.filter((id) => !foundIds.includes(id));
      return {
        success: false,
        message: `Invalid or inactive permission IDs: ${missingIds.join(", ")}`,
      };
    }

    // Remove existing permissions for this role
    await ZarklyXRolePermission.destroy({
      where: { roleId },
    });

    // Create new role-permission associations
    const rolePermissions = permissionIds.map((permissionId) => ({
      roleId,
      permissionId,
    }));

    await ZarklyXRolePermission.bulkCreate(rolePermissions);

    console.log(`✅ ${permissionIds.length} permissions assigned to role ${roleId} by ${assignedBy}`);

    return {
      success: true,
      message: `${permissionIds.length} permission(s) assigned successfully`,
    };
  } catch (error: any) {
    return {
      success: false,
      message: error.message || "Failed to assign permissions",
    };
  }
}

/**
 * Add single permission to a role (does not replace existing)
 */
export async function addPermissionToRole(
  roleId: string,
  permissionId: string,
  assignedBy: string
) {
  try {
    // Verify role exists
    const role = await ZarklyXRole.findOne({
      where: { id: roleId, isDeleted: false },
    });

    if (!role) {
      return {
        success: false,
        message: "Role not found",
      };
    }

    // Prevent modifying system role permissions
    if (role.isSystemRole) {
      return {
        success: false,
        message: "Cannot modify permissions of system roles",
      };
    }

    // Verify permission exists
    const permission = await ZarklyXPermission.findOne({
      where: {
        id: permissionId,
        isActive: true,
        isDeleted: false,
      },
    });

    if (!permission) {
      return {
        success: false,
        message: "Permission not found or inactive",
      };
    }

    // Check if permission already assigned
    const existing = await ZarklyXRolePermission.findOne({
      where: { roleId, permissionId },
    });

    if (existing) {
      return {
        success: false,
        message: "Permission already assigned to this role",
      };
    }

    // Create role-permission association
    await ZarklyXRolePermission.create({
      roleId,
      permissionId,
    });

    console.log(`✅ Permission ${permissionId} added to role ${roleId} by ${assignedBy}`);

    return {
      success: true,
      message: "Permission added successfully",
    };
  } catch (error: any) {
    return {
      success: false,
      message: error.message || "Failed to add permission",
    };
  }
}

/**
 * Remove single permission from a role
 */
export async function removePermissionFromRole(
  roleId: string,
  permissionId: string,
  removedBy: string
) {
  try {
    // Verify role exists
    const role = await ZarklyXRole.findOne({
      where: { id: roleId, isDeleted: false },
    });

    if (!role) {
      return {
        success: false,
        message: "Role not found",
      };
    }

    // Prevent modifying system role permissions
    if (role.isSystemRole) {
      return {
        success: false,
        message: "Cannot modify permissions of system roles",
      };
    }

    // Remove the role-permission association
    const deleted = await ZarklyXRolePermission.destroy({
      where: { roleId, permissionId },
    });

    if (deleted === 0) {
      return {
        success: false,
        message: "Permission not assigned to this role",
      };
    }

    console.log(`✅ Permission ${permissionId} removed from role ${roleId} by ${removedBy}`);

    return {
      success: true,
      message: "Permission removed successfully",
    };
  } catch (error: any) {
    return {
      success: false,
      message: error.message || "Failed to remove permission",
    };
  }
}

/**
 * Get all permissions assigned to a role
 */
export async function getRolePermissions(roleId: string) {
  try {
    // Verify role exists
    const role = await ZarklyXRole.findOne({
      where: { id: roleId, isDeleted: false },
    });

    if (!role) {
      return {
        success: false,
        message: "Role not found",
      };
    }

    // Fetch all permissions for this role
    const rolePermissions = await ZarklyXRolePermission.findAll({
      where: { roleId },
      include: [
        {
          model: ZarklyXPermission,
          as: "permission",
          where: {
            isActive: true,
            isDeleted: false,
          },
          required: false, // LEFT JOIN to include roles with no permissions
        },
      ],
    });

    const permissions = rolePermissions
      .filter((rp: any) => rp.permission) // Filter out null permissions
      .map((rp: any) => rp.permission);

    return {
      success: true,
      data: {
        roleId,
        roleName: role.name,
        permissionCount: permissions.length,
        permissions,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      message: error.message || "Failed to fetch role permissions",
    };
  }
}

/**
 * Remove all permissions from a role
 */
export async function removeAllRolePermissions(
  roleId: string,
  removedBy: string
) {
  try {
    // Verify role exists
    const role = await ZarklyXRole.findOne({
      where: { id: roleId, isDeleted: false },
    });

    if (!role) {
      return {
        success: false,
        message: "Role not found",
      };
    }

    // Prevent modifying system role permissions
    if (role.isSystemRole) {
      return {
        success: false,
        message: "Cannot modify permissions of system roles",
      };
    }

    // Remove all permissions
    const deletedCount = await ZarklyXRolePermission.destroy({
      where: { roleId },
    });

    console.log(`✅ All ${deletedCount} permissions removed from role ${roleId} by ${removedBy}`);

    return {
      success: true,
      message: `${deletedCount} permission(s) removed successfully`,
    };
  } catch (error: any) {
    return {
      success: false,
      message: error.message || "Failed to remove permissions",
    };
  }
}

/**
 * Check if a role has a specific permission
 */
export async function checkRoleHasPermission(
  roleId: string,
  permissionId: string
) {
  try {
    const rolePermission = await ZarklyXRolePermission.findOne({
      where: { roleId, permissionId },
    });

    return {
      success: true,
      data: {
        hasPermission: !!rolePermission,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      message: error.message || "Failed to check permission",
    };
  }
}

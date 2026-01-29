import { Op } from "sequelize";
import { ZarklyXRole } from "../../../../api-webapp/superAdmin/rbac/roles/roles-model";
import { ZarklyXUser } from "../../../../api-webapp/superAdmin/authentication/user/user-model";

/**
 * Get all ZarklyX roles
 */
export async function getAllZarklyXRoles() {
  try {
    const roles = await ZarklyXRole.findAll({
      where: {
        isDeleted: false,
      },
      order: [["priority", "ASC"]],
    });

    return {
      success: true,
      data: { roles },
    };
  } catch (error: any) {
    return {
      success: false,
      message: error.message || "Failed to fetch roles",
    };
  }
}

/**
 * Get single ZarklyX role by ID
 */
export async function getZarklyXRoleById(roleId: string) {
  try {
    const role = await ZarklyXRole.findOne({
      where: { id: roleId, isDeleted: false },
    });

    if (!role) {
      return {
        success: false,
        message: "Role not found",
      };
    }

    return {
      success: true,
      data: { role },
    };
  } catch (error: any) {
    return {
      success: false,
      message: error.message || "Failed to fetch role",
    };
  }
}

/**
 * Create new ZarklyX role
 */
export async function createZarklyXRole(data: {
  name: string;
  description?: string;
  priority: number;
  isSystemRole?: boolean;
  baseRoleId?: string;
  createdBy: string;
}) {
  try {
    // Input validation
    if (!data.name?.trim()) {
      return {
        success: false,
        message: "Role name is required",
      };
    }

    // Priority validation (must be non-negative integer)
    if (typeof data.priority !== 'number' || data.priority < 0 || !Number.isInteger(data.priority)) {
      return {
        success: false,
        message: "Priority must be a non-negative integer",
      };
    }

    // Check if role with same name exists
    const existingRole = await ZarklyXRole.findOne({
      where: { name: data.name },
    });

    if (existingRole) {
      return {
        success: false,
        message: "Role with this name already exists",
      };
    }

    // If baseRoleId provided, verify it exists and prevent circular dependency
    if (data.baseRoleId) {
      const baseRole = await ZarklyXRole.findByPk(data.baseRoleId);
      if (!baseRole) {
        return {
          success: false,
          message: "Base role not found",
        };
      }

      // Check for circular dependency: baseRole should not have a baseRoleId chain that loops
      let currentRole = baseRole;
      const visited = new Set<string>([data.baseRoleId]);
      while (currentRole.baseRoleId) {
        if (visited.has(currentRole.baseRoleId)) {
          return {
            success: false,
            message: "Circular baseRoleId dependency detected",
          };
        }
        visited.add(currentRole.baseRoleId);
        const nextRole = await ZarklyXRole.findByPk(currentRole.baseRoleId);
        if (!nextRole) break;
        currentRole = nextRole;
      }
    }

    const newRole = await ZarklyXRole.create({
      name: data.name,
      description: data.description || null,
      priority: data.priority,
      isSystemRole: data.isSystemRole || false,
      baseRoleId: data.baseRoleId || null,
      isActive: true,
      isDeleted: false,
    });

    console.log(`✅ Role ${newRole.id} created by ${data.createdBy}`);

    return {
      success: true,
      message: "Role created successfully",
      data: { role: newRole },
    };
  } catch (error: any) {
    return {
      success: false,
      message: error.message || "Failed to create role",
    };
  }
}

/**
 * Update ZarklyX role
 */
export async function updateZarklyXRole(
  roleId: string,
  data: {
    name?: string;
    description?: string;
    priority?: number;
    isActive?: boolean;
  },
  updatedBy: string
) {
  try {
    const role = await ZarklyXRole.findOne({
      where: { id: roleId, isDeleted: false },
    });

    if (!role) {
      return {
        success: false,
        message: "Role not found",
      };
    }

    // Prevent editing system roles
    if (role.isSystemRole) {
      return {
        success: false,
        message: "System roles cannot be edited",
      };
    }

    // Prevent changing priority of system roles or to invalid values
    if (data.priority !== undefined) {
      if (typeof data.priority !== 'number' || data.priority < 0 || !Number.isInteger(data.priority)) {
        return {
          success: false,
          message: "Priority must be a non-negative integer",
        };
      }
    }

    // If name is being changed, check for duplicates
    if (data.name && data.name !== role.name) {
      if (!data.name.trim()) {
        return {
          success: false,
          message: "Role name cannot be empty",
        };
      }

      const existingRole = await ZarklyXRole.findOne({
        where: { name: data.name },
      });

      if (existingRole) {
        return {
          success: false,
          message: "Role with this name already exists",
        };
      }
    }

    await role.update(data);

    console.log(`✅ Role ${roleId} updated by ${updatedBy}`);

    return {
      success: true,
      message: "Role updated successfully",
      data: { role },
    };
  } catch (error: any) {
    return {
      success: false,
      message: error.message || "Failed to update role",
    };
  }
}

/**
 * Delete ZarklyX role
 */
export async function deleteZarklyXRole(roleId: string, deletedBy: string) {
  try {
    const role = await ZarklyXRole.findOne({
      where: { id: roleId, isDeleted: false },
    });

    if (!role) {
      return {
        success: false,
        message: "Role not found",
      };
    }

    // Prevent deleting system roles
    if (role.isSystemRole) {
      return {
        success: false,
        message: "System roles cannot be deleted",
      };
    }

    // Check if any users are assigned to this role
    const usersCount = await ZarklyXUser.count({
      where: {
        roleId,
        isDeleted: false,
      },
    });

    if (usersCount > 0) {
      return {
        success: false,
        message: `Cannot delete role. ${usersCount} user(s) are currently assigned to this role.`,
      };
    }

    await role.update({
      isDeleted: true,
      isActive: false,
    });

    console.log(`✅ Role ${roleId} deleted by ${deletedBy}`);

    return {
      success: true,
      message: "Role deleted successfully",
    };
  } catch (error: any) {
    return {
      success: false,
      message: error.message || "Failed to delete role",
    };
  }
}

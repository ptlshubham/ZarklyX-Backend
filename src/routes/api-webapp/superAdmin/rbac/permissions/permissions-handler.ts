import { Op } from "sequelize";
import { ZarklyXPermission } from "../../../../api-webapp/superAdmin/rbac/permissions/permissions-model";

/**
 * Get all ZarklyX permissions with optional filters
 */
export async function getAllZarklyXPermissions(params: {
  page?: number;
  limit?: number;
  search?: string;
  moduleId?: string;
  action?: string;
}) {
  try {
    const page = params.page || 1;
    const limit = params.limit || 50;
    const offset = (page - 1) * limit;

    const whereClause: any = {
      isDeleted: false,
    };

    if (params.search) {
      whereClause[Op.or] = [
        { name: { [Op.like]: `%${params.search}%` } },
        { description: { [Op.like]: `%${params.search}%` } },
      ];
    }

    if (params.moduleId) {
      whereClause.moduleId = params.moduleId;
    }

    if (params.action) {
      whereClause.action = params.action;
    }

    const { count, rows } = await ZarklyXPermission.findAndCountAll({
      where: whereClause,
      limit,
      offset,
      order: [["name", "ASC"]],
    });

    return {
      success: true,
      data: {
        permissions: rows,
        pagination: {
          total: count,
          page,
          limit,
          totalPages: Math.ceil(count / limit),
        },
      },
    };
  } catch (error: any) {
    return {
      success: false,
      message: error.message || "Failed to fetch permissions",
    };
  }
}

/**
 * Get single ZarklyX permission by ID
 */
export async function getZarklyXPermissionById(permissionId: string) {
  try {
    const permission = await ZarklyXPermission.findOne({
      where: { id: permissionId, isDeleted: false },
    });

    if (!permission) {
      return {
        success: false,
        message: "Permission not found",
      };
    }

    return {
      success: true,
      data: { permission },
    };
  } catch (error: any) {
    return {
      success: false,
      message: error.message || "Failed to fetch permission",
    };
  }
}

/**
 * Create new ZarklyX permission
 */
export async function createZarklyXPermission(data: {
  name: string;
  description: string;
  moduleId: string;
  action: string;
  isSystemPermission?: boolean;
  createdBy: string;
}) {
  try {
    // Check if permission with same name exists
    const existingPermission = await ZarklyXPermission.findOne({
      where: { name: data.name },
    });

    if (existingPermission) {
      return {
        success: false,
        message: "Permission with this name already exists",
      };
    }

    const newPermission = await ZarklyXPermission.create({
      name: data.name,
      description: data.description,
      moduleId: data.moduleId,
      action: data.action,
      isSystemPermission: data.isSystemPermission || false,
      isActive: true,
      isDeleted: false,
    });

    console.log(`✅ Permission ${newPermission.id} created by ${data.createdBy}`);

    return {
      success: true,
      message: "Permission created successfully",
      data: { permission: newPermission },
    };
  } catch (error: any) {
    return {
      success: false,
      message: error.message || "Failed to create permission",
    };
  }
}

/**
 * Bulk create ZarklyX permissions
 */
export async function bulkCreateZarklyXPermissions(
  permissions: Array<{
    name: string;
    description: string;
    moduleId: string;
    action: string;
    isSystemPermission?: boolean;
  }>,
  createdBy: string
) {
  try {
    // Check for existing permissions
    const permissionNames = permissions.map((p) => p.name);
    const existingPermissions = await ZarklyXPermission.findAll({
      where: {
        name: { [Op.in]: permissionNames },
      },
    });

    if (existingPermissions.length > 0) {
      const existingNames = existingPermissions.map((p) => p.name);
      return {
        success: false,
        message: `Permissions already exist: ${existingNames.join(", ")}`,
      };
    }

    const permissionsToCreate = permissions.map((p) => ({
      name: p.name,
      description: p.description,
      moduleId: p.moduleId,
      action: p.action,
      isSystemPermission: p.isSystemPermission || false,
      isActive: true,
      isDeleted: false,
    }));

    const newPermissions = await ZarklyXPermission.bulkCreate(permissionsToCreate);

    console.log(`✅ ${newPermissions.length} permissions created by ${createdBy}`);

    return {
      success: true,
      message: `${newPermissions.length} permissions created successfully`,
      data: { permissions: newPermissions },
    };
  } catch (error: any) {
    return {
      success: false,
      message: error.message || "Failed to create permissions",
    };
  }
}

/**
 * Update ZarklyX permission
 */
export async function updateZarklyXPermission(
  permissionId: string,
  data: {
    name?: string;
    description?: string;
    isActive?: boolean;
  },
  updatedBy: string
) {
  try {
    const permission = await ZarklyXPermission.findOne({
      where: { id: permissionId, isDeleted: false },
    });

    if (!permission) {
      return {
        success: false,
        message: "Permission not found",
      };
    }

    // Prevent editing system permissions
    if (permission.isSystemPermission) {
      return {
        success: false,
        message: "System permissions cannot be edited",
      };
    }

    // Prevent editing system permissions
    if (permission.isSystemPermission) {
      return {
        success: false,
        message: "System permissions cannot be edited",
      };
    }

    // If name is being changed, check for duplicates
    if (data.name && data.name !== permission.name) {
      const existingPermission = await ZarklyXPermission.findOne({
        where: { name: data.name },
      });

      if (existingPermission) {
        return {
          success: false,
          message: "Permission with this name already exists",
        };
      }
    }

    await permission.update(data);

    console.log(`✅ Permission ${permissionId} updated by ${updatedBy}`);

    return {
      success: true,
      message: "Permission updated successfully",
      data: { permission },
    };
  } catch (error: any) {
    return {
      success: false,
      message: error.message || "Failed to update permission",
    };
  }
}

/**
 * Delete ZarklyX permission
 */
export async function deleteZarklyXPermission(permissionId: string, deletedBy: string) {
  try {
    const permission = await ZarklyXPermission.findOne({
      where: { id: permissionId, isDeleted: false },
    });

    if (!permission) {
      return {
        success: false,
        message: "Permission not found",
      };
    }

    // Prevent deleting system permissions
    if (permission.isSystemPermission) {
      return {
        success: false,
        message: "System permissions cannot be deleted",
      };
    }

    await permission.update({
      isDeleted: true,
      isActive: false,
    });

    console.log(`✅ Permission ${permissionId} deleted by ${deletedBy}`);

    return {
      success: true,
      message: "Permission deleted successfully",
    };
  } catch (error: any) {
    return {
      success: false,
      message: error.message || "Failed to delete permission",
    };
  }
}

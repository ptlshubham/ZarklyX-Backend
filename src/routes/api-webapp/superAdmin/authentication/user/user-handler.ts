import { Op } from "sequelize";
import bcrypt from "bcrypt";
import { ZarklyXUser } from "../../../../api-webapp/superAdmin/authentication/user/user-model";
import { ZarklyXRole } from "../../../../api-webapp/superAdmin/rbac/roles/roles-model";

/**
 * Get all ZarklyX users with pagination and filters
 */
export async function getAllZarklyXUsers(params: {
  page?: number;
  limit?: number;
  search?: string;
  roleId?: string;
  department?: string;
  isActive?: boolean;
}) {
  try {
    const page = params.page || 1;
    const limit = params.limit || 20;
    const offset = (page - 1) * limit;

    const whereClause: any = {
      isDeleted: false,
    };

    if (params.search) {
      whereClause[Op.or] = [
        { firstName: { [Op.like]: `%${params.search}%` } },
        { lastName: { [Op.like]: `%${params.search}%` } },
        { email: { [Op.like]: `%${params.search}%` } },
      ];
    }

    if (params.roleId) {
      whereClause.roleId = params.roleId;
    }

    if (params.department) {
      whereClause.department = params.department;
    }

    if (params.isActive !== undefined) {
      whereClause.isActive = params.isActive;
    }

    const { count, rows } = await ZarklyXUser.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: ZarklyXRole,
          as: "role",
          attributes: ["id", "name", "priority", "isSystemRole"],
        },
      ],
      attributes: { exclude: ["password"] },
      limit,
      offset,
      order: [["createdAt", "DESC"]],
    });

    return {
      success: true,
      data: {
        users: rows,
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
      message: error.message || "Failed to fetch users",
    };
  }
}

/**
 * Get single ZarklyX user by ID
 */
export async function getZarklyXUserById(userId: string) {
  try {
    const user = await ZarklyXUser.findOne({
      where: { id: userId, isDeleted: false },
      include: [
        {
          model: ZarklyXRole,
          as: "role",
          attributes: ["id", "name", "priority", "isSystemRole"],
        },
      ],
      attributes: { exclude: ["password"] },
    });

    if (!user) {
      return {
        success: false,
        message: "User not found",
      };
    }

    return {
      success: true,
      data: { user },
    };
  } catch (error: any) {
    return {
      success: false,
      message: error.message || "Failed to fetch user",
    };
  }
}

/**
 * Update ZarklyX user
 */
export async function updateZarklyXUser(
  userId: string,
  data: {
    firstName?: string;
    lastName?: string;
    roleId?: string;
    phoneNumber?: string;
    isdCode?: string;
    isoCode?: string;
    department?: string;
    isActive?: boolean;
    isThemeDark?: boolean;
  },
  updatedBy: string
) {
  try {
    const user = await ZarklyXUser.findOne({
      where: { id: userId, isDeleted: false },
      include: [{ model: ZarklyXRole, as: "role" }],
    });

    if (!user) {
      return {
        success: false,
        message: "User not found",
      };
    }

    // If roleId is being changed, verify it exists and check authorization
    if (data.roleId && data.roleId !== user.roleId) {
      const newRole = await ZarklyXRole.findByPk(data.roleId);
      if (!newRole) {
        return {
          success: false,
          message: "Invalid role ID",
        };
      }

      // Get updater's role to validate they can assign this role
      const updaterUser = await ZarklyXUser.findByPk(updatedBy, {
        include: [{ model: ZarklyXRole, as: "role" }],
      });

      if (updaterUser) {
        const updaterRole = (updaterUser as any).role;
        if (updaterRole && newRole.priority < updaterRole.priority) {
          return {
            success: false,
            message: `Cannot assign role with higher authority. Target role priority (${newRole.priority}) is higher than your role priority (${updaterRole.priority}).`,
          };
        }
      }
    }

    await user.update(data);

    console.log(`✅ User ${userId} updated by ${updatedBy}`);

    return {
      success: true,
      message: "User updated successfully",
      data: {
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          roleId: user.roleId,
          department: user.department,
          isActive: user.isActive,
        },
      },
    };
  } catch (error: any) {
    return {
      success: false,
      message: error.message || "Failed to update user",
    };
  }
}

/**
 * Soft delete ZarklyX user
 */
export async function deleteZarklyXUser(userId: string, deletedBy: string) {
  try {
    const user = await ZarklyXUser.findOne({
      where: { id: userId, isDeleted: false },
    });

    if (!user) {
      return {
        success: false,
        message: "User not found",
      };
    }

    await user.update({
      isDeleted: true,
      isActive: false,
    });

    console.log(`✅ User ${userId} deleted by ${deletedBy}`);

    return {
      success: true,
      message: "User deleted successfully",
    };
  } catch (error: any) {
    return {
      success: false,
      message: error.message || "Failed to delete user",
    };
  }
}

/**
 * Activate/Deactivate ZarklyX user
 */
export async function toggleZarklyXUserStatus(
  userId: string,
  isActive: boolean,
  updatedBy: string
) {
  try {
    const user = await ZarklyXUser.findOne({
      where: { id: userId, isDeleted: false },
    });

    if (!user) {
      return {
        success: false,
        message: "User not found",
      };
    }

    await user.update({ isActive });

    console.log(`✅ User ${userId} ${isActive ? "activated" : "deactivated"} by ${updatedBy}`);

    return {
      success: true,
      message: `User ${isActive ? "activated" : "deactivated"} successfully`,
      data: { user },
    };
  } catch (error: any) {
    return {
      success: false,
      message: error.message || "Failed to update user status",
    };
  }
}

import { Op } from "sequelize";
import { ZarklyXUserPermissionOverride } from "../../../../api-webapp/superAdmin/rbac/user-permission-overrides/user-permission-overrides-model";
import { ZarklyXUser } from "../../../../api-webapp/superAdmin/authentication/user/user-model";
import { ZarklyXPermission } from "../../../../api-webapp/superAdmin/rbac/permissions/permissions-model";
import { ZarklyXRole } from "../../../../api-webapp/superAdmin/rbac/roles/roles-model";

/**
 * SECURITY: Validate if current ZarklyX user can grant overrides to target ZarklyX user
 */
export async function validateOverrideAuthorization(
  grantedByUserId: string,
  targetUserId: string,
  permissionId: string
): Promise<{ valid: boolean; error?: string }> {
  // Fetch both users with their roles
  const [grantingUser, targetUser] = await Promise.all([
    ZarklyXUser.findByPk(grantedByUserId, {
      include: [{ model: ZarklyXRole, as: "role" }],
    }),
    ZarklyXUser.findByPk(targetUserId, {
      include: [{ model: ZarklyXRole, as: "role" }],
    }),
  ]);

  if (!grantingUser || !grantingUser.roleId) {
    return { valid: false, error: "Granting user not found or has no role" };
  }

  if (!targetUser || !targetUser.roleId) {
    return { valid: false, error: "Target user not found or has no role" };
  }

  const grantingRole = (grantingUser as any).role;
  const targetRole = (targetUser as any).role;

  if (!grantingRole || !targetRole) {
    return { valid: false, error: "Role information not found" };
  }

  // RULE 1: Only privileged ZarklyX users can grant overrides (priority <= 20)
  // SuperAdmin=0, PlatformAdmin=10, SupportLead=20 can grant; lower roles cannot
  if (grantingRole.priority > 20) {
    return {
      valid: false,
      error: "Not authorized to grant permission overrides. Only Super Admin, Platform Admin, or Support Lead can grant overrides.",
    };
  }

  // RULE 2: Cannot override permissions of higher-privilege users
  if (targetRole.priority < grantingRole.priority) {
    return {
      valid: false,
      error: `Cannot override permissions of higher-privilege user. Target role priority (${targetRole.priority}) is higher than your role priority (${grantingRole.priority}).`,
    };
  }

  // RULE 3: Check if permission is a system permission
  const permission = await ZarklyXPermission.findByPk(permissionId);
  if (!permission) {
    return { valid: false, error: "Permission not found" };
  }

  if (permission.isSystemPermission === true) {
    return {
      valid: false,
      error: "System permissions cannot be overridden",
    };
  }

  return { valid: true };
}

/**
 * Get all permission overrides for a user
 */
export async function getUserPermissionOverrides(userId: string) {
  try {
    const overrides = await ZarklyXUserPermissionOverride.findAll({
      where: {
        userId,
        [Op.or]: [{ expiresAt: null }, { expiresAt: { [Op.gt]: new Date() } }],
      },
      include: [
        {
          model: ZarklyXPermission,
          as: "permission",
        },
      ],
      order: [["createdAt", "DESC"]],
    });

    return {
      success: true,
      data: { overrides },
    };
  } catch (error: any) {
    return {
      success: false,
      message: error.message || "Failed to fetch overrides",
    };
  }
}

/**
 * Create permission override for a user
 */
export async function createPermissionOverride(data: {
  userId: string;
  permissionId: string;
  effect: "allow" | "deny";
  reason?: string;
  expiresAt?: Date;
  grantedByUserId: string;
}) {
  try {
    // Validate expiry date if provided
    if (data.expiresAt) {
      const expiryDate = new Date(data.expiresAt);
      if (isNaN(expiryDate.getTime())) {
        return {
          success: false,
          message: "Invalid expiry date format",
        };
      }
      if (expiryDate <= new Date()) {
        return {
          success: false,
          message: "Expiry date must be in the future",
        };
      }
    }

    // Verify user exists
    const user = await ZarklyXUser.findByPk(data.userId);
    if (!user) {
      return {
        success: false,
        message: "User not found",
      };
    }

    // Verify permission exists
    const permission = await ZarklyXPermission.findByPk(data.permissionId);
    if (!permission) {
      return {
        success: false,
        message: "Permission not found",
      };
    }

    // Check if override already exists
    const existingOverride = await ZarklyXUserPermissionOverride.findOne({
      where: {
        userId: data.userId,
        permissionId: data.permissionId,
      },
    });

    if (existingOverride) {
      // Update existing override
      await existingOverride.update({
        effect: data.effect,
        reason: data.reason || null,
        expiresAt: data.expiresAt || null,
        grantedByUserId: data.grantedByUserId,
      });

      console.log(`✅ Override updated for user ${data.userId} by ${data.grantedByUserId}`);

      return {
        success: true,
        message: "Permission override updated successfully",
        data: { override: existingOverride },
      };
    }

    // Create new override
    const newOverride = await ZarklyXUserPermissionOverride.create({
      userId: data.userId,
      permissionId: data.permissionId,
      effect: data.effect,
      reason: data.reason || null,
      expiresAt: data.expiresAt || null,
      grantedByUserId: data.grantedByUserId,
    });

    console.log(`✅ Override created for user ${data.userId} by ${data.grantedByUserId}`);

    return {
      success: true,
      message: "Permission override created successfully",
      data: { override: newOverride },
    };
  } catch (error: any) {
    return {
      success: false,
      message: error.message || "Failed to create override",
    };
  }
}

/**
 * Bulk create permission overrides for a user
 */
export async function bulkCreatePermissionOverrides(
  userId: string,
  overrides: Array<{
    permissionId: string;
    effect: "allow" | "deny";
    reason?: string;
    expiresAt?: Date;
  }>,
  grantedByUserId: string
) {
  try {
    // Verify user exists
    const user = await ZarklyXUser.findByPk(userId);
    if (!user) {
      return {
        success: false,
        message: "User not found",
      };
    }

    // Verify all permissions exist
    const permissionIds = overrides.map((o) => o.permissionId);
    const permissions = await ZarklyXPermission.findAll({
      where: {
        id: { [Op.in]: permissionIds },
      },
    });

    if (permissions.length !== permissionIds.length) {
      return {
        success: false,
        message: "One or more invalid permission IDs",
      };
    }

    // Remove existing overrides for these permissions
    await ZarklyXUserPermissionOverride.destroy({
      where: {
        userId,
        permissionId: { [Op.in]: permissionIds },
      },
    });

    // Create new overrides
    const overridesToCreate = overrides.map((o) => ({
      userId,
      permissionId: o.permissionId,
      effect: o.effect,
      reason: o.reason || null,
      expiresAt: o.expiresAt || null,
      grantedByUserId,
    }));

    const newOverrides = await ZarklyXUserPermissionOverride.bulkCreate(overridesToCreate);

    console.log(`✅ ${newOverrides.length} overrides created for user ${userId} by ${grantedByUserId}`);

    return {
      success: true,
      message: `${newOverrides.length} permission overrides created successfully`,
      data: { overrides: newOverrides },
    };
  } catch (error: any) {
    return {
      success: false,
      message: error.message || "Failed to create overrides",
    };
  }
}

/**
 * Delete permission override
 */
export async function deletePermissionOverride(
  overrideId: string,
  deletedBy: string
) {
  try {
    const override = await ZarklyXUserPermissionOverride.findByPk(overrideId);

    if (!override) {
      return {
        success: false,
        message: "Override not found",
      };
    }

    await override.destroy();

    console.log(`✅ Override ${overrideId} deleted by ${deletedBy}`);

    return {
      success: true,
      message: "Permission override deleted successfully",
    };
  } catch (error: any) {
    return {
      success: false,
      message: error.message || "Failed to delete override",
    };
  }
}

/**
 * Delete all overrides for a user
 */
export async function deleteAllUserOverrides(userId: string, deletedBy: string) {
  try {
    const count = await ZarklyXUserPermissionOverride.destroy({
      where: { userId },
    });

    console.log(`✅ ${count} overrides deleted for user ${userId} by ${deletedBy}`);

    return {
      success: true,
      message: `${count} permission overrides deleted successfully`,
    };
  } catch (error: any) {
    return {
      success: false,
      message: error.message || "Failed to delete overrides",
    };
  }
}

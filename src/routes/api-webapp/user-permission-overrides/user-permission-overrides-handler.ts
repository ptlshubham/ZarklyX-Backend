import { Transaction, Op } from "sequelize";
import { UserPermissionOverrides } from "../../api-webapp/user-permission-overrides/user-permission-overrides-model";
import { User } from "../../api-webapp/authentication/user/user-model";
import { Permissions } from "../../api-webapp/superAdmin/permissions/permissions-model";
import { Role } from "../../api-webapp/roles/role-model";
import { RolePermissions } from "../../api-webapp/role-permissions/role-permissions-model";

/**
 * SECURITY: Validate if current user can grant overrides to target user
 */
export async function validateOverrideAuthorization(
  grantedByUserId: string,
  targetUserId: string,
  permissionId: string
): Promise<{ valid: boolean; error?: string }> {
  // Fetch both users with their roles
  const [grantingUser, targetUser] = await Promise.all([
    User.findByPk(grantedByUserId, {
      include: [{ model: Role, as: "role" }],
    }),
    User.findByPk(targetUserId, {
      include: [{ model: Role, as: "role" }],
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

  // RULE 1: Only privileged users can grant overrides (priority <= 20)
  // SuperAdmin=0, CompanyAdmin=10, Manager=20 can grant; lower roles cannot
  if (grantingRole.priority > 20) {
    return {
      valid: false,
      error: "Not authorized to grant permission overrides. Only Super Admin, Company Admin, or Manager can grant overrides.",
    };
  }

  // RULE 2: Cannot override permissions of higher-privilege users
  if (targetRole.priority < grantingRole.priority) {
    return {
      valid: false,
      error: `Cannot override permissions of higher-privilege user. Target role priority (${targetRole.priority}) is higher than your role priority (${grantingRole.priority}).`,
    };
  }

  // RULE 3: Check if permission is a system permission (if field exists)
  const permission = await Permissions.findByPk(permissionId);
  if (!permission) {
    return { valid: false, error: "Permission not found" };
  }

  // If isSystemPermission field exists, block overrides
  if ((permission as any).isSystemPermission === true) {
    return {
      valid: false,
      error: "System permissions cannot be overridden",
    };
  }

  return { valid: true };
}

/**
 * VALIDATION: Check for redundant deny overrides
 */
export async function checkRedundantDeny(
  userId: string,
  permissionId: string,
  effect: "allow" | "deny"
): Promise<{ isRedundant: boolean; warning?: string }> {
  if (effect !== "deny") {
    return { isRedundant: false };
  }

  // Check if user's role already lacks this permission
  const user = await User.findByPk(userId);
  if (!user || !user.roleId) {
    return { isRedundant: false };
  }

  const roleHasPermission = await RolePermissions.findOne({
    where: {
      roleId: user.roleId,
      permissionId,
    },
  });

  if (!roleHasPermission) {
    return {
      isRedundant: true,
      warning: "User's role already lacks this permission. DENY override is redundant.",
    };
  }

  return { isRedundant: false };
}

/**
 * Create a permission override for a user
 * NOW WITH SECURITY VALIDATION
 */
export async function createUserPermissionOverride(
  data: {
    userId: string;
    permissionId: string;
    effect: "allow" | "deny";
    reason?: string | null;
    expiresAt?: Date | null;
    grantedByUserId?: string | null;
  },
  transaction?: Transaction
) {
  // SECURITY: Validate authorization if grantedByUserId is provided
  if (data.grantedByUserId) {
    const authCheck = await validateOverrideAuthorization(
      data.grantedByUserId,
      data.userId,
      data.permissionId
    );

    if (!authCheck.valid) {
      throw new Error(authCheck.error);
    }
  }

  // VALIDATION: Check for redundant deny (log warning but allow)
  const redundancyCheck = await checkRedundantDeny(
    data.userId,
    data.permissionId,
    data.effect
  );

  if (redundancyCheck.isRedundant && redundancyCheck.warning) {
    console.warn(`[RBAC Warning] ${redundancyCheck.warning}`);
    // Allow it to proceed, but with warning logged
  }

  // IMPROVEMENT 3: Check override limit (prevent abuse)
  const activeOverridesCount = await UserPermissionOverrides.count({
    where: {
      userId: data.userId,
      [Op.or]: [{ expiresAt: null }, { expiresAt: { [Op.gt]: new Date() } }],
    },
    transaction,
  });

  // Only check limit if creating new override (not updating existing)
  const existingOverride = await UserPermissionOverrides.findOne({
    where: {
      userId: data.userId,
      permissionId: data.permissionId,
    },
    transaction,
  });

  if (!existingOverride && activeOverridesCount >= 50) {
    throw new Error(
      `Cannot create override: User has ${activeOverridesCount} active overrides. Maximum is 50. Remove expired or unnecessary overrides first.`
    );
  }

  // Use the existing override check from above
  if (existingOverride) {
    // Update existing override
    await existingOverride.update(
      {
        effect: data.effect,
        reason: data.reason || null,
        expiresAt: data.expiresAt || null,
        grantedByUserId: data.grantedByUserId || null,
      },
      { transaction }
    );
    return existingOverride;
  }

  return await UserPermissionOverrides.create(
    {
      userId: data.userId,
      permissionId: data.permissionId,
      effect: data.effect,
      reason: data.reason || null,
      expiresAt: data.expiresAt || null,
      grantedByUserId: data.grantedByUserId || null,
    },
    { transaction }
  );
}

/**
 * Bulk create permission overrides for a user (OPTIMIZED)
 * Uses batch operations for better performance
 */
export async function createUserPermissionOverrides(
  userId: string,
  overrides: Array<{
    permissionId: string;
    effect: "allow" | "deny";
    reason?: string | null;
    expiresAt?: Date | null;
  }>,
  grantedByUserId?: string | null,
  transaction?: Transaction
) {
  // SECURITY: Validate authorization once for all overrides
  if (grantedByUserId) {
    for (const override of overrides) {
      const authCheck = await validateOverrideAuthorization(
        grantedByUserId,
        userId,
        override.permissionId
      );
      if (!authCheck.valid) {
        throw new Error(`${override.permissionId}: ${authCheck.error}`);
      }
    }
  }

  // Get all permission IDs
  const permissionIds = overrides.map(o => o.permissionId);

  // Fetch existing overrides in one query
  const existingOverrides = await UserPermissionOverrides.findAll({
    where: {
      userId,
      permissionId: { [Op.in]: permissionIds },
    },
    transaction,
  });

  const existingMap = new Map(
    existingOverrides.map(o => [o.permissionId, o])
  );

  // Split into updates and inserts
  const toUpdate: Array<{ override: UserPermissionOverrides; data: any }> = [];
  const toInsert: Array<any> = [];

  for (const override of overrides) {
    const existing = existingMap.get(override.permissionId);

    if (existing) {
      toUpdate.push({
        override: existing,
        data: {
          effect: override.effect,
          reason: override.reason || null,
          expiresAt: override.expiresAt || null,
          grantedByUserId: grantedByUserId || null,
        },
      });
    } else {
      toInsert.push({
        userId,
        permissionId: override.permissionId,
        effect: override.effect,
        reason: override.reason || null,
        expiresAt: override.expiresAt || null,
        grantedByUserId: grantedByUserId || null,
      });
    }
  }

  // Perform updates
  for (const { override, data } of toUpdate) {
    await override.update(data, { transaction });
  }

  // Perform bulk insert
  let insertedOverrides: UserPermissionOverrides[] = [];
  if (toInsert.length > 0) {
    insertedOverrides = await UserPermissionOverrides.bulkCreate(
      toInsert,
      { transaction }
    );
  }

  // Return all results
  return [
    ...toUpdate.map(u => u.override),
    ...insertedOverrides,
  ];
}

/**
 * Get all permission overrides for a user
 */
export async function getUserPermissionOverrides(
  userId: string,
  includeExpired: boolean = false
) {
  const where: any = { userId };

  if (!includeExpired) {
    where[Op.or] = [
      { expiresAt: null },
      { expiresAt: { [Op.gt]: new Date() } },
    ];
  }

  return await UserPermissionOverrides.findAll({
    where,
    include: [
      {
        model: Permissions,
        as: "permission",
      },
    ],
  });
}

/**
 * Get active permission overrides for a user (non-expired)
 */
export async function getActiveUserPermissionOverrides(userId: string) {
  return await getUserPermissionOverrides(userId, false);
}

/**
 * Get a specific permission override
 */
export async function getUserPermissionOverride(
  userId: string,
  permissionId: string
) {
  return await UserPermissionOverrides.findOne({
    where: { userId, permissionId },
  });
}

/**
 * Remove a permission override
 */
export async function removeUserPermissionOverride(
  userId: string,
  permissionId: string,
  transaction?: Transaction
) {
  const deleted = await UserPermissionOverrides.destroy({
    where: { userId, permissionId },
    transaction,
  });

  return deleted > 0;
}

/**
 * Remove all permission overrides for a user
 */
export async function removeAllUserPermissionOverrides(
  userId: string,
  transaction?: Transaction
) {
  return await UserPermissionOverrides.destroy({
    where: { userId },
    transaction,
  });
}



/**
 * Remove expired permission overrides for a user
 */
export async function cleanupExpiredOverrides(
  userId?: string,
  transaction?: Transaction
) {
  const where: any = {
    expiresAt: { [Op.lt]: new Date() },
  };

  if (userId) {
    where.userId = userId;
  }

  return await UserPermissionOverrides.destroy({
    where,
    transaction,
  });
}

/**
 * Get users with a specific permission override
 */
export async function getUsersWithPermissionOverride(permissionId: string) {
  return await UserPermissionOverrides.findAll({
    where: { permissionId },
    include: [
      {
        model: User,
        as: "user",
      },
    ],
  });
}

/**
 * Update permission override expiration
 */
export async function updateOverrideExpiration(
  userId: string,
  permissionId: string,
  expiresAt: Date | null,
  transaction?: Transaction
) {
  const override = await UserPermissionOverrides.findOne({
    where: { userId, permissionId },
    transaction,
  });

  if (!override) {
    return null;
  }

  await override.update({ expiresAt }, { transaction });
  return override;
}

/**
 * Get permission override statistics for a user
 */
export async function getUserPermissionOverrideStats(userId: string) {
  const all = await UserPermissionOverrides.findAll({
    where: { userId },
  });

  const now = new Date();
  const active = all.filter((o) => !o.expiresAt || o.expiresAt > now);
  const expired = all.filter((o) => o.expiresAt && o.expiresAt <= now);
  const allows = active.filter((o) => o.effect === "allow");
  const denies = active.filter((o) => o.effect === "deny");

  return {
    total: all.length,
    active: active.length,
    expired: expired.length,
    allows: allows.length,
    denies: denies.length,
  };
}

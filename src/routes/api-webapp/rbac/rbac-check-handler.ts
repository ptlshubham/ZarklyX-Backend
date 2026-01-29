import { Op } from "sequelize";
import { User } from "../../api-webapp/authentication/user/user-model";
import { Role } from "../../api-webapp/roles/role-model";
import { Permissions } from "../../api-webapp/superAdmin/permissions/permissions-model";
import { RolePermissions } from "../role-permissions/role-permissions-model";
import { UserPermissionOverrides } from "../user-permission-overrides/user-permission-overrides-model";
import { CompanyModule } from "../../api-webapp/company/company-module/company-module-model";
import { CompanySubscription } from "../../api-webapp/company/company-subscription/company-subscription-model";
import { SubscriptionPlanModule } from "../../api-webapp/superAdmin/subscription-plan-module/subscription-plan-module-model";
import { Modules } from "../../api-webapp/superAdmin/modules/modules-model";
import { SubscriptionPlanPermission } from "../../api-webapp/superAdmin/subscription-plan-permission/subscription-plan-permission-model";
import { CompanyPermission } from "../../api-webapp/company/company-permission/company-permission-model";

/**
 * Helper: Active override filter (non-expired)
 */
export const ACTIVE_OVERRIDE_FILTER = {
  [Op.or]: [{ expiresAt: null }, { expiresAt: { [Op.gt]: new Date() } }],
};

/**
 * Preload all accessible module IDs for a company
 */
export async function getCompanyAccessibleModuleIds(
  companyId: string
): Promise<Set<string>> {
  const moduleIds = new Set<string>();

  // Get free modules (available to all companies)
  const freeModules = await Modules.findAll({
    where: {
      isFreeForAll: true,
      isActive: true,
      isDeleted: false,
    },
    attributes: ["id"],
  });

  freeModules.forEach((m) => moduleIds.add(m.id));

  // Get subscription plan modules
  const subscription = await CompanySubscription.findOne({
    where: {
      companyId,
      isCurrent: true,
      status: "active",
      isDeleted: false,
    },
  });

  if (subscription) {
    const planModules = await SubscriptionPlanModule.findAll({
      where: {
        subscriptionPlanId: subscription.subscriptionPlanId,
        isActive: true,
        isDeleted: false,
      },
      attributes: ["moduleId"],
    });

    planModules.forEach((pm) => moduleIds.add(pm.moduleId));
  }

  // Get company-specific add-on modules
  const companyModules = await CompanyModule.findAll({
    where: {
      companyId,
      isActive: true,
      isDeleted: false,
    },
    attributes: ["moduleId"],
  });

  companyModules.forEach((cm) => moduleIds.add(cm.moduleId));

  return moduleIds;
}

/**
 * Check if a company has access to a module
 * Checks: 1) Free modules, 2) Subscription plan, 3) Company-specific add-ons
 */
export async function checkCompanyModuleAccess(
  companyId: string,
  moduleId: string
): Promise<boolean> {
  // STEP 1: Check if module is free for all companies
  const module = await Modules.findOne({
    where: {
      id: moduleId,
      isFreeForAll: true,
      isActive: true,
      isDeleted: false,
    },
  });

  if (module) {
    return true; // Free module, grant access immediately
  }

  // STEP 2: Check direct company module assignment (add-ons)
  const companyModule = await CompanyModule.findOne({
    where: {
      companyId,
      moduleId,
      isActive: true,
      isDeleted: false,
    },
  });

  if (companyModule) {
    return true;
  }

  // Check subscription plan modules
  const subscription = await CompanySubscription.findOne({
    where: {
      companyId,
      isCurrent: true,
      status: "active",
      isDeleted: false,
    },
  });

  if (!subscription) {
    return false;
  }

  const planModule = await SubscriptionPlanModule.findOne({
    where: {
      subscriptionPlanId: subscription.subscriptionPlanId,
      moduleId,
      isActive: true,
      isDeleted: false,
    },
  });

  return !!planModule;
}

/**
 * Check if a company has access to a specific permission (feature-level access)
 * Checks: 1) Subscription plan permissions, 2) Company permission add-ons
 */
export async function checkCompanyPermissionAccess(
  companyId: string,
  permissionId: string
): Promise<boolean> {
  // Check subscription plan permissions
  const subscription = await CompanySubscription.findOne({
    where: {
      companyId,
      isCurrent: true,
      status: "active",
      isDeleted: false,
    },
  });

  if (subscription) {
    const planPermission = await SubscriptionPlanPermission.findOne({
      where: {
        subscriptionPlanId: subscription.subscriptionPlanId,
        permissionId,
        isActive: true,
        isDeleted: false,
      },
    });

    if (planPermission) {
      return true;
    }
  }

  // Check company-specific permission add-ons
  const companyPermission = await CompanyPermission.findOne({
    where: {
      companyId,
      permissionId,
      isActive: true,
      isDeleted: false,
    },
  });

  return !!companyPermission;
}



/**
 * Check if a role has a specific permission
 * Only checks the role's directly assigned permissions (no base role inheritance)
 */
export async function checkRoleHasPermission(
  roleId: string,
  permissionId: string
): Promise<boolean> {
  // Check if this role directly has the permission
  const rolePermission = await RolePermissions.findOne({
    where: { roleId, permissionId },
  });

  return !!rolePermission;
}

/**
 * Check if a role has a permission by permission key
 */
export async function checkRoleHasPermissionByKey(
  roleId: string,
  permissionKey: string
): Promise<boolean> {
  const permission = await Permissions.findOne({
    where: {
      name: permissionKey,
      isActive: true,
      isDeleted: false,
    },
  });

  if (!permission) {
    return false;
  }

  return await checkRoleHasPermission(roleId, permission.id);
}

/**
 * Get all permissions directly assigned to a role
 * Only returns permissions explicitly assigned to this role (no base role inheritance)
 * 
 * @param roleId - The role ID to get permissions for
 * @returns Array of permission IDs
 */
export async function getRoleEffectivePermissions(
  roleId: string
): Promise<string[]> {
  // Get direct permissions for this role
  const rolePermissions = await RolePermissions.findAll({
    where: { roleId },
    attributes: ['permissionId'],
  });

  return rolePermissions.map(rp => rp.permissionId);
}

/**
 * Check if user has a permission override (active and non-expired)
 */
export async function checkUserPermissionOverride(
  userId: string,
  permissionId: string
): Promise<{ hasOverride: boolean; effect?: "allow" | "deny" }> {
  const override = await UserPermissionOverrides.findOne({
    where: {
      userId,
      permissionId,
      ...ACTIVE_OVERRIDE_FILTER,
    },
  });

  if (!override) {
    return { hasOverride: false };
  }

  return {
    hasOverride: true,
    effect: override.effect,
  };
}

/**
 * Main RBAC check function - Check if user has a specific permission
 * 
 * ============================================================
 * CRITICAL: Correct Permission Check Priority Order
 * ============================================================
 * 1. Company Entitlement (Module or Permission-level)
 *    - Subscription-exempt permissions (bypass entitlement)
 *    - Free modules (isFreeForAll)
 *    - Full module access (plan + addon)
 *    - Feature-level access (plan + addon)
 *    - No entitlement → DENY (cannot override billing)
 * 2. User DENY override (within purchased features)
 * 3. User ALLOW override (within purchased features)
 * 4. Role permissions
 * 5. Default DENY
 * 
 * Key Principle: Subscription gives POSSIBILITY → User Overrides give EXCEPTIONS → RBAC gives PERMISSION
 * 
 * Why entitlement first?
 * - Can't grant access to features company didn't purchase (prevents billing bypass)
 * - Performance: Skip override checks if company lacks module
 * - Logical: User permissions derive from company entitlements
 */
export async function checkUserPermission(
  userId: string,
  permissionKey: string
): Promise<{
  hasAccess: boolean;
  reason: string;
  details?: any;
}> {
  // Get user with company and role
  const user = await User.findByPk(userId, {
    include: [
      {
        model: Role,
        as: "role",
      },
    ],
  });

  if (!user) {
    return {
      hasAccess: false,
      reason: "User not found",
    };
  }

  if (!user.roleId) {
    return {
      hasAccess: false,
      reason: "User has no role assigned",
    };
  }

  if (!user.companyId) {
    return {
      hasAccess: false,
      reason: "User has no company assigned",
    };
  }

  // Get permission details
  const permission = await Permissions.findOne({
    where: {
      name: permissionKey,
      isActive: true,
      isDeleted: false,
    },
    include: [
      {
        model: Modules,
        as: "module",
      },
    ],
  });

  if (!permission) {
    return {
      hasAccess: false,
      reason: "Permission not found",
    };
  }

  // ============================================================
  // PRIORITY 1: Company Entitlement Check
  // ============================================================
  // This MUST come first to prevent billing bypass via overrides
  
  // Exception: Subscription-exempt permissions (e.g., billing, subscription management)
  // These allow access even without subscription (account survival)
  const isSubscriptionExempt = (permission as any).isSubscriptionExempt;
  
  if (!isSubscriptionExempt) {
    // Check if module is free for all
    const module = await Modules.findByPk(permission.moduleId);
    const isFreeModule = module?.isFreeForAll;

    if (!isFreeModule) {
      // Check full module access (subscription plan + addon modules)
      const hasModuleAccess = await checkCompanyModuleAccess(
        user.companyId,
        permission.moduleId
      );

      if (!hasModuleAccess) {
        // Check feature-level permission access (subscription plan permissions + addon permissions)
        const hasPermissionAccess = await checkCompanyPermissionAccess(
          user.companyId,
          permission.id
        );

        if (!hasPermissionAccess) {
          // No entitlement - company didn't purchase this feature
          // Cannot be overridden (prevents billing bypass)
          return {
            hasAccess: false,
            reason: "Feature not included in subscription",
            details: {
              moduleId: permission.moduleId,
              permissionKey,
              noEntitlement: true,
              message: "Company subscription does not include this feature. Contact admin to upgrade plan or purchase addon.",
            },
          };
        }
      }
    }
  }

  // ============================================================
  // PRIORITY 2: User DENY Override (within purchased features)
  // ============================================================
  const denyOverride = await UserPermissionOverrides.findOne({
    where: {
      userId,
      permissionId: permission.id,
      effect: "deny",
      ...ACTIVE_OVERRIDE_FILTER,
    },
  });

  if (denyOverride) {
    return {
      hasAccess: false,
      reason: "Permission explicitly denied for user",
      details: {
        override: true,
        effect: "deny",
        reason: denyOverride.reason,
      },
    };
  }

  // ============================================================
  // PRIORITY 3: User ALLOW Override (within purchased features)
  // ============================================================
  const allowOverride = await UserPermissionOverrides.findOne({
    where: {
      userId,
      permissionId: permission.id,
      effect: "allow",
      ...ACTIVE_OVERRIDE_FILTER,
    },
  });

  if (allowOverride) {
    return {
      hasAccess: true,
      reason: "Permission explicitly allowed for user",
      details: {
        override: true,
        effect: "allow",
        reason: allowOverride.reason,
      },
    };
  }

  // ============================================================
  // PRIORITY 4: Role Permission Check
  // ============================================================
  const hasRolePermission = await checkRoleHasPermission(user.roleId, permission.id);

  if (hasRolePermission) {
    return {
      hasAccess: true,
      reason: "Permission granted by role",
      details: {
        roleId: user.roleId,
        permissionKey,
      },
    };
  }

  // ============================================================
  // PRIORITY 5: Default DENY
  // ============================================================
  return {
    hasAccess: false,
    reason: "Permission not granted by role",
    details: {
      roleId: user.roleId,
      permissionKey,
    },
  };
}



/**
 * Get all permissions for a user (including overrides)
 */
export async function getUserEffectivePermissions(userId: string): Promise<{
  rolePermissions: string[];
  allowOverrides: string[];
  denyOverrides: string[];
}> {
  const user = await User.findByPk(userId);

  if (!user || !user.roleId) {
    return {
      rolePermissions: [],
      allowOverrides: [],
      denyOverrides: [],
    };
  }

  // Get role permissions
  const rolePermissions = await RolePermissions.findAll({
    where: { roleId: user.roleId },
    include: [
      {
        model: Permissions,
        as: "permission",
        where: {
          isActive: true,
          isDeleted: false,
        },
      },
    ],
  });

  // Get user overrides
  const overrides = await UserPermissionOverrides.findAll({
    where: {
      userId,
      ...ACTIVE_OVERRIDE_FILTER,
    },
    include: [
      {
        model: Permissions,
        as: "permission",
        where: {
          isActive: true,
          isDeleted: false,
        },
      },
    ],
  });

  const allowOverrides = overrides
    .filter((o) => o.effect === "allow")
    .map((o) => (o as any).permission.name);

  const denyOverrides = overrides
    .filter((o) => o.effect === "deny")
    .map((o) => (o as any).permission.name);

  const rolePermissionKeys = rolePermissions.map((rp) => (rp as any).permission.name);

  return {
    rolePermissions: rolePermissionKeys,
    allowOverrides,
    denyOverrides,
  };
}

/**
 * Get user's accessible modules
 */
export async function getUserAccessibleModules(userId: string): Promise<string[]> {
  const user = await User.findByPk(userId);

  if (!user || !user.companyId) {
    return [];
  }

  // Get company modules from subscription
  const subscription = await CompanySubscription.findOne({
    where: {
      companyId: user.companyId,
      isCurrent: true,
      status: "active",
      isDeleted: false,
    },
  });

  const moduleIds = new Set<string>();

  if (subscription) {
    const planModules = await SubscriptionPlanModule.findAll({
      where: {
        subscriptionPlanId: subscription.subscriptionPlanId,
        isActive: true,
        isDeleted: false,
      },
    });

    planModules.forEach((pm) => moduleIds.add(pm.moduleId));
  }

  // Get company-specific modules (add-ons)
  const companyModules = await CompanyModule.findAll({
    where: {
      companyId: user.companyId,
      isActive: true,
      isDeleted: false,
    },
  });

  companyModules.forEach((cm) => moduleIds.add(cm.moduleId));

  // Get module names
  const modules = await Modules.findAll({
    where: {
      id: { [Op.in]: Array.from(moduleIds) },
      isActive: true,
      isDeleted: false,
    },
  });

  return modules.map((m) => m.name);
}

/**
 * Batch check if user has access to multiple permissions
 * More efficient than checking one by one
 */
export async function batchCheckUserPermissions(
  userId: string,
  permissionKeys: string[]
): Promise<{ [key: string]: boolean }> {
  const result: { [key: string]: boolean } = {};

  // Get user data once
  const user = await User.findByPk(userId, {
    include: [{ model: Role, as: "role" }],
  });

  if (!user || !user.roleId || !user.companyId) {
    permissionKeys.forEach((key) => (result[key] = false));
    return result;
  }

  // Get all permissions at once
  const permissions = await Permissions.findAll({
    where: {
      name: { [Op.in]: permissionKeys },
      isActive: true,
      isDeleted: false,
    },
  });

  const permissionMap = new Map(permissions.map((p) => [p.name, p]));

  // Get role permissions
  const rolePermissions = await RolePermissions.findAll({
    where: {
      roleId: user.roleId,
      permissionId: { [Op.in]: permissions.map((p) => p.id) },
    },
  });

  const rolePermissionIds = new Set(rolePermissions.map((rp) => rp.permissionId));

  // Get user overrides
  const overrides = await UserPermissionOverrides.findAll({
    where: {
      userId,
      permissionId: { [Op.in]: permissions.map((p) => p.id) },
      ...ACTIVE_OVERRIDE_FILTER,
    },
  });

  const overrideMap = new Map(overrides.map((o) => [o.permissionId, o.effect]));

  // PERFORMANCE: Preload all accessible modules once (prevents N+1 queries)
  const allowedModuleIds = await getCompanyAccessibleModuleIds(user.companyId);

  // Preload modules for free check
  const moduleIds = Array.from(new Set(permissions.map(p => p.moduleId)));
  const modules = await Modules.findAll({
    where: {
      id: { [Op.in]: moduleIds },
      isActive: true,
      isDeleted: false,
    },
  });
  const moduleMap = new Map(modules.map(m => [m.id, m]));

  // Process each permission
  for (const permissionKey of permissionKeys) {
    const permission = permissionMap.get(permissionKey);

    if (!permission) {
      result[permissionKey] = false;
      continue;
    }

    // Check if subscription-exempt (e.g., billing, subscription management)
    const isSubscriptionExempt = (permission as any).isSubscriptionExempt;

    if (!isSubscriptionExempt) {
      // Check if module is free for all
      const module = moduleMap.get(permission.moduleId);
      const isFreeModule = module?.isFreeForAll;

      if (!isFreeModule) {
        // Check module access (using preloaded set - O(1) lookup)
        const hasModuleAccess = allowedModuleIds.has(permission.moduleId);

        if (!hasModuleAccess) {
          // Check feature-level permission access
          const hasPermissionAccess = await checkCompanyPermissionAccess(
            user.companyId,
            permission.id
          );

          if (!hasPermissionAccess) {
            // No entitlement
            result[permissionKey] = false;
            continue;
          }
        }
      }
    }

    // Check override
    const overrideEffect = overrideMap.get(permission.id);
    if (overrideEffect === "deny") {
      result[permissionKey] = false;
      continue;
    }

    if (overrideEffect === "allow") {
      result[permissionKey] = true;
      continue;
    }

    // Check role permission
    result[permissionKey] = rolePermissionIds.has(permission.id);
  }

  return result;
}
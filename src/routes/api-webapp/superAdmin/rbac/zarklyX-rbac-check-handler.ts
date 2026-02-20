import { Op } from "sequelize";
import { ZarklyXUser } from "../../../api-webapp/superAdmin/authentication/user/user-model";
import { ZarklyXRole } from "../../../api-webapp/superAdmin/rbac/roles/roles-model";
import { ZarklyXPermission } from "../../../api-webapp/superAdmin/rbac/permissions/permissions-model";
import { ZarklyXRolePermission } from "../../../api-webapp/superAdmin/rbac/role-permissions/role-permissions-model";
import { ZarklyXUserPermissionOverride } from "../../../api-webapp/superAdmin/rbac/user-permission-overrides/user-permission-overrides-model";
import { Modules } from "../../../api-webapp/superAdmin/modules/modules-model";
import { 
  getActiveOverrideFilter,
  checkHierarchicalPermission,
  checkRolePermission,
  findPermissionByKey,
  checkRolePermissionByKey,
} from "../../../../utils/rbac-shared-utils";

/**
 * Helper: Active override filter (non-expired)
 * Re-exported for backward compatibility
 */
export const ZARKLYX_ACTIVE_OVERRIDE_FILTER = getActiveOverrideFilter();

/**
 * Check if a ZarklyX role has a specific permission
 */
export async function checkZarklyXRoleHasPermission(
  roleId: string,
  permissionId: string
): Promise<boolean> {
  return await checkRolePermission(ZarklyXRolePermission, roleId, permissionId);
}

/**
 * Check if a ZarklyX role has a permission by key
 */
export async function checkZarklyXRoleHasPermissionByKey(
  roleId: string,
  permissionKey: string
): Promise<boolean> {
  return await checkRolePermissionByKey(
    ZarklyXPermission,
    ZarklyXRolePermission,
    roleId,
    permissionKey
  );
}

/**
 * Main RBAC check for ZarklyX internal users
 * 
 * ============================================================
 * ZarklyX Permission Check Priority Order
 * ============================================================
 * NO SUBSCRIPTION CHECK - ZarklyX users have access to ALL modules
 * 
 * 1. User DENY override (ABSOLUTE - always blocks)
 * 2. User ALLOW override (grants immediate access)
 * 3. Role permissions (standard role-based check)
 * 4. Default DENY
 * 
 * Key Difference from Company RBAC:
 * - No company/subscription entitlement check
 * - No module access restrictions
 * - Simpler flow focused on role + overrides only
 */
export async function checkZarklyXUserPermission(
  userId: string,
  permissionKey: string
): Promise<{
  hasAccess: boolean;
  reason: string;
  details?: any;
}> {
  // Get user with role
  const user = await ZarklyXUser.findByPk(userId, {
    include: [
      {
        model: ZarklyXRole,
        as: "role",
      },
    ],
  });

  if (!user) {
    return {
      hasAccess: false,
      reason: "ZarklyX user not found",
    };
  }

  if (!user.isActive) {
    return {
      hasAccess: false,
      reason: "ZarklyX user account is inactive",
    };
  }

  if (!user.roleId) {
    return {
      hasAccess: false,
      reason: "ZarklyX user has no role assigned",
    };
  }

  // Get permission details
  const permission = await ZarklyXPermission.findOne({
    where: {
      name: permissionKey,
      isActive: true,
      isDeleted: false,
    },
  });

  if (!permission) {
    return {
      hasAccess: false,
      reason: "Permission not found",
    };
  }

  // ============================================================
  // PRIORITY 1: User DENY Override (ABSOLUTE - Always wins)
  // ============================================================
  const denyOverride = await ZarklyXUserPermissionOverride.findOne({
    where: {
      userId,
      permissionId: permission.id,
      effect: "deny",
      ...ZARKLYX_ACTIVE_OVERRIDE_FILTER,
    },
  });

  if (denyOverride) {
    return {
      hasAccess: false,
      reason: "Permission explicitly denied for ZarklyX user",
      details: {
        override: true,
        effect: "deny",
        reason: denyOverride.reason,
        matchType: "exact",
      },
    };
  }

  // Check hierarchical deny overrides
  const hierarchicalDeny = await checkHierarchicalPermission(
    permissionKey,
    ZarklyXPermission,
    async (higherPermissionId) => {
      return await ZarklyXUserPermissionOverride.findOne({
        where: {
          userId,
          permissionId: higherPermissionId,
          effect: "deny",
          ...ZARKLYX_ACTIVE_OVERRIDE_FILTER,
        },
      });
    }
  );

  if (hierarchicalDeny.found && hierarchicalDeny.result) {
    return {
      hasAccess: false,
      reason: "Permission explicitly denied for ZarklyX user (via higher-level action)",
      details: {
        override: true,
        effect: "deny",
        reason: hierarchicalDeny.result.reason,
        requestedPermission: permissionKey,
        deniedVia: hierarchicalDeny.grantedVia,
        matchType: "hierarchical",
      },
    };
  }

  // ============================================================
  // PRIORITY 2: User ALLOW Override
  // ============================================================
  const allowOverride = await ZarklyXUserPermissionOverride.findOne({
    where: {
      userId,
      permissionId: permission.id,
      effect: "allow",
      ...ZARKLYX_ACTIVE_OVERRIDE_FILTER,
    },
  });

  if (allowOverride) {
    return {
      hasAccess: true,
      reason: "Permission explicitly allowed for ZarklyX user",
      details: {
        override: true,
        effect: "allow",
        reason: allowOverride.reason,
        matchType: "exact",
      },
    };
  }

  // Check hierarchical allow overrides
  const hierarchicalAllow = await checkHierarchicalPermission(
    permissionKey,
    ZarklyXPermission,
    async (higherPermissionId) => {
      return await ZarklyXUserPermissionOverride.findOne({
        where: {
          userId,
          permissionId: higherPermissionId,
          effect: "allow",
          ...ZARKLYX_ACTIVE_OVERRIDE_FILTER,
        },
      });
    }
  );

  if (hierarchicalAllow.found && hierarchicalAllow.result) {
    return {
      hasAccess: true,
      reason: "Permission explicitly allowed for ZarklyX user (via higher-level action)",
      details: {
        override: true,
        effect: "allow",
        reason: hierarchicalAllow.result.reason,
        requestedPermission: permissionKey,
        grantedVia: hierarchicalAllow.grantedVia,
        matchType: "hierarchical",
      },
    };
  }

  // ============================================================
  // PRIORITY 3: Role Permission Check (with Action Hierarchy)
  // ============================================================
  const hasExactRolePermission = await checkZarklyXRoleHasPermission(user.roleId, permission.id);

  if (hasExactRolePermission) {
    return {
      hasAccess: true,
      reason: "Permission granted by ZarklyX role",
      details: {
        roleId: user.roleId,
        permissionKey,
        matchType: "exact",
      },
    };
  }

  // Check hierarchical role permissions
  const hierarchicalRole = await checkHierarchicalPermission(
    permissionKey,
    ZarklyXPermission,
    async (higherPermissionId) => {
      const hasPermission = await checkZarklyXRoleHasPermission(user.roleId, higherPermissionId);
      return hasPermission ? { granted: true } : null;
    }
  );

  if (hierarchicalRole.found) {
    return {
      hasAccess: true,
      reason: "Permission granted by ZarklyX role (via action hierarchy)",
      details: {
        roleId: user.roleId,
        requestedPermission: permissionKey,
        grantedVia: hierarchicalRole.grantedVia,
        matchType: "hierarchical",
      },
    };
  }

  // ============================================================
  // PRIORITY 4: Default DENY
  // ============================================================
  return {
    hasAccess: false,
    reason: "Permission not granted by ZarklyX role",
    details: {
      roleId: user.roleId,
      permissionKey,
    },
  };
}

/**
 * Batch check multiple permissions for a ZarklyX user
 * Performance optimization for checking many permissions at once
 */
export async function batchCheckZarklyXUserPermissions(
  userId: string,
  permissionKeys: string[]
): Promise<{ [permissionKey: string]: boolean }> {
  const results: { [key: string]: boolean } = {};

  // Get all permissions in one query
  const permissions = await ZarklyXPermission.findAll({
    where: {
      name: { [Op.in]: permissionKeys },
      isActive: true,
      isDeleted: false,
    },
  });

  const permissionMap = new Map<string, string>();
  permissions.forEach((p) => permissionMap.set(p.name, p.id));

  // Get user with role
  const user = await ZarklyXUser.findByPk(userId);
  if (!user || !user.roleId) {
    permissionKeys.forEach((key) => (results[key] = false));
    return results;
  }

  // Get all overrides in one query
  const overrides = await ZarklyXUserPermissionOverride.findAll({
    where: {
      userId,
      permissionId: { [Op.in]: Array.from(permissionMap.values()) },
      ...ZARKLYX_ACTIVE_OVERRIDE_FILTER,
    },
  });

  const denyOverrides = new Set<string>();
  const allowOverrides = new Set<string>();

  overrides.forEach((override) => {
    if (override.effect === "deny") {
      denyOverrides.add(override.permissionId);
    } else {
      allowOverrides.add(override.permissionId);
    }
  });

  // Get all role permissions in one query
  const rolePermissions = await ZarklyXRolePermission.findAll({
    where: {
      roleId: user.roleId,
      permissionId: { [Op.in]: Array.from(permissionMap.values()) },
    },
  });

  const rolePermissionSet = new Set<string>();
  rolePermissions.forEach((rp) => rolePermissionSet.add(rp.permissionId));

  // Check each permission
  for (const key of permissionKeys) {
    const permissionId = permissionMap.get(key);

    if (!permissionId) {
      results[key] = false;
      continue;
    }

    // Check in priority order
    if (denyOverrides.has(permissionId)) {
      results[key] = false;
    } else if (allowOverrides.has(permissionId)) {
      results[key] = true;
    } else if (rolePermissionSet.has(permissionId)) {
      results[key] = true;
    } else {
      results[key] = false;
    }
  }

  return results;
}

/**
 * Get all effective permissions for a ZarklyX user
 */
export async function getZarklyXUserEffectivePermissions(userId: string): Promise<{
  rolePermissions: string[];
  allowOverrides: string[];
  denyOverrides: string[];
}> {
  const user = await ZarklyXUser.findByPk(userId);

  if (!user || !user.roleId) {
    return {
      rolePermissions: [],
      allowOverrides: [],
      denyOverrides: [],
    };
  }

  // Get role permissions
  const rolePermissions = await ZarklyXRolePermission.findAll({
    where: { roleId: user.roleId },
    include: [
      {
        model: ZarklyXPermission,
        as: "permission",
        where: {
          isActive: true,
          isDeleted: false,
        },
      },
    ],
  });

  // Get user overrides
  const overrides = await ZarklyXUserPermissionOverride.findAll({
    where: {
      userId,
      ...ZARKLYX_ACTIVE_OVERRIDE_FILTER,
    },
    include: [
      {
        model: ZarklyXPermission,
        as: "permission",
      },
    ],
  });

  const allowOverrides = overrides
    .filter((o) => o.effect === "allow")
    .map((o) => (o as any).permission.name);

  const denyOverrides = overrides
    .filter((o) => o.effect === "deny")
    .map((o) => (o as any).permission.name);

  return {
    rolePermissions: rolePermissions.map((rp) => (rp as any).permission.name),
    allowOverrides,
    denyOverrides,
  };
}

/**
 * Check role hierarchy for authorization
 * Lower priority = higher authority
 */
export async function checkZarklyXRoleHierarchy(
  granterRoleId: string,
  targetRoleId: string
): Promise<{
  isAuthorized: boolean;
  reason: string;
}> {
  const granterRole = await ZarklyXRole.findByPk(granterRoleId);
  const targetRole = await ZarklyXRole.findByPk(targetRoleId);

  if (!granterRole || !targetRole) {
    return {
      isAuthorized: false,
      reason: "One or both roles not found",
    };
  }

  if (granterRole.priority > targetRole.priority) {
    return {
      isAuthorized: false,
      reason: `Cannot modify users with higher authority. Your priority (${granterRole.priority}) > Target priority (${targetRole.priority})`,
    };
  }

  return {
    isAuthorized: true,
    reason: "Authorized to modify target role",
  };
}

// ============================================================
// CASCADING PERMISSION ASSIGNMENT UTILITIES (ZARKLYX)
// ============================================================

/**
 * Recursively get all submodule IDs for a given parent module
 * @param parentModuleId - The parent module ID
 * @returns Set of all descendant module IDs (including nested submodules)
 */
export async function getAllZarklyXSubmoduleIds(
  parentModuleId: string
): Promise<Set<string>> {
  const submoduleIds = new Set<string>();

  // Get direct children
  const children = await Modules.findAll({
    where: {
      parentModuleId: parentModuleId,
      isActive: true,
      isDeleted: false,
    },
    attributes: ["id"],
  });

  // Add each child and recursively get their children
  for (const child of children) {
    submoduleIds.add(child.id);
    
    // Recursively get nested submodules
    const nestedSubmodules = await getAllZarklyXSubmoduleIds(child.id);
    nestedSubmodules.forEach((id) => submoduleIds.add(id));
  }

  return submoduleIds;
}

/**
 * Get all submodule permissions with the same action as parent permission (ZarklyX)
 * 
 * Example: 
 * Input: "platform.accounting.create" (parent module)
 * Output: ["platform.accounting.invoices.create", "platform.accounting.payments.create", ...]
 * 
 * @param permissionId - Parent permission ID
 * @returns Array of submodule permission IDs with matching action
 */
export async function getZarklyXSubmoduleCascadedPermissions(
  permissionId: string
): Promise<string[]> {

  // Get the parent permission details
  const parentPermission = await ZarklyXPermission.findByPk(permissionId, {
    include: [{
      model: Modules,
      as: "module",
    }],
  });

  if (!parentPermission) return [];

  const parentModule = (parentPermission as any).module;
  if (!parentModule) return [];

  // Get all submodules recursively
  const submoduleIds = await getAllZarklyXSubmoduleIds(parentModule.id);
  
  if (submoduleIds.size === 0) return [];

  // Find all permissions in submodules with the same action
  const submodulePermissions = await ZarklyXPermission.findAll({
    where: {
      moduleId: { [Op.in]: Array.from(submoduleIds) },
      action: parentPermission.action,
      isActive: true,
      isDeleted: false,
    },
    attributes: ["id"],
  });

  return submodulePermissions.map(p => p.id);
}

/**
 * Get all parent module permissions with the same action (ZarklyX)
 * Used when removing a submodule permission to cascade removal to parents
 * 
 * Example:
 * Input: "platform.accounting.invoices.create" (submodule)
 * Output: ["platform.accounting.create"] (parent with same action)
 * 
 * @param permissionId - Submodule permission ID
 * @returns Array of parent permission IDs with matching action
 */
export async function getZarklyXParentCascadedPermissions(
  permissionId: string
): Promise<string[]> {

  const permission = await ZarklyXPermission.findByPk(permissionId, {
    include: [{
      model: Modules,
      as: "module",
    }],
  });

  if (!permission) return [];

  const module = (permission as any).module;
  if (!module || !module.parentModuleId) return [];

  const parentPermissionIds: string[] = [];

  // Recursively get parent permissions with matching action
  let currentParentId = module.parentModuleId;
  
  while (currentParentId) {
    const parentModule = await Modules.findByPk(currentParentId);
    if (!parentModule) break;

    // Find permission in parent module with same action
    const parentPermission = await ZarklyXPermission.findOne({
      where: {
        moduleId: parentModule.id,
        action: permission.action,
        isActive: true,
        isDeleted: false,
      },
    });

    if (parentPermission) {
      parentPermissionIds.push(parentPermission.id);
    }

    // Move up to next parent
    currentParentId = parentModule.parentModuleId;
  }

  return parentPermissionIds;
}

/**
 * Apply cascading logic for permission assignment (ZarklyX)
 * Enable parent → enable children
 * 
 * @param permissionIds - Original permission IDs to assign
 * @returns Expanded array including all cascaded submodule permissions
 */
export async function expandZarklyXPermissionsWithCascade(
  permissionIds: string[]
): Promise<string[]> {
  const expandedSet = new Set<string>(permissionIds);

  // For each permission, add cascaded submodule permissions
  for (const permissionId of permissionIds) {
    const submodulePermissions = await getZarklyXSubmoduleCascadedPermissions(permissionId);
    submodulePermissions.forEach(id => expandedSet.add(id));
  }

  return Array.from(expandedSet);
}

/**
 * Apply cascading logic for permission removal (ZarklyX)
 * Disable child → disable parents
 * 
 * @param permissionIds - Original permission IDs to remove
 * @returns Expanded array including all cascaded parent permissions
 */
export async function expandZarklyXPermissionsForRemovalCascade(
  permissionIds: string[]
): Promise<string[]> {
  const expandedSet = new Set<string>(permissionIds);

  // For each permission, add cascaded parent permissions
  for (const permissionId of permissionIds) {
    const parentPermissions = await getZarklyXParentCascadedPermissions(permissionId);
    parentPermissions.forEach(id => expandedSet.add(id));
  }

  return Array.from(expandedSet);
}

import { Transaction } from "sequelize";
import { Role } from "./role-model";
import { Permissions } from "../../api-webapp/superAdmin/permissions/permissions-model";
import { User } from "../../api-webapp/authentication/user/user-model";
import { cloneRolePermissions, assignBulkPermissionsToRole } from "../role-permissions/role-permissions-handler";
import { checkCompanyModuleAccess, checkCompanyPermissionAccess } from "../rbac/rbac-check-handler";
import { Modules } from "../../api-webapp/superAdmin/modules/modules-model";

/**
 * Create a new role
 */
export async function createRole(
  data: {
    name: string;
    description?: string | null;
    scope: "platform" | "company";
    companyId?: string | null;
    isSystemRole?: boolean;
    priority?: number;
    level?: number;
    isActive?: boolean;
  },
  transaction: Transaction
) {
  // Validate system role constraints early
  if (data.isSystemRole && data.scope !== "platform") {
    throw new Error("System roles must be platform-scoped");
  }

  // EDGE CASE 2: Enforce priority floors by scope (prevent privilege escalation)
  const priority = data.priority !== undefined ? data.priority : 50;
  
  if (data.scope === "company" && priority < 20) {
    throw new Error("Company roles cannot have priority lower than 20. Only platform roles can be admins.");
  }
  
  if (data.scope === "platform" && !data.isSystemRole && priority < 10) {
    throw new Error("Custom platform roles cannot have priority lower than 10. Reserved for system roles.");
  }

  return await Role.create(
    {
      name: data.name,
      description: data.description || null,
      scope: data.scope,
      companyId: data.companyId || null,
      isSystemRole: data.isSystemRole || false,
      priority: priority,
      level: data.level || null,
      isActive: data.isActive !== undefined ? data.isActive : true,
      isDeleted: false,
    },
    { transaction }
  );
}

/**
 * Get all roles (optionally filter by scope or companyId)
 */
export async function getRoles(filters?: {
  scope?: "platform" | "company";
  companyId?: string;
  isActive?: boolean;
}) {
  const where: any = { isDeleted: false };

  if (filters?.scope) {
    where.scope = filters.scope;
  }
  if (filters?.companyId) {
    where.companyId = filters.companyId;
  }
  if (filters?.isActive !== undefined) {
    where.isActive = filters.isActive;
  }

  return await Role.findAll({
    where,
    order: [["createdAt", "DESC"]],
  });
}

/**
 * Get active roles only
 */
export async function getActiveRoles(filters?: {
  scope?: "platform" | "company";
  companyId?: string;
}) {
  return await getRoles({ ...filters, isActive: true });
}

/**
 * Get platform roles (system default roles)
 */
export async function getPlatformRoles() {
  return await Role.findAll({
    where: {
      scope: "platform",
      isDeleted: false,
    },
    order: [["name", "ASC"]],
  });
}

/**
 * Get company-specific custom roles
 */
export async function getCompanyRoles(companyId: string) {
  return await Role.findAll({
    where: {
      scope: "company",
      companyId,
      isDeleted: false,
    },
    order: [["name", "ASC"]],
  });
}

/**
 * Get role by ID
 */
export async function getRoleById(id: string) {
  return await Role.findOne({
    where: { id, isDeleted: false },
  });
}

/**
 * Get role by name and scope
 */
export async function getRoleByName(
  name: string,
  scope: "platform" | "company",
  companyId?: string | null
) {
  const where: any = {
    name,
    scope,
    isDeleted: false,
  };

  if (scope === "company" && companyId) {
    where.companyId = companyId;
  }

  return await Role.findOne({ where });
}

/**
 * Update role
 */
export async function updateRole(
  id: string,
  updates: {
    name?: string;
    description?: string | null;
    isActive?: boolean;
  },
  transaction?: Transaction
) {
  const role = await Role.findOne({
    where: { id, isDeleted: false },
  });

  if (!role) {
    return null;
  }

  // Prevent updating system roles (name only)
  if (role.isSystemRole && updates.name) {
    throw new Error("Cannot modify name of system roles");
  }

  await role.update(updates, { transaction });
  return role;
}

/**
 * Delete role (soft delete)
 */
export async function deleteRole(id: string, transaction?: Transaction) {
  const role = await Role.findOne({
    where: { id, isDeleted: false },
  });

  if (!role) {
    return false;
  }

  // Prevent deleting system roles
  if (role.isSystemRole) {
    throw new Error("Cannot delete system roles");
  }

  // Check if any users are assigned to this role
  const userCount = await User.count({
    where: { roleId: id },
  });

  if (userCount > 0) {
    throw new Error(
      `Cannot delete role: ${userCount} user(s) are currently assigned to this role. Please reassign users before deleting.`
    );
  }

  await role.update({ isDeleted: true }, { transaction });
  return true;
}

/**
 * Check if role name exists for a company/platform
 * Now includes scope in the check to match the unique constraint
 */
export async function roleNameExists(
  name: string,
  scope: "platform" | "company",
  companyId?: string | null,
  excludeRoleId?: string
): Promise<boolean> {
  const where: any = {
    name,
    scope,
    isDeleted: false,
  };

  // For platform roles, companyId should be null
  // For company roles, companyId must be specified
  if (scope === "platform") {
    where.companyId = null;
  } else if (scope === "company" && companyId) {
    where.companyId = companyId;
  }

  if (excludeRoleId) {
    where.id = { [require("sequelize").Op.ne]: excludeRoleId };
  }

  const existing = await Role.findOne({ where });
  return !!existing;
}

/**
 * Get all roles available to a company (platform + company-specific)
 */
export async function getAvailableRolesForCompany(companyId: string) {
  return await Role.findAll({
    where: {
      [require("sequelize").Op.or]: [
        { scope: "platform" },
        { scope: "company", companyId },
      ],
      isDeleted: false,
      isActive: true,
    },
    order: [
      ["scope", "ASC"], // platform first
      ["name", "ASC"],
    ],
  });
}

/**
 * Clone a platform role to a company-specific role
 * Optionally specify which permissions to include (default: all base role permissions)
 * Validates that the company has access to all specified permissions
 */
export async function cloneRoleToCompany(
  platformRoleId: string,
  companyId: string,
  newName?: string,
  newDescription?: string,
  permissionIds?: string[],
  transaction?: Transaction
) {
  const platformRole = await Role.findOne({
    where: { id: platformRoleId, scope: "platform", isDeleted: false },
  });

  if (!platformRole) {
    throw new Error("Platform role not found");
  }

  const roleName = newName || `${platformRole.name}_custom`;
  const roleDescription = newDescription || `${platformRole.description}_custom`;

  // Check if name already exists for this company
  const exists = await roleNameExists(roleName, "company", companyId);
  if (exists) {
    throw new Error(`Role name '${roleName}' already exists for this company`);
  }

  // Validate company has access to permissions before assigning
  if (permissionIds && permissionIds.length > 0) {
    const permissionsToCheck = await Permissions.findAll({
      where: { id: permissionIds, isActive: true, isDeleted: false },
      include: [{ model: Modules, as: "module" }]
    });

    if (permissionsToCheck.length !== permissionIds.length) {
      throw new Error("One or more permissions not found or inactive");
    }

    const unauthorizedPermissions: string[] = [];

    for (const permission of permissionsToCheck) {
      // Check if permission is subscription-exempt (always allowed)
      if ((permission as any).isSubscriptionExempt) {
        continue;
      }

      // Check if module is free for all
      const module = (permission as any).module;
      if (module?.isFreeForAll) {
        continue;
      }

      // Check company has module access
      const hasModuleAccess = await checkCompanyModuleAccess(companyId, permission.moduleId);
      
      if (!hasModuleAccess) {
        // Check company has specific permission access
        const hasPermissionAccess = await checkCompanyPermissionAccess(companyId, permission.id);
        
        if (!hasPermissionAccess) {
          unauthorizedPermissions.push(`${permission.name} (${permission.action})`);
        }
      }
    }

    if (unauthorizedPermissions.length > 0) {
      throw new Error(
        `Company does not have access to the following permissions: ${unauthorizedPermissions.join(", ")}. ` +
        `Please purchase the required modules or permissions before assigning them to roles.`
      );
    }
  }

  // Create the custom role
  const customRole = await Role.create(
    {
      name: roleName,
      description: roleDescription,
      scope: "company",
      companyId,
      baseRoleId: platformRoleId,
      level: platformRole.level,
      isSystemRole: false,
      priority: platformRole.priority >= 20 ? platformRole.priority : 20, 
      isActive: true,
      isDeleted: false,
    },
    { transaction }
  );

  // Assign permissions
  if (permissionIds && permissionIds.length > 0) {
    // UI provided specific permissions (can be subset of base + new ones)
    await assignBulkPermissionsToRole(customRole.id, permissionIds, transaction!);
  } else {
    // Default: Clone all permissions from base role
    await cloneRolePermissions(platformRoleId, customRole.id, transaction!);
  }

  return customRole;
}

/**
 * Default system roles definition
 * Priority: Lower number = higher authority
 */
export const DEFAULT_SYSTEM_ROLES = [
  {
    name: "Super Admin",
    scope: "platform" as const,
    isSystemRole: true,
    priority: 0,
    description: "Platform administrator with full system access across all companies"
  },
  {
    name: "Company Admin",
    scope: "platform" as const,
    isSystemRole: true,
    priority: 10,
    description: "Company owner/administrator with full company access and management capabilities"
  },
  {
    name: "Manager",
    scope: "platform" as const,
    isSystemRole: true,
    priority: 20,
    description: "Manager with team management, reporting, and oversight capabilities"
  },
  {
    name: "Employee",
    scope: "platform" as const,
    isSystemRole: true,
    priority: 30,
    description: "Standard employee with access to assigned modules and features"
  },
  {
    name: "Client",
    scope: "platform" as const,
    isSystemRole: true,
    priority: 40,
    description: "External client with limited view-only access to specific resources"
  }
];

/**
 * Initialize default system roles
 * Creates platform-level system roles if they don't exist
 */
export async function initializeSystemRoles(transaction?: Transaction) {
  const createdRoles: Role[] = [];
  const skippedRoles: string[] = [];

  for (const roleData of DEFAULT_SYSTEM_ROLES) {
    try {
      // Check if role already exists
      const existing = await Role.findOne({
        where: {
          name: roleData.name,
          scope: "platform",
          isDeleted: false,
        },
        transaction,
      });

      if (existing) {
        skippedRoles.push(roleData.name);
        continue;
      }

      // Create the system role
      const role = await Role.create(
        {
          name: roleData.name,
          description: roleData.description,
          scope: "platform",
          companyId: null,
          isSystemRole: true,
          priority: roleData.priority,
          isActive: true,
          isDeleted: false,
        },
        { transaction }
      );

      createdRoles.push(role);
    } catch (error) {
      console.error(`Error creating system role ${roleData.name}:`, error);
      throw error;
    }
  }

  return {
    created: createdRoles,
    skipped: skippedRoles,
    total: DEFAULT_SYSTEM_ROLES.length,
  };
}

/**
 * Get a system role by name
 */
export async function getSystemRoleByName(name: string) {
  return await Role.findOne({
    where: {
      name,
      scope: "platform",
      isSystemRole: true,
      isDeleted: false,
    },
  });
}

/**
 * Validate role assignment for company/freelancer users
 * ZarklyX users have their own separate RBAC system
 */
export async function validateRoleAssignment(
  userId: string,
  roleId: string
): Promise<{ valid: boolean; error?: string }> {
  // Get user to check their companyId
  const user = await User.findOne({
    where: { id: userId, isDeleted: false },
  });

  if (!user) {
    return { valid: false, error: "User not found" };
  }

  // Only company/freelancer users should use this validation
  // ZarklyX users have their own separate RBAC system
  if (user.companyId === null) {
    return {
      valid: false,
      error: "This validation is only for company/freelancer users. ZarklyX users have a separate RBAC system.",
    };
  }

  const role = await Role.findOne({
    where: { id: roleId, isDeleted: false },
  });

  if (!role) {
    return { valid: false, error: "Role not found" };
  }

  // Company/Freelancer users can be assigned:
  // 1. Default platform roles (Company Admin, Manager, Employee, Client)
  if (role.scope === "platform" && role.isSystemRole) {
    return { valid: true };
  }

  // 2. Company-specific custom roles for their own company
  if (role.scope === "company" && role.companyId === user.companyId) {
    return { valid: true };
  }

  return {
    valid: false,
    error: "Invalid role for this user. Role must be a default platform role or a custom role for this company.",
  };
}

/**
 * Assign a role to a user with validation
 */
export async function assignRoleToUser(
  userId: string,
  roleId: string,
  transaction?: Transaction
): Promise<{ success: boolean; message: string }> {
  const t = transaction || (await (await import("../../../db/core/control-db")).default.transaction());
  const shouldCommit = !transaction;

  try {
    // Get user to check their companyId
    const user = await User.findOne({
      where: { id: userId, isDeleted: false },
      transaction: t,
    });

    if (!user) {
      if (shouldCommit) await t.rollback();
      return { success: false, message: "User not found" };
    }

    // Validate role assignment
    const validation = await validateRoleAssignment(userId, roleId);
    if (!validation.valid) {
      if (shouldCommit) await t.rollback();
      return { success: false, message: validation.error || "Invalid role assignment" };
    }

    // Update user's roleId
    await user.update({ roleId }, { transaction: t });

    if (shouldCommit) await t.commit();
    return { success: true, message: "Role assigned successfully" };
  } catch (error: any) {
    if (shouldCommit) await t.rollback();
    throw error;
  }
}

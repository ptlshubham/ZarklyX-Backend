import { Router, Request, Response } from "express";
import dbInstance from "../../../db/core/control-db";
import {
  assignPermissionToRole,
  assignBulkPermissionsToRole,
  removePermissionFromRole,
  removePermissionsFromRole,
  getRolePermissions,
  getRolesWithPermission,
  roleHasPermission,
  syncRolePermissions,
  getRolePermissionIds,
  cloneRolePermissions,
  getRolePermissionCount,
} from "../../api-webapp/role-permissions/role-permissions-handler";
import { getRoleEffectivePermissions } from "../../api-webapp/rbac/rbac-check-handler";
import { Permissions } from "../../api-webapp/superAdmin/permissions/permissions-model";
import { Modules } from "../../api-webapp/superAdmin/modules/modules-model";
import { checkCompanyModuleAccess, checkCompanyPermissionAccess } from "../../api-webapp/rbac/rbac-check-handler";

const router = Router();

// Assign a single permission to a role
router.post("/assignPermission", async (req: Request, res: Response) => {
  const { roleId, permissionId } = req.body;

  if (!roleId || !permissionId) {
    return res.status(400).json({
      success: false,
      message: "RoleId and permissionId are required",
    });
  }

  const t = await dbInstance.transaction();
  try {
    const assignment = await assignPermissionToRole(roleId, permissionId, t);
    await t.commit();
    
    // Fetch permission with module details
    const permission = await Permissions.findByPk(permissionId, {
      include: [{
        model: Modules,
        as: "module",
      }],
    });

    return res.status(201).json({
      success: true,
      data: {
        assignment,
        permission,
      },
      message: "Permission assigned to role successfully",
    });
  } catch (error: any) {
    await t.rollback();
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({
        success: false,
        message: "Permission is already assigned to this role",
      });
    }
    return res.status(500).json({
      success: false,
      message: error.message || "Error assigning permission to role",
    });
  }
});

// Bulk assign permissions to a role
router.post("/assignBulkPermissions", async (req: Request, res: Response) => {
  const { roleId, permissionIds } = req.body;

  if (!roleId || !Array.isArray(permissionIds) || permissionIds.length === 0) {
    return res.status(400).json({
      success: false,
      message: "RoleId and array of permissionIds are required",
    });
  }

  const t = await dbInstance.transaction();
  try {
    const assignments = await assignBulkPermissionsToRole(roleId, permissionIds, t);
    await t.commit();
    
    // Fetch permissions with module details
    const permissions = await Permissions.findAll({
      where: { id: permissionIds },
      include: [{
        model: Modules,
        as: "module",
      }],
    });

    return res.status(201).json({
      success: true,
      data: {
        assignments,
        permissions,
      },
      message: `${assignments.length} permissions assigned to role successfully`,
    });
  } catch (error: any) {
    await t.rollback();
    return res.status(500).json({
      success: false,
      message: error.message || "Error assigning permissions to role",
    });
  }
});

// Remove a single permission from a role
router.delete("/removePermission", async (req: Request, res: Response) => {
  const { roleId, permissionId } = req.body;

  if (!roleId || !permissionId) {
    return res.status(400).json({
      success: false,
      message: "RoleId and permissionId are required",
    });
  }

  const t = await dbInstance.transaction();
  try {
    const removed = await removePermissionFromRole(roleId, permissionId, t);
    await t.commit();

    if (!removed) {
      return res.status(404).json({
        success: false,
        message: "Permission assignment not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: null,
      message: "Permission removed from role successfully",
    });
  } catch (error: any) {
    await t.rollback();
    return res.status(500).json({
      success: false,
      message: error.message || "Error removing permission from role",
    });
  }
});

// Bulk remove permissions from a role
router.delete("/removePermissions", async (req: Request, res: Response) => {
  const { roleId, permissionIds } = req.body;

  if (!roleId || !Array.isArray(permissionIds) || permissionIds.length === 0) {
    return res.status(400).json({
      success: false,
      message: "RoleId and array of permissionIds are required",
    });
  }

  const t = await dbInstance.transaction();
  try {
    const removed = await removePermissionsFromRole(roleId, permissionIds, t);
    await t.commit();
    return res.status(200).json({
      success: true,
      data: { count: removed },
      message: `${removed} permissions removed from role successfully`,
    });
  } catch (error: any) {
    await t.rollback();
    return res.status(500).json({
      success: false,
      message: error.message || "Error removing permissions from role",
    });
  }
});

// Get all permissions for a role
router.get("/getRolePermissions/:roleId", async (req: Request, res: Response) => {
  let { roleId } = req.params;
  if(Array.isArray(roleId))  roleId = roleId[0];

  try {
    const permissions = await getRolePermissions(roleId);
    return res.status(200).json({
      success: true,
      data: permissions,
      message: "Role permissions fetched successfully",
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error.message || "Error fetching role permissions",
    });
  }
});

// Get permission IDs only for a role
router.get("/getRolePermissionIds/:roleId", async (req: Request, res: Response) => {
  let { roleId } = req.params;
  if(Array.isArray(roleId))  roleId = roleId[0];

  try {
    const permissionIds = await getRolePermissionIds(roleId);
    return res.status(200).json({
      success: true,
      data: permissionIds,
      message: "Role permission IDs fetched successfully",
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error.message || "Error fetching role permission IDs",
    });
  }
});

// Get all roles that have a specific permission
router.get("/getRolesWithPermission/:permissionId", async (req: Request, res: Response) => {
  let { permissionId } = req.params;
  if(Array.isArray(permissionId))  permissionId = permissionId[0];

  try {
    const roles = await getRolesWithPermission(permissionId);
    return res.status(200).json({
      success: true,
      data: roles,
      message: "Roles with permission fetched successfully",
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error.message || "Error fetching roles with permission",
    });
  }
});

// Check if a role has a specific permission
router.get("/checkRolePermission", async (req: Request, res: Response) => {
  const { roleId, permissionId } = req.query;

  if (!roleId || !permissionId) {
    return res.status(400).json({
      success: false,
      message: "RoleId and permissionId are required",
    });
  }

  try {
    const hasPermission = await roleHasPermission(
      roleId as string,
      permissionId as string
    );
    return res.status(200).json({
      success: true,
      data: { hasPermission },
      message: hasPermission
        ? "Role has this permission"
        : "Role does not have this permission",
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error.message || "Error checking role permission",
    });
  }
});

// Sync role permissions (replace all)
router.put("/syncRolePermissions", async (req: Request, res: Response) => {
  const { roleId, permissionIds } = req.body;

  if (!roleId || !Array.isArray(permissionIds)) {
    return res.status(400).json({
      success: false,
      message: "RoleId and array of permissionIds are required",
    });
  }

  const t = await dbInstance.transaction();
  try {
    const assignments = await syncRolePermissions(roleId, permissionIds, t);
    await t.commit();
    return res.status(200).json({
      success: true,
      data: assignments,
      message: `Role permissions synced successfully (${assignments.length} permissions)`,
    });
  } catch (error: any) {
    await t.rollback();
    return res.status(500).json({
      success: false,
      message: error.message || "Error syncing role permissions",
    });
  }
});

// Clone permissions from one role to another
router.post("/cloneRolePermissions", async (req: Request, res: Response) => {
  const { sourceRoleId, targetRoleId } = req.body;

  if (!sourceRoleId || !targetRoleId) {
    return res.status(400).json({
      success: false,
      message: "SourceRoleId and targetRoleId are required",
    });
  }

  const t = await dbInstance.transaction();
  try {
    const assignments = await cloneRolePermissions(sourceRoleId, targetRoleId, t);
    await t.commit();
    return res.status(201).json({
      success: true,
      data: assignments,
      message: `${assignments.length} permissions cloned successfully`,
    });
  } catch (error: any) {
    await t.rollback();
    return res.status(500).json({
      success: false,
      message: error.message || "Error cloning role permissions",
    });
  }
});

// Get permission count for a role
router.get("/getRolePermissionCount/:roleId", async (req: Request, res: Response) => {
  let { roleId } = req.params;
  if(Array.isArray(roleId))  roleId = roleId[0];

  try {
    const count = await getRolePermissionCount(roleId);
    return res.status(200).json({
      success: true,
      data: { count },
      message: "Role permission count fetched successfully",
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error.message || "Error fetching role permission count",
    });
  }
});

// Get all permissions for a role (directly assigned only)
router.get("/getEffectivePermissions/:roleId", async (req: Request, res: Response) => {
  let { roleId } = req.params;
  if (Array.isArray(roleId)) roleId = roleId[0];

  try {
    const permissionIds = await getRoleEffectivePermissions(roleId);
    
    // Fetch full permission details
    const permissions = await Permissions.findAll({
      where: {
        id: permissionIds,
        isActive: true,
        isDeleted: false,
      },
    });

    return res.status(200).json({
      success: true,
      data: {
        roleId,
        permissionCount: permissions.length,
        permissions,
      },
      message: "Role permissions fetched successfully",
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error.message || "Error fetching role permissions",
    });
  }
});

// Get role permissions filtered by company access (for UI dropdown when cloning roles)
router.get("/getAccessiblePermissions/:roleId/:companyId", async (req: Request, res: Response) => {
  let { roleId, companyId } = req.params;
  if (Array.isArray(roleId)) roleId = roleId[0];
  if (Array.isArray(companyId)) companyId = companyId[0];

  if (!roleId || !companyId) {
    return res.status(400).json({
      success: false,
      message: "roleId and companyId are required",
    });
  }

  try {
    // Get all permissions from the role
    const permissionIds = await getRoleEffectivePermissions(roleId);
    
    // Fetch full permission details with module info
    const allPermissions = await Permissions.findAll({
      where: {
        id: permissionIds,
        isActive: true,
        isDeleted: false,
      },
      include: [
        {
          model: Modules,
          as: "module",
          attributes: ["id", "name", "isFreeForAll"]
        }
      ]
    });

    // Filter permissions based on company access
    const accessiblePermissions = [];
    const inaccessiblePermissions = [];

    for (const permission of allPermissions) {
      // Check if permission is subscription-exempt (always accessible)
      if ((permission as any).isSubscriptionExempt) {
        accessiblePermissions.push(permission);
        continue;
      }

      // Check if module is free for all
      const module = (permission as any).module;
      if (module?.isFreeForAll) {
        accessiblePermissions.push(permission);
        continue;
      }

      // Check company has module access
      const hasModuleAccess = await checkCompanyModuleAccess(companyId, permission.moduleId);
      
      if (hasModuleAccess) {
        accessiblePermissions.push(permission);
        continue;
      }

      // Check company has specific permission access
      const hasPermissionAccess = await checkCompanyPermissionAccess(companyId, permission.id);
      
      if (hasPermissionAccess) {
        accessiblePermissions.push(permission);
      } else {
        inaccessiblePermissions.push({
          id: permission.id,
          name: permission.name,
          action: permission.action,
          moduleName: module?.name || "Unknown"
        });
      }
    }

    return res.status(200).json({
      success: true,
      data: {
        roleId,
        companyId,
        accessible: {
          count: accessiblePermissions.length,
          permissions: accessiblePermissions
        },
        inaccessible: {
          count: inaccessiblePermissions.length,
          permissions: inaccessiblePermissions,
          message: inaccessiblePermissions.length > 0 
            ? "These permissions require purchasing the corresponding modules or permission addons"
            : null
        },
        summary: {
          totalPermissions: allPermissions.length,
          accessibleCount: accessiblePermissions.length,
          inaccessibleCount: inaccessiblePermissions.length,
          accessPercentage: Math.round((accessiblePermissions.length / allPermissions.length) * 100)
        }
      },
      message: "Role permissions filtered by company access",
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error.message || "Error fetching accessible permissions",
    });
  }
});

export default router;

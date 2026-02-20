import { Router, Request, Response } from "express";
import dbInstance from "../../../db/core/control-db";
import {
  createUserPermissionOverride,
  createUserPermissionOverrides,
  getUserPermissionOverrides,
  getActiveUserPermissionOverrides,
  getUserPermissionOverride,
  removeUserPermissionOverride,
  removeAllUserPermissionOverrides,
  cleanupExpiredOverrides,
  getUsersWithPermissionOverride,
  updateOverrideExpiration,
  getUserPermissionOverrideStats,
  validateOverrideAuthorization,
} from "../../api-webapp/user-permission-overrides/user-permission-overrides-handler";
import { assignRoleToUser } from "../../api-webapp/roles/role-handler";
import { getRolePermissions } from "../../api-webapp/role-permissions/role-permissions-handler";
import { User } from "../../api-webapp/authentication/user/user-model";
import { Role } from "../../api-webapp/roles/role-model";
import { expandPermissionsWithCascade, expandPermissionsForRemovalCascade } from "../../api-webapp/rbac/rbac-check-handler";

const router = Router();

// Create a permission override for a user
router.post("/createOverride", async (req: Request, res: Response) => {
  const { userId, permissionId, effect, reason, expiresAt, grantedByUserId, roleId } = req.body;

  if (!userId || !permissionId || !effect) {
    return res.status(400).json({
      success: false,
      message: "UserId, permissionId, and effect are required",
    });
  }

  if (!["allow", "deny"].includes(effect)) {
    return res.status(400).json({
      success: false,
      message: "Effect must be 'allow' or 'deny'",
    });
  }

  // SECURITY: Require grantedByUserId for authorization
  if (!grantedByUserId) {
    return res.status(400).json({
      success: false,
      message: "grantedByUserId is required for authorization",
    });
  }

  // Validate authorization (priority check)
  const authCheck = await validateOverrideAuthorization(grantedByUserId, userId, permissionId);
  if (!authCheck.valid) {
    return res.status(403).json({
      success: false,
      message: authCheck.error,
    });
  }

  const t = await dbInstance.transaction();
  try {
    // Assign role to user if roleId is provided
    if (roleId) {
      const roleResult = await assignRoleToUser(userId, roleId, t);
      if (!roleResult.success) {
        await t.rollback();
        return res.status(400).json({
          success: false,
          message: roleResult.message,
        });
      }
    }

    const override = await createUserPermissionOverride(
      {
        userId,
        permissionId,
        effect,
        reason,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        grantedByUserId,
      },
      t
    );

    await t.commit();
    return res.status(201).json({
      success: true,
      data: override,
      message: roleId
        ? "Permission override created and role assigned successfully"
        : "Permission override created successfully",
    });
  } catch (error: any) {
    await t.rollback();
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({
        success: false,
        message: "Permission override already exists for this user",
      });
    }
    return res.status(500).json({
      success: false,
      message: error.message || "Error creating permission override",
    });
  }
});

// Bulk create permission overrides for a user
router.post("/createOverrides", async (req: Request, res: Response) => {
  const { userId, overrides, grantedByUserId, enableCascade = true } = req.body;

  if (!userId || !Array.isArray(overrides) || overrides.length === 0) {
    return res.status(400).json({
      success: false,
      message: "UserId and array of overrides are required",
    });
  }

  // SECURITY: Require grantedByUserId for authorization
  if (!grantedByUserId) {
    return res.status(400).json({
      success: false,
      message: "grantedByUserId is required for authorization",
    });
  }

  const t = await dbInstance.transaction();
  try {
    // Apply cascading logic for "allow" overrides
    let finalOverrides = [...overrides];
    
    if (enableCascade) {
      // Separate allow and deny overrides
      const allowOverrides = overrides.filter((o: any) => o.effect === "allow");
      const denyOverrides = overrides.filter((o: any) => o.effect === "deny");
      
      // Cascade allow overrides (parent → children)
      if (allowOverrides.length > 0) {
        const allowPermissionIds = allowOverrides.map((o: any) => o.permissionId);
        const expandedAllowIds = await expandPermissionsWithCascade(allowPermissionIds);
        
        // Create expanded allow overrides
        finalOverrides = [
          ...expandedAllowIds.map(permId => {
            const original = allowOverrides.find((o: any) => o.permissionId === permId);
            return {
              permissionId: permId,
              effect: "allow" as const,
              reason: original?.reason || "Cascaded from parent module",
              expiresAt: original?.expiresAt,
            };
          }),
          ...denyOverrides, // Keep deny overrides as-is
        ];
      }
      
      // Cascade deny overrides (child → parents)
      if (denyOverrides.length > 0) {
        const denyPermissionIds = denyOverrides.map((o: any) => o.permissionId);
        const expandedDenyIds = await expandPermissionsForRemovalCascade(denyPermissionIds);
        
        // Create expanded deny overrides
        finalOverrides = [
          ...allowOverrides, // Keep allow overrides as-is
          ...expandedDenyIds.map(permId => {
            const original = denyOverrides.find((o: any) => o.permissionId === permId);
            return {
              permissionId: permId,
              effect: "deny" as const,
              reason: original?.reason || "Cascaded from child module denial",
              expiresAt: original?.expiresAt,
            };
          }),
        ];
      }
    }

    // Validate authorization for each permission (priority check)
    for (const override of finalOverrides) {
      const authCheck = await validateOverrideAuthorization(
        grantedByUserId,
        userId,
        override.permissionId
      );
      if (!authCheck.valid) {
        await t.rollback();
        return res.status(403).json({
          success: false,
          message: `Authorization failed for permission ${override.permissionId}: ${authCheck.error}`,
        });
      }
    }

    const results = await createUserPermissionOverrides(
      userId,
      finalOverrides.map((o: any) => ({
        permissionId: o.permissionId,
        effect: o.effect,
        reason: o.reason,
        expiresAt: o.expiresAt ? new Date(o.expiresAt) : null,
      })),
      grantedByUserId,
      t
    );
    await t.commit();
    
    return res.status(201).json({
      success: true,
      data: {
        overrides: results,
        cascaded: enableCascade && finalOverrides.length > overrides.length,
        totalCreated: results.length,
        originalCount: overrides.length,
      },
      message: enableCascade && finalOverrides.length > overrides.length
        ? `${results.length} permission overrides created (${finalOverrides.length - overrides.length} cascaded)`
        : `${results.length} permission overrides created successfully`,
    });
  } catch (error: any) {
    await t.rollback();
    return res.status(500).json({
      success: false,
      message: error.message || "Error creating permission overrides",
    });
  }
});

// Get all permission overrides for a user
router.get("/getUserOverrides/:userId", async (req: Request, res: Response) => {
  let { userId } = req.params;
  if (Array.isArray(userId)) userId = userId[0];
  const { includeExpired } = req.query;

  try {
    const overrides = await getUserPermissionOverrides(
      userId,
      includeExpired === "true"
    );
    return res.status(200).json({
      success: true,
      data: overrides,
      message: "User permission overrides fetched successfully",
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error.message || "Error fetching user permission overrides",
    });
  }
});

// Get active (non-expired) permission overrides for a user
router.get("/getActiveUserOverrides/:userId", async (req: Request, res: Response) => {
  let { userId } = req.params;
  if (Array.isArray(userId)) userId = userId[0];

  try {
    const overrides = await getActiveUserPermissionOverrides(userId);
    return res.status(200).json({
      success: true,
      data: overrides,
      message: "Active user permission overrides fetched successfully",
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error.message || "Error fetching active user permission overrides",
    });
  }
});

// Get a specific permission override
router.get("/getOverride", async (req: Request, res: Response) => {
  const { userId, permissionId } = req.query;

  if (!userId || !permissionId) {
    return res.status(400).json({
      success: false,
      message: "UserId and permissionId are required",
    });
  }

  try {
    const override = await getUserPermissionOverride(
      userId as string,
      permissionId as string
    );

    if (!override) {
      return res.status(404).json({
        success: false,
        message: "Permission override not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: override,
      message: "Permission override fetched successfully",
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error.message || "Error fetching permission override",
    });
  }
});

// Check if user has a permission override
router.get("/checkOverride", async (req: Request, res: Response) => {
  const { userId, permissionId } = req.query;

  if (!userId || !permissionId) {
    return res.status(400).json({
      success: false,
      message: "UserId and permissionId are required",
    });
  }

  try {
    const override = await getUserPermissionOverride(
      userId as string,
      permissionId as string
    );

    const hasOverride = !!override;
    const result = {
      hasOverride,
      effect: override?.effect,
      isExpired: override?.expiresAt ? override.expiresAt < new Date() : false,
    };

    return res.status(200).json({
      success: true,
      data: result,
      message: hasOverride
        ? "User has permission override"
        : "User does not have permission override",
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error.message || "Error checking permission override",
    });
  }
});

// Remove a permission override
router.delete("/removeOverride", async (req: Request, res: Response) => {
  const { userId, permissionId } = req.body;

  if (!userId || !permissionId) {
    return res.status(400).json({
      success: false,
      message: "UserId and permissionId are required",
    });
  }

  const t = await dbInstance.transaction();
  try {
    const removed = await removeUserPermissionOverride(userId, permissionId, t);
    await t.commit();

    if (!removed) {
      return res.status(404).json({
        success: false,
        message: "Permission override not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: null,
      message: "Permission override removed successfully",
    });
  } catch (error: any) {
    await t.rollback();
    return res.status(500).json({
      success: false,
      message: error.message || "Error removing permission override",
    });
  }
});

// Remove all permission overrides for a user
router.delete("/removeAllOverrides/:userId", async (req: Request, res: Response) => {
  let { userId } = req.params;
  if (Array.isArray(userId)) userId = userId[0];

  const t = await dbInstance.transaction();
  try {
    const count = await removeAllUserPermissionOverrides(userId, t);
    await t.commit();
    return res.status(200).json({
      success: true,
      data: { count },
      message: `${count} permission overrides removed successfully`,
    });
  } catch (error: any) {
    await t.rollback();
    return res.status(500).json({
      success: false,
      message: error.message || "Error removing permission overrides",
    });
  }
});

// Update override expiration
router.put("/updateExpiration", async (req: Request, res: Response) => {
  const { userId, permissionId, expiresAt } = req.body;

  if (!userId || !permissionId) {
    return res.status(400).json({
      success: false,
      message: "UserId and permissionId are required",
    });
  }

  const t = await dbInstance.transaction();
  try {
    const override = await updateOverrideExpiration(
      userId,
      permissionId,
      expiresAt ? new Date(expiresAt) : null,
      t
    );
    await t.commit();

    if (!override) {
      return res.status(404).json({
        success: false,
        message: "Permission override not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: override,
      message: "Override expiration updated successfully",
    });
  } catch (error: any) {
    await t.rollback();
    return res.status(500).json({
      success: false,
      message: error.message || "Error updating override expiration",
    });
  }
});

// Update user role
router.put("/updateUserRole", async (req: Request, res: Response) => {
  const { userId, roleId } = req.body;

  if (!userId || !roleId) {
    return res.status(400).json({
      success: false,
      message: "userId and roleId are required",
    });
  }

  const t = await dbInstance.transaction();
  try {
    const result = await assignRoleToUser(userId, roleId, t);

    if (!result.success) {
      await t.rollback();
      return res.status(400).json({
        success: false,
        message: result.message,
      });
    }

    await t.commit();
    return res.status(200).json({
      success: true,
      message: result.message,
    });
  } catch (error: any) {
    await t.rollback();
    return res.status(500).json({
      success: false,
      message: error.message || "Error updating user role",
    });
  }
});

// Get user role, permissions, and overrides
router.get("/getUserRoleAndPermissions/:userId", async (req: Request, res: Response) => {
  let { userId } = req.params;
  if (Array.isArray(userId)) userId = userId[0];

  try {
    // Get user with role
    const user = await User.findOne({
      where: { id: userId, isDeleted: false },
      include: [{ model: Role, as: "role" }],
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const role = (user as any).role;
    let rolePermissions: any[] = [];
    if (role) {
      rolePermissions = await getRolePermissions(role.id);
    }

    // Get user permission overrides
    const overrides = await getActiveUserPermissionOverrides(userId);

    return res.status(200).json({
      success: true,
      data: {
        userId,
        role: role ? {
          id: role.id,
          name: role.name,
          permissions: rolePermissions,
        } : null,
        overrides,
      },
      message: "User role and permissions fetched successfully",
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error.message || "Error fetching user role and permissions",
    });
  }
});

// Get users without role assignment by company
router.get("/getUsersWithoutRole/:companyId", async (req: Request, res: Response) => {
  let { companyId } = req.params;
  if (Array.isArray(companyId)) companyId = companyId[0];

  try {
    const users = await User.findAll({
      where: {
        companyId,
        roleId: null,
        isDeleted: false,
      },
    });

    return res.status(200).json({
      success: true,
      data: users,
      message: `${users.length} users without role assignment found`,
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error.message || "Error fetching users without role",
    });
  }
});

// Get all users by company (with and without roles)
router.get("/getAllUsersByCompany/:companyId", async (req: Request, res: Response) => {
  let { companyId } = req.params;
  if (Array.isArray(companyId)) companyId = companyId[0];

  try {
    const users = await User.findAll({
      where: {
        companyId,
        isDeleted: false,
      },
      include: [{ model: Role, as: "role" }],
    });

    const usersWithRole = users.filter(u => (u as any).role !== null);
    const usersWithoutRole = users.filter(u => (u as any).role === null);

    return res.status(200).json({
      success: true,
      data: {
        totalUsers: users.length,
        usersWithRole: usersWithRole.map(u => ({
          ...u.toJSON(),
          role: (u as any).role,
        })),
        usersWithoutRole: usersWithoutRole.map(u => u.toJSON()),
      },
      message: `${users.length} total users found (${usersWithRole.length} with role, ${usersWithoutRole.length} without role)`,
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error.message || "Error fetching users by company",
    });
  }
});

// Get users with assigned roles by company
router.get("/getUsersWithRole/:companyId", async (req: Request, res: Response) => {
  let { companyId } = req.params;
  if (Array.isArray(companyId)) companyId = companyId[0];

  try {
    const users = await User.findAll({
      where: {
        companyId,
        roleId: { [require('sequelize').Op.ne]: null },
        isDeleted: false,
      },
      include: [{ model: Role, as: "role" }],
    });

    return res.status(200).json({
      success: true,
      data: users.map(u => ({
        ...u.toJSON(),
        role: (u as any).role,
      })),
      message: `${users.length} users with assigned roles found`,
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error.message || "Error fetching users with roles",
    });
  }
});

// Cleanup expired overrides
router.delete("/cleanupExpired", async (req: Request, res: Response) => {
  const { userId } = req.query;

  const t = await dbInstance.transaction();
  try {
    const count = await cleanupExpiredOverrides(
      userId as string | undefined,
      t
    );
    await t.commit();
    return res.status(200).json({
      success: true,
      data: { count },
      message: `${count} expired overrides cleaned up successfully`,
    });
  } catch (error: any) {
    await t.rollback();
    return res.status(500).json({
      success: false,
      message: error.message || "Error cleaning up expired overrides",
    });
  }
});

// Get users with a specific permission override
router.get("/getUsersWithOverride/:permissionId", async (req: Request, res: Response) => {
  let { permissionId } = req.params;
  if (Array.isArray(permissionId)) permissionId = permissionId[0];

  try {
    const users = await getUsersWithPermissionOverride(permissionId);
    return res.status(200).json({
      success: true,
      data: users,
      message: "Users with permission override fetched successfully",
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error.message || "Error fetching users with permission override",
    });
  }
});

// Get permission override statistics for a user
router.get("/getOverrideStats/:userId", async (req: Request, res: Response) => {
  let { userId } = req.params;
  if (Array.isArray(userId)) userId = userId[0];

  try {
    const stats = await getUserPermissionOverrideStats(userId);
    return res.status(200).json({
      success: true,
      data: stats,
      message: "User permission override stats fetched successfully",
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: error.message || "Error fetching user permission override stats",
    });
  }
});

export default router;

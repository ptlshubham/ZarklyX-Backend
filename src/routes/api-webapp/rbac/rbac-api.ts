import { Router, Request, Response } from "express";
import {
  checkUserPermission,
  getUserEffectivePermissions,
  getUserAccessibleModules,
} from "./rbac-check-handler";
import { User } from "../../api-webapp/authentication/user/user-model";
import { Role } from "../../api-webapp/roles/role-model";
import { getUserAccessSnapshot } from "../../api-webapp/rbac/rbac-check-handler";
import { tokenMiddleWare } from "../../../services/jwtToken-service";

const router = Router();

// Apply authentication middleware to all routes
router.use(tokenMiddleWare);

/**
 * IMPROVEMENT 1: Effective permissions snapshot endpoint
 * GET /api/rbac/effective-permissions/:userId
 * 
 * Returns complete permission snapshot for debugging and support.
 * Useful for:
 * - Support tickets ("why can't user X do Y?")
 * - Enterprise onboarding
 * - Permission audits
 * - Debugging access issues
 */
router.get("/effective-permissions/:userId", async (req: Request, res: Response) => {
  let { userId } = req.params;
  if (Array.isArray(userId)) userId = userId[0];

  if (!userId) {
    return res.status(400).json({
      success: false,
      message: "UserId is required",
    });
  }

  try {
    const user = await User.findByPk(userId, {
      include: [
        {
          model: Role,
          as: "role",
        },
      ],
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Get all effective permissions
    const effectivePermissions = await getUserEffectivePermissions(userId);

    // Get accessible modules
    const accessibleModules = await getUserAccessibleModules(userId);

    // Compile complete snapshot
    const snapshot = {
      userId: user.id,
      userName: `${user.firstName} ${user.lastName}`,
      email: user.email,
      companyId: user.companyId,
      role: {
        id: (user as any).role?.id,
        name: (user as any).role?.name,
        priority: (user as any).role?.priority,
        scope: (user as any).role?.scope,
        isSystemRole: (user as any).role?.isSystemRole,
      },
      accessibleModules: accessibleModules,
      permissions: {
        fromRole: effectivePermissions.rolePermissions,
        allowOverrides: effectivePermissions.allowOverrides,
        denyOverrides: effectivePermissions.denyOverrides,
      },
      summary: {
        totalRolePermissions: effectivePermissions.rolePermissions.length,
        totalAllowOverrides: effectivePermissions.allowOverrides.length,
        totalDenyOverrides: effectivePermissions.denyOverrides.length,
        totalAccessibleModules: accessibleModules.length,
        effectivePermissions:
          effectivePermissions.rolePermissions.length +
          effectivePermissions.allowOverrides.length -
          effectivePermissions.denyOverrides.length,
      },
      notes: {
        denyWins: "DENY overrides always take precedence over role permissions and ALLOW overrides",
        moduleFirst: "Module access is checked before any permission checks",
        priority: `Role priority: ${(user as any).role?.priority} (lower = higher authority)`,
      },
    };

    return res.status(200).json({
      success: true,
      data: snapshot,
      message: "Effective permissions retrieved successfully",
    });
  } catch (error: any) {
    console.error("Error retrieving effective permissions:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Error retrieving effective permissions",
    });
  }
});

/**
 * Check specific permission for a user (debugging endpoint)
 * POST /api/rbac/check-permission
 */
router.post("/check-permission", async (req: Request, res: Response) => {
  const { userId, permissionKey } = req.body;

  if (!userId || !permissionKey) {
    return res.status(400).json({
      success: false,
      message: "UserId and permissionKey are required",
    });
  }

  try {
    const result = await checkUserPermission(userId, permissionKey);

    return res.status(200).json({
      success: true,
      data: result,
      message: "Permission check completed",
    });
  } catch (error: any) {
    console.error("Error checking permission:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Error checking permission",
    });
  }
});

/**
 * Get user's accessible modules (UI menu generation)
 * GET /api/rbac/accessible-modules/:userId
 */
router.get("/accessible-modules/:userId", async (req: Request, res: Response) => {
  let { userId } = req.params;
  if (Array.isArray(userId)) userId = userId[0];

  if (!userId) {
    return res.status(400).json({
      success: false,
      message: "UserId is required",
    });
  }

  try {
    const modules = await getUserAccessibleModules(userId);

    return res.status(200).json({
      success: true,
      data: {
        userId,
        modules,
        count: modules.length,
      },
      message: "Accessible modules retrieved successfully",
    });
  } catch (error: any) {
    console.error("Error retrieving accessible modules:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Error retrieving accessible modules",
    });
  }
});

// Efficient user access snapshot endpoint
router.get("/my-access", async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id; // Use authenticated user
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const snapshot = await getUserAccessSnapshot(userId);

    return res.status(200).json({
      success: true,
      data: snapshot,
      message: "User access snapshot retrieved successfully",
    });
  } catch (error: any) {
    console.error("Error generating access snapshot:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to generate access snapshot",
    });
  }
});

export default router;

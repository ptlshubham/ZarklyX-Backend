import express, { Request, Response } from "express";
import { zarklyXAuthMiddleware } from "../../../../../middleware/zarklyX-auth.middleware";
import {
  getUserPermissionOverrides,
  createPermissionOverride,
  bulkCreatePermissionOverrides,
  deletePermissionOverride,
  deleteAllUserOverrides,
  validateOverrideAuthorization,
} from "../../../../api-webapp/superAdmin/rbac/user-permission-overrides/user-permission-overrides-handler";
import {
  expandZarklyXPermissionsWithCascade,
  expandZarklyXPermissionsForRemovalCascade,
} from "../../../../api-webapp/superAdmin/rbac/zarklyX-rbac-check-handler";

const router = express.Router();

/**
 * GET /api/zarklyx/overrides/getAllUserPermissionById/:userId
 * Get all permission overrides for a user
 */
router.get("/getAllUserPermissionById/:userId", zarklyXAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    let { userId } = req.params;
    if(Array.isArray(userId)) userId = userId[0];

    const result = await getUserPermissionOverrides(userId);

    if (!result.success) {
      res.status(400).json(result);
      return;
    }

    res.status(200).json({
      success: true,
      data: result.data,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch overrides",
    });
  }
});

/**
 * POST /api/zarklyx/overrides/createUserPermission
 * Create permission override for a user
 */
router.post("/createUserPermission", zarklyXAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId, permissionId, effect, reason, expiresAt } = req.body;

    if (!userId || !permissionId || !effect) {
      res.status(400).json({
        success: false,
        message: "userId, permissionId, and effect are required",
      });
      return;
    }

    if (effect !== "allow" && effect !== "deny") {
      res.status(400).json({
        success: false,
        message: "effect must be either 'allow' or 'deny'",
      });
      return;
    }

    // Validate expiresAt if provided
    let expiryDate: Date | undefined;
    if (expiresAt) {
      expiryDate = new Date(expiresAt);
      if (isNaN(expiryDate.getTime())) {
        res.status(400).json({
          success: false,
          message: "Invalid expiry date format",
        });
        return;
      }
      if (expiryDate <= new Date()) {
        res.status(400).json({
          success: false,
          message: "Expiry date must be in the future",
        });
        return;
      }
    }

    // Validate authorization
    const validation = await validateOverrideAuthorization(
      req.zarklyXUser!.id,
      userId,
      permissionId
    );

    if (!validation.valid) {
      res.status(403).json({
        success: false,
        message: validation.error,
      });
      return;
    }

    const result = await createPermissionOverride({
      userId,
      permissionId,
      effect,
      reason,
      expiresAt: expiryDate,
      grantedByUserId: req.zarklyXUser!.id,
    });

    if (!result.success) {
      res.status(400).json(result);
      return;
    }

    res.status(201).json({
      success: true,
      message: result.message,
      data: result.data,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to create override",
    });
  }
});

/**
 * POST /api/zarklyx/overrides/createBulkUserPermission
 * Bulk create permission overrides for a user
 */
router.post("/createBulkUserPermission", zarklyXAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId, overrides, enableCascade = true } = req.body;

    if (!userId || !Array.isArray(overrides) || overrides.length === 0) {
      res.status(400).json({
        success: false,
        message: "userId and overrides array are required",
      });
      return;
    }

    // Validate each override
    for (const override of overrides) {
      if (!override.permissionId || !override.effect) {
        res.status(400).json({
          success: false,
          message: "Each override must have permissionId and effect",
        });
        return;
      }

      if (override.effect !== "allow" && override.effect !== "deny") {
        res.status(400).json({
          success: false,
          message: "effect must be either 'allow' or 'deny'",
        });
        return;
      }

      if (override.expiresAt) {
        override.expiresAt = new Date(override.expiresAt);
      }
    }

    // Apply cascading logic
    let finalOverrides = [...overrides];
    
    if (enableCascade) {
      // Separate allow and deny overrides
      const allowOverrides = overrides.filter((o: any) => o.effect === "allow");
      const denyOverrides = overrides.filter((o: any) => o.effect === "deny");
      
      // Cascade allow overrides (parent → children)
      if (allowOverrides.length > 0) {
        const allowPermissionIds = allowOverrides.map((o: any) => o.permissionId);
        const expandedAllowIds = await expandZarklyXPermissionsWithCascade(allowPermissionIds);
        
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
        const expandedDenyIds = await expandZarklyXPermissionsForRemovalCascade(denyPermissionIds);
        
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

    // Validate authorization for each permission
    for (const override of finalOverrides) {
      const validation = await validateOverrideAuthorization(
        req.zarklyXUser!.id,
        userId,
        override.permissionId
      );

      if (!validation.valid) {
        res.status(403).json({
          success: false,
          message: `Authorization failed for permission ${override.permissionId}: ${validation.error}`,
        });
        return;
      }
    }

    const result = await bulkCreatePermissionOverrides(
      userId,
      finalOverrides,
      req.zarklyXUser!.id
    );

    if (!result.success) {
      res.status(400).json(result);
      return;
    }

    res.status(201).json({
      success: true,
      message: enableCascade && finalOverrides.length > overrides.length
        ? `${result.data?.length || 0} permission overrides created (${finalOverrides.length - overrides.length} cascaded)`
        : result.message,
      data: {
        overrides: result.data,
        cascaded: enableCascade && finalOverrides.length > overrides.length,
        totalCreated: result.data?.length || 0,
        originalCount: overrides.length,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to create overrides",
    });
  }
});

/**
 * DELETE /api/zarklyx/overrides/deleteUserPermission/:id
 * Delete permission override
 */
router.delete("/deleteUserPermission/:id", zarklyXAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    let { id } = req.params;
    if(Array.isArray(id)) id = id[0];

    const result = await deletePermissionOverride(id, req.zarklyXUser!.id);

    if (!result.success) {
      res.status(400).json(result);
      return;
    }

    res.status(200).json({
      success: true,
      message: result.message,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to delete override",
    });
  }
});

/**
 * DELETE /api/zarklyx/overrides/deleteAllUserPermission/:userId
 * Delete all overrides for a user
 */
router.delete("/deleteAllUserPermission/:userId", zarklyXAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    let { userId } = req.params;
    if(Array.isArray(userId)) userId = userId[0];

    const result = await deleteAllUserOverrides(userId, req.zarklyXUser!.id);

    if (!result.success) {
      res.status(400).json(result);
      return;
    }

    res.status(200).json({
      success: true,
      message: result.message,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to delete overrides",
    });
  }
});

export default router;

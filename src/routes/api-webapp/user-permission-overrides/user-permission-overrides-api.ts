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

const router = Router();

// Create a permission override for a user
router.post("/createOverride", async (req: Request, res: Response) => {
  const { userId, permissionId, effect, reason, expiresAt, grantedByUserId } = req.body;

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
      message: "Permission override created successfully",
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
  const { userId, overrides, grantedByUserId } = req.body;

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

  // Validate authorization for each permission (priority check)
  for (const override of overrides) {
    const authCheck = await validateOverrideAuthorization(
      grantedByUserId,
      userId,
      override.permissionId
    );
    if (!authCheck.valid) {
      return res.status(403).json({
        success: false,
        message: `Authorization failed for permission ${override.permissionId}: ${authCheck.error}`,
      });
    }
  }

  const t = await dbInstance.transaction();
  try {
    const results = await createUserPermissionOverrides(
      userId,
      overrides.map((o: any) => ({
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
      data: results,
      message: `${results.length} permission overrides created successfully`,
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
  if(Array.isArray(userId)) userId = userId[0];
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
  if(Array.isArray(userId)) userId = userId[0];

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
  if(Array.isArray(userId)) userId = userId[0];

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
  if(Array.isArray(permissionId)) permissionId = permissionId[0];

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
  if(Array.isArray(userId)) userId = userId[0];

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

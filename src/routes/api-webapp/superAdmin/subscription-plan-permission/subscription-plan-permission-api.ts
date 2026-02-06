import { Router, Request, Response } from "express";
import {
  createSubscriptionPlanPermission,
  bulkCreateSubscriptionPlanPermissions,
  getPermissionsBySubscriptionPlanId,
  updateSubscriptionPlanPermission,
  deleteSubscriptionPlanPermission,
  deleteAllPlanPermissions,
  hardDeleteSubscriptionPlanPermission,
  hardDeleteAllPlanPermissions,
  toggleSubscriptionPlanPermissionStatus,
} from "./subscription-plan-permission-handler";
import dbInstance from "../../../../db/core/control-db";

const router = Router();

// Create single subscription plan permission
router.post("/createSubscriptionPlanPermission", async (req: Request, res: Response): Promise<any> => {
  const t = await dbInstance.transaction();
  try {
    const { subscriptionPlanId, permissionId, source, isActive } = req.body;

    if (!subscriptionPlanId || !permissionId) {
      await t.rollback();
      return res.status(400).json({
        error: "subscriptionPlanId and permissionId are required",
      });
    }

    // Validate source if provided
    if (source && !["plan", "addon"].includes(source)) {
      await t.rollback();
      return res.status(400).json({
        error: "source must be either 'plan' or 'addon'",
      });
    }

    const planPermission = await createSubscriptionPlanPermission(
      subscriptionPlanId,
      permissionId,
      source || "plan",
      isActive !== undefined ? isActive : true,
      t
    );

    if (!planPermission) {
      await t.rollback();
      return res.status(409).json({
        success: false,
        error: "Permission already assigned to subscription plan or invalid IDs",
      });
    }

    await t.commit();
    return res.status(201).json({
      success: true,
      data: planPermission,
    });
  } catch (error: any) {
    await t.rollback();
    if (error.name === "SequelizeUniqueConstraintError") {
      return res.status(409).json({
        success: false,
        error: "Permission already assigned to subscription plan",
      });
    }
    return res.status(500).json({
      error: "Failed to create subscription plan permission",
      details: error,
    });
  }
});

// Bulk create subscription plan permissions
router.post("/bulkCreateSubscriptionPlanPermissions", async (req: Request, res: Response): Promise<any> => {
  const t = await dbInstance.transaction();
  try {
    const { subscriptionPlanId, permissionIds, source } = req.body;

    if (!subscriptionPlanId || !Array.isArray(permissionIds) || permissionIds.length === 0) {
      await t.rollback();
      return res.status(400).json({
        error: "subscriptionPlanId and permissionIds array are required",
      });
    }

    // Validate source if provided
    if (source && !["plan", "addon"].includes(source)) {
      await t.rollback();
      return res.status(400).json({
        error: "source must be either 'plan' or 'addon'",
      });
    }

    const planPermissions = await bulkCreateSubscriptionPlanPermissions(
      subscriptionPlanId,
      permissionIds,
      source || "plan",
      t
    );

    await t.commit();
    return res.status(201).json({
      success: true,
      data: planPermissions,
      count: planPermissions.length,
    });
  } catch (error: any) {
    await t.rollback();
    return res.status(500).json({
      error: "Failed to bulk create subscription plan permissions",
      details: error.message,
    });
  }
});

// Get all permissions for a subscription plan
router.get("/getPermissionsBySubscriptionPlanId/:subscriptionPlanId", async (req: Request, res: Response): Promise<any> => {
  try {
    let { subscriptionPlanId } = req.params;
    subscriptionPlanId = Array.isArray(subscriptionPlanId) ? subscriptionPlanId[0] : subscriptionPlanId;

    if (!subscriptionPlanId) {
      return res.status(400).json({
        error: "Subscription Plan ID is required",
      });
    }

    const includeInactive = req.query.includeInactive === "true";

    const permissions = await getPermissionsBySubscriptionPlanId(
      subscriptionPlanId,
      includeInactive
    );

    return res.status(200).json({
      success: true,
      data: permissions,
      count: permissions.length,
    });
  } catch (error) {
    return res.status(500).json({
      error: "Failed to fetch subscription plan permissions",
      details: error,
    });
  }
});

// Update subscription plan permission
router.patch("/updateSubscriptionPlanPermissionById/:id", async (req: Request, res: Response): Promise<any> => {
  const t = await dbInstance.transaction();
  try {
    let { id } = req.params;
    id = Array.isArray(id) ? id[0] : id;

    if (!id) {
      await t.rollback();
      return res.status(400).json({
        error: "ID is required",
      });
    }

    const updateFields: any = {};
    const { source, isActive } = req.body;

    if (source !== undefined) {
      if (!["plan", "addon"].includes(source)) {
        await t.rollback();
        return res.status(400).json({
          error: "source must be either 'plan' or 'addon'",
        });
      }
      updateFields.source = source;
    }

    if (typeof isActive === "boolean") {
      updateFields.isActive = isActive;
    }

    if (Object.keys(updateFields).length === 0) {
      await t.rollback();
      return res.status(400).json({
        error: "No valid fields to update",
      });
    }

    const updatedPermission = await updateSubscriptionPlanPermission(
      id,
      updateFields,
      t
    );

    if (!updatedPermission) {
      await t.rollback();
      return res.status(404).json({
        error: "Subscription plan permission not found",
      });
    }

    await t.commit();
    return res.status(200).json({
      success: true,
      data: updatedPermission,
    });
  } catch (error) {
    await t.rollback();
    return res.status(500).json({
      error: "Failed to update subscription plan permission",
      details: error,
    });
  }
});

// Delete subscription plan permission
router.delete("/deleteSubscriptionPlanPermissionById/:id", async (req: Request, res: Response): Promise<any> => {
  const t = await dbInstance.transaction();
  try {
    let { id } = req.params;
    id = Array.isArray(id) ? id[0] : id;

    if (!id) {
      await t.rollback();
      return res.status(400).json({
        error: "ID is required",
      });
    }

    const deleted = await deleteSubscriptionPlanPermission(id, t);

    if (!deleted) {
      await t.rollback();
      return res.status(404).json({
        error: "Subscription plan permission not found",
      });
    }

    await t.commit();
    return res.status(200).json({
      success: true,
      message: "Subscription plan permission deleted successfully",
    });
  } catch (error) {
    await t.rollback();
    return res.status(500).json({
      error: "Failed to delete subscription plan permission",
      details: error,
    });
  }
});

// Delete all permissions for a subscription plan
router.delete("/deleteAllPlanPermissions/:subscriptionPlanId", async (req: Request, res: Response): Promise<any> => {
  const t = await dbInstance.transaction();
  try {
    let { subscriptionPlanId } = req.params;
    subscriptionPlanId = Array.isArray(subscriptionPlanId) ? subscriptionPlanId[0] : subscriptionPlanId;

    if (!subscriptionPlanId) {
      await t.rollback();
      return res.status(400).json({
        error: "Subscription Plan ID is required",
      });
    }

    const affectedCount = await deleteAllPlanPermissions(subscriptionPlanId, t);

    await t.commit();
    return res.status(200).json({
      success: true,
      message: `${affectedCount} permission(s) deleted successfully`,
      count: affectedCount,
    });
  } catch (error) {
    await t.rollback();
    return res.status(500).json({
      error: "Failed to delete subscription plan permissions",
      details: error,
    });
  }
});

// Hard delete subscription plan permission (permanent)
router.delete("/hardDeleteSubscriptionPlanPermissionById/:id", async (req: Request, res: Response): Promise<any> => {
  const t = await dbInstance.transaction();
  try {
    let { id } = req.params;
    id = Array.isArray(id) ? id[0] : id;

    if (!id) {
      await t.rollback();
      return res.status(400).json({
        error: "ID is required",
      });
    }

    const deleted = await hardDeleteSubscriptionPlanPermission(id, t);

    if (!deleted) {
      await t.rollback();
      return res.status(404).json({
        error: "Subscription plan permission not found",
      });
    }

    await t.commit();
    return res.status(200).json({
      success: true,
      message: "Subscription plan permission permanently deleted",
    });
  } catch (error) {
    await t.rollback();
    return res.status(500).json({
      error: "Failed to hard delete subscription plan permission",
      details: error,
    });
  }
});

// Hard delete all permissions for a subscription plan (permanent)
router.delete("/hardDeleteAllPlanPermissions/:subscriptionPlanId", async (req: Request, res: Response): Promise<any> => {
  const t = await dbInstance.transaction();
  try {
    let { subscriptionPlanId } = req.params;
    subscriptionPlanId = Array.isArray(subscriptionPlanId) ? subscriptionPlanId[0] : subscriptionPlanId;

    if (!subscriptionPlanId) {
      await t.rollback();
      return res.status(400).json({
        error: "Subscription Plan ID is required",
      });
    }

    const affectedCount = await hardDeleteAllPlanPermissions(subscriptionPlanId, t);

    await t.commit();
    return res.status(200).json({
      success: true,
      message: `${affectedCount} permission(s) permanently deleted`,
      count: affectedCount,
    });
  } catch (error) {
    await t.rollback();
    return res.status(500).json({
      error: "Failed to hard delete subscription plan permissions",
      details: error,
    });
  }
});

// Toggle subscription plan permission status (activate/deactivate)
router.patch("/toggleSubscriptionPlanPermissionStatus/:id", async (req: Request, res: Response): Promise<any> => {
  const t = await dbInstance.transaction();
  try {
    let { id } = req.params;
    id = Array.isArray(id) ? id[0] : id;

    if (!id) {
      await t.rollback();
      return res.status(400).json({
        error: "ID is required",
      });
    }

    const { isActive } = req.body;

    if (typeof isActive !== "boolean") {
      await t.rollback();
      return res.status(400).json({
        error: "isActive must be a boolean value",
      });
    }

    const updatedPermission = await toggleSubscriptionPlanPermissionStatus(id, isActive, t);

    if (!updatedPermission) {
      await t.rollback();
      return res.status(404).json({
        error: "Subscription plan permission not found",
      });
    }

    await t.commit();
    return res.status(200).json({
      success: true,
      message: `Permission ${isActive ? "activated" : "deactivated"} successfully`,
      data: updatedPermission,
    });
  } catch (error) {
    await t.rollback();
    return res.status(500).json({
      error: "Failed to toggle subscription plan permission status",
      details: error,
    });
  }
});

export default router;

import { Router, Request, Response } from "express";
import {
  createCompanyPermission,
  bulkCreateCompanyPermissions,
  getPermissionsByCompanyId,
  getCompanyPermissionsBySource,
  updateCompanyPermission,
  deleteCompanyPermission,
  deleteAllCompanyPermissions,
  calculateCompanyPermissionCost,
} from "./company-permission-handler";
import dbInstance from "../../../../db/core/control-db";

const router = Router();

// Create single company permission addon
router.post("/createCompanyPermission", async (req: Request, res: Response): Promise<any> => {
  const t = await dbInstance.transaction();
  try {
    const { companyId, permissionId, price, source, isActive } = req.body;

    if (!companyId || !permissionId) {
      await t.rollback();
      return res.status(400).json({
        error: "companyId and permissionId are required",
      });
    }

    if (price !== undefined && (typeof price !== "number" || price < 0)) {
      await t.rollback();
      return res.status(400).json({
        error: "price must be a non-negative number",
      });
    }

    // Validate source if provided
    if (source && !["plan", "addon"].includes(source)) {
      await t.rollback();
      return res.status(400).json({
        error: "source must be either 'plan' or 'addon'",
      });
    }

    const companyPermission = await createCompanyPermission(
      companyId,
      permissionId,
      price || 0,
      source || "addon",
      null, // subscriptionId - NULL for separately purchased addons
      isActive !== undefined ? isActive : true,
      t
    );

    if (!companyPermission) {
      await t.rollback();
      return res.status(409).json({
        success: false,
        error: "Permission already assigned to company or invalid IDs",
      });
    }

    await t.commit();
    return res.status(201).json({
      success: true,
      data: companyPermission,
    });
  } catch (error: any) {
    await t.rollback();
    if (error.name === "SequelizeUniqueConstraintError") {
      return res.status(409).json({
        success: false,
        error: "Permission already assigned to company",
      });
    }
    return res.status(500).json({
      error: "Failed to create company permission",
      details: error,
    });
  }
});

// Bulk create company permission addons
router.post("/bulkCreateCompanyPermissions", async (req: Request, res: Response): Promise<any> => {
  const t = await dbInstance.transaction();
  try {
    const { companyId, permissions, source } = req.body;

    if (!companyId || !Array.isArray(permissions) || permissions.length === 0) {
      await t.rollback();
      return res.status(400).json({
        error: "companyId and permissions array are required",
      });
    }

    // Validate each permission object
    for (const perm of permissions) {
      if (!perm.permissionId) {
        await t.rollback();
        return res.status(400).json({
          error: "Each permission must have a permissionId",
        });
      }
      if (perm.price !== undefined && (typeof perm.price !== "number" || perm.price < 0)) {
        await t.rollback();
        return res.status(400).json({
          error: "price must be a non-negative number",
        });
      }
    }

    // Validate source if provided
    if (source && !["plan", "addon"].includes(source)) {
      await t.rollback();
      return res.status(400).json({
        error: "source must be either 'plan' or 'addon'",
      });
    }

    const companyPermissions = await bulkCreateCompanyPermissions(
      companyId,
      permissions,
      source || "addon",
      t
    );

    await t.commit();
    return res.status(201).json({
      success: true,
      data: companyPermissions,
      count: companyPermissions.length,
    });
  } catch (error: any) {
    await t.rollback();
    return res.status(500).json({
      error: "Failed to bulk create company permissions",
      details: error.message,
    });
  }
});

// Get all permission addons for a company
router.get("/getPermissionsByCompanyId/:companyId", async (req: Request, res: Response): Promise<any> => {
  try {
    let { companyId } = req.params;
    companyId = Array.isArray(companyId) ? companyId[0] : companyId;

    if (!companyId) {
      return res.status(400).json({
        error: "Company ID is required",
      });
    }

    const includeInactive = req.query.includeInactive === "true";

    const permissions = await getPermissionsByCompanyId(companyId, includeInactive);

    return res.status(200).json({
      success: true,
      data: permissions,
      count: permissions.length,
    });
  } catch (error) {
    return res.status(500).json({
      error: "Failed to fetch company permissions",
      details: error,
    });
  }
});

// Get company permissions by source (plan or addon)
router.get("/getCompanyPermissionsBySource/:companyId/:source", async (req: Request, res: Response): Promise<any> => {
  try {
    let { companyId, source } = req.params;
    companyId = Array.isArray(companyId) ? companyId[0] : companyId;
    source = Array.isArray(source) ? source[0] : source;

    if (!companyId || !source) {
      return res.status(400).json({
        error: "Company ID and source are required",
      });
    }

    if (!["plan", "addon"].includes(source)) {
      return res.status(400).json({
        error: "source must be either 'plan' or 'addon'",
      });
    }

    const permissions = await getCompanyPermissionsBySource(
      companyId,
      source as "plan" | "addon"
    );

    return res.status(200).json({
      success: true,
      data: permissions,
      count: permissions.length,
    });
  } catch (error) {
    return res.status(500).json({
      error: "Failed to fetch company permissions by source",
      details: error,
    });
  }
});

// Calculate total cost of company permission addons
router.get("/calculatePermissionCost/:companyId", async (req: Request, res: Response): Promise<any> => {
  try {
    let { companyId } = req.params;
    companyId = Array.isArray(companyId) ? companyId[0] : companyId;

    if (!companyId) {
      return res.status(400).json({
        error: "Company ID is required",
      });
    }

    const totalCost = await calculateCompanyPermissionCost(companyId);

    return res.status(200).json({
      success: true,
      totalCost: totalCost,
    });
  } catch (error) {
    return res.status(500).json({
      error: "Failed to calculate company permission cost",
      details: error,
    });
  }
});

// Update company permission
router.patch("/updateCompanyPermissionById/:id", async (req: Request, res: Response): Promise<any> => {
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
    const { price, source, isActive } = req.body;

    if (price !== undefined) {
      if (typeof price !== "number" || price < 0) {
        await t.rollback();
        return res.status(400).json({
          error: "price must be a non-negative number",
        });
      }
      updateFields.price = price;
    }

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

    const updatedPermission = await updateCompanyPermission(id, updateFields, t);

    if (!updatedPermission) {
      await t.rollback();
      return res.status(404).json({
        error: "Company permission not found",
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
      error: "Failed to update company permission",
      details: error,
    });
  }
});

// Delete company permission
router.delete("/deleteCompanyPermissionById/:id", async (req: Request, res: Response): Promise<any> => {
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

    const deleted = await deleteCompanyPermission(id, t);

    if (!deleted) {
      await t.rollback();
      return res.status(404).json({
        error: "Company permission not found",
      });
    }

    await t.commit();
    return res.status(200).json({
      success: true,
      message: "Company permission deleted successfully",
    });
  } catch (error) {
    await t.rollback();
    return res.status(500).json({
      error: "Failed to delete company permission",
      details: error,
    });
  }
});

// Delete all permission addons for a company
router.delete("/deleteAllCompanyPermissions/:companyId", async (req: Request, res: Response): Promise<any> => {
  const t = await dbInstance.transaction();
  try {
    let { companyId } = req.params;
    companyId = Array.isArray(companyId) ? companyId[0] : companyId;

    if (!companyId) {
      await t.rollback();
      return res.status(400).json({
        error: "Company ID is required",
      });
    }

    const affectedCount = await deleteAllCompanyPermissions(companyId, t);

    await t.commit();
    return res.status(200).json({
      success: true,
      message: `${affectedCount} permission(s) deleted successfully`,
      count: affectedCount,
    });
  } catch (error) {
    await t.rollback();
    return res.status(500).json({
      error: "Failed to delete company permissions",
      details: error,
    });
  }
});

export default router;

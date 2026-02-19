import express, { Request, Response } from "express";
import { zarklyXAuthMiddleware } from "../../../../../middleware/zarklyX-auth.middleware";
import {
  getAllZarklyXPermissions,
  getZarklyXPermissionById,
  createZarklyXPermission,
  bulkCreateZarklyXPermissions,
  updateZarklyXPermission,
  deleteZarklyXPermission,
} from "../../../../api-webapp/superAdmin/rbac/permissions/permissions-handler";

const router = express.Router();

/**
 * GET /api/zarklyx/permissions/getZarklyXPermissions
 * Get all ZarklyX permissions with pagination and filters
 */
router.get("/getZarklyXPermissions", zarklyXAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { page, limit, search, moduleId, action } = req.query;

    const result = await getAllZarklyXPermissions({
      page: page ? parseInt(page as string) : undefined,
      limit: limit ? parseInt(limit as string) : undefined,
      search: search as string,
      moduleId: moduleId as string,
      action: action as string,
    });

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
      message: error.message || "Failed to fetch permissions",
    });
  }
});

/**
 * GET /api/zarklyx/permissions/getZarklyXPermissionById/:id
 * Get single ZarklyX permission by ID
 */
router.get("/getZarklyXPermissionById/:id", zarklyXAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    let { id } = req.params;
    if(Array.isArray(id)) id = id[0];

    const result = await getZarklyXPermissionById(id);

    if (!result.success) {
      res.status(404).json(result);
      return;
    }

    res.status(200).json({
      success: true,
      data: result.data,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch permission",
    });
  }
});

/**
 * POST /api/zarklyx/permissions/createZarklyXPermission
 * Create new ZarklyX permission
 */
router.post("/createZarklyXPermission", zarklyXAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, description, displayName, moduleId, action, isSystemPermission } = req.body;

    if (!name || !displayName || !moduleId || !action) {
      res.status(400).json({
        success: false,
        message: "Name, displayName, moduleId, and action are required",
      });
      return;
    }

    // Validate inputs are not empty strings
    if (!name.trim() || !displayName.trim() || !moduleId.trim() || !action.trim()) {
      res.status(400).json({
        success: false,
        message: "Name, displayName, moduleId, and action cannot be empty",
      });
      return;
    }

    const result = await createZarklyXPermission({
      name: name.trim(),
      description: description?.trim() || '',
      displayName: displayName.trim(),
      moduleId: moduleId.trim(),
      action: action.trim(),
      isSystemPermission,
      createdBy: req.zarklyXUser!.id,
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
      message: error.message || "Failed to create permission",
    });
  }
});

/**
 * POST /api/zarklyx/permissions/createBulkZarklyXPermission
 * Bulk create ZarklyX permissions
 */
router.post("/createBulkZarklyXPermission", zarklyXAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { permissions } = req.body;

    if (!Array.isArray(permissions) || permissions.length === 0) {
      res.status(400).json({
        success: false,
        message: "permissions must be a non-empty array",
      });
      return;
    }

    // Validate each permission
    for (const perm of permissions) {
      if (!perm.name || !perm.displayName || !perm.moduleId || !perm.action) {
        res.status(400).json({
          success: false,
          message: "Each permission must have name, displayName, moduleId, and action",
        });
        return;
      }
    }

    const result = await bulkCreateZarklyXPermissions(permissions, req.zarklyXUser!.id);

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
      message: error.message || "Failed to create permissions",
    });
  }
});

/**
 * PATCH /api/zarklyx/permissions/updateZarklyXPermission/:id
 * Update ZarklyX permission
 */
router.patch("/updateZarklyXPermission/:id", zarklyXAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    let { id } = req.params;
    if(Array.isArray(id)) id = id[0];
    const { name, description, displayName, isActive } = req.body;

    const result = await updateZarklyXPermission(
      id,
      { name, description, displayName, isActive },
      req.zarklyXUser!.id
    );

    if (!result.success) {
      res.status(400).json(result);
      return;
    }

    res.status(200).json({
      success: true,
      message: result.message,
      data: result.data,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to update permission",
    });
  }
});

/**
 * DELETE /api/zarklyx/permissions/deleteZarklyXPermission/:id
 * Delete ZarklyX permission
 */
router.delete("/deleteZarklyXPermission/:id", zarklyXAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    let { id } = req.params;
    if(Array.isArray(id)) id = id[0];

    const result = await deleteZarklyXPermission(id, req.zarklyXUser!.id);

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
      message: error.message || "Failed to delete permission",
    });
  }
});

export default router;

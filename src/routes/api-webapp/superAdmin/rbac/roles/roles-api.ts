import express, { Request, Response } from "express";
import { zarklyXAuthMiddleware } from "../../../../../middleware/zarklyX-auth.middleware";
import {
  getAllZarklyXRoles,
  getZarklyXRoleById,
  createZarklyXRole,
  updateZarklyXRole,
  deleteZarklyXRole,
} from "../../../../api-webapp/superAdmin/rbac/roles/roles-handler";

const router = express.Router();

/**
 * GET /api/zarklyx/roles/getAllZarklyXRoles
 * Get all ZarklyX roles
 */
router.get("/getAllZarklyXRoles", zarklyXAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await getAllZarklyXRoles();

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
      message: error.message || "Failed to fetch roles",
    });
  }
});

/**
 * GET /api/zarklyx/roles/getZarklyXRoleById/:id
 * Get single ZarklyX role by ID
 */
router.get("/getZarklyXRoleById/:id", zarklyXAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    let { id } = req.params;
    if(Array.isArray(id)) id = id[0];

    const result = await getZarklyXRoleById(id);

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
      message: error.message || "Failed to fetch role",
    });
  }
});

/**
 * POST /api/zarklyx/roles/createZarklyXRole
 * Create new ZarklyX role
 */
router.post("/createZarklyXRole", zarklyXAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, description, priority, isSystemRole, baseRoleId } = req.body;

    if (!name || priority === undefined) {
      res.status(400).json({
        success: false,
        message: "Name and priority are required",
      });
      return;
    }

    // Validate priority is a number
    const parsedPriority = parseInt(priority);
    if (isNaN(parsedPriority) || parsedPriority < 0) {
      res.status(400).json({
        success: false,
        message: "Priority must be a non-negative number",
      });
      return;
    }

    const result = await createZarklyXRole({
      name: name.trim(),
      description: description?.trim(),
      priority: parsedPriority,
      isSystemRole,
      baseRoleId,
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
      message: error.message || "Failed to create role",
    });
  }
});

/**
 * PATCH /api/zarklyx/roles/updateZarklyXRole/:id
 * Update ZarklyX role
 */
router.patch("/updateZarklyXRole/:id", zarklyXAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    let { id } = req.params;
    if(Array.isArray(id)) id = id[0];
    const { name, description, priority, isActive } = req.body;

    const result = await updateZarklyXRole(
      id,
      { name, description, priority, isActive },
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
    console.error("❌ Update role API error:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to update role",
    });
  }
});

/**
 * DELETE /api/zarklyx/roles/deleteZarklyXRole/:id
 * Delete ZarklyX role
 */
router.delete("/deleteZarklyXRole/:id", zarklyXAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    let { id } = req.params;
    if(Array.isArray(id)) id = id[0];

    const result = await deleteZarklyXRole(id, req.zarklyXUser!.id);

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
      message: error.message || "Failed to delete role",
    });
  }
});

export default router;

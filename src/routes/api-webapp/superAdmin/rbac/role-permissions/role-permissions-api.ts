import express, { Request, Response } from "express";
import { zarklyXAuthMiddleware } from "../../../../../middleware/zarklyX-auth.middleware";
import {
  assignBulkPermissionsToRole,
  addPermissionToRole,
  removePermissionFromRole,
  getRolePermissions,
  removeAllRolePermissions,
  checkRoleHasPermission,
} from "../../../../api-webapp/superAdmin/rbac/role-permissions/role-permissions-handler";

const router = express.Router();

/**
 * POST /api/zarklyx/role-permissions/assign/:roleId
 * Assign multiple permissions to a role (replaces existing)
 */
router.post("/assign/:roleId", zarklyXAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    let { roleId } = req.params;
    if (Array.isArray(roleId)) roleId = roleId[0];

    const { permissionIds } = req.body;

    if (!Array.isArray(permissionIds) || permissionIds.length === 0) {
      res.status(400).json({
        success: false,
        message: "permissionIds must be a non-empty array",
      });
      return;
    }

    // Validate all IDs are non-empty strings
    const invalidIds = permissionIds.filter((id) => !id || typeof id !== "string" || !id.trim());
    if (invalidIds.length > 0) {
      res.status(400).json({
        success: false,
        message: "All permission IDs must be valid non-empty strings",
      });
      return;
    }

    const result = await assignBulkPermissionsToRole(roleId, permissionIds, req.zarklyXUser!.id);

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
      message: error.message || "Failed to assign permissions",
    });
  }
});

/**
 * POST /api/zarklyx/role-permissions/add/:roleId/:permissionId
 * Add single permission to a role (does not remove existing)
 */
router.post("/add/:roleId/:permissionId", zarklyXAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    let { roleId, permissionId } = req.params;
    if (Array.isArray(roleId)) roleId = roleId[0];
    if (Array.isArray(permissionId)) permissionId = permissionId[0];

    if (!roleId || !permissionId) {
      res.status(400).json({
        success: false,
        message: "Role ID and permission ID are required",
      });
      return;
    }

    const result = await addPermissionToRole(roleId, permissionId, req.zarklyXUser!.id);

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
      message: error.message || "Failed to add permission",
    });
  }
});

/**
 * DELETE /api/zarklyx/role-permissions/remove/:roleId/:permissionId
 * Remove single permission from a role
 */
router.delete("/remove/:roleId/:permissionId", zarklyXAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    let { roleId, permissionId } = req.params;
    if (Array.isArray(roleId)) roleId = roleId[0];
    if (Array.isArray(permissionId)) permissionId = permissionId[0];

    if (!roleId || !permissionId) {
      res.status(400).json({
        success: false,
        message: "Role ID and permission ID are required",
      });
      return;
    }

    const result = await removePermissionFromRole(roleId, permissionId, req.zarklyXUser!.id);

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
      message: error.message || "Failed to remove permission",
    });
  }
});

/**
 * GET /api/zarklyx/role-permissions/:roleId
 * Get all permissions for a role
 */
router.get("/:roleId", zarklyXAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    let { roleId } = req.params;
    if (Array.isArray(roleId)) roleId = roleId[0];

    if (!roleId) {
      res.status(400).json({
        success: false,
        message: "Role ID is required",
      });
      return;
    }

    const result = await getRolePermissions(roleId);

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
      message: error.message || "Failed to fetch role permissions",
    });
  }
});

/**
 * DELETE /api/zarklyx/role-permissions/:roleId
 * Remove all permissions from a role
 */
router.delete("/:roleId", zarklyXAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    let { roleId } = req.params;
    if (Array.isArray(roleId)) roleId = roleId[0];

    if (!roleId) {
      res.status(400).json({
        success: false,
        message: "Role ID is required",
      });
      return;
    }

    const result = await removeAllRolePermissions(roleId, req.zarklyXUser!.id);

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
      message: error.message || "Failed to remove permissions",
    });
  }
});

/**
 * GET /api/zarklyx/role-permissions/check/:roleId/:permissionId
 * Check if a role has a specific permission
 */
router.get("/check/:roleId/:permissionId", zarklyXAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    let { roleId, permissionId } = req.params;
    if (Array.isArray(roleId)) roleId = roleId[0];
    if (Array.isArray(permissionId)) permissionId = permissionId[0];

    if (!roleId || !permissionId) {
      res.status(400).json({
        success: false,
        message: "Role ID and permission ID are required",
      });
      return;
    }

    const result = await checkRoleHasPermission(roleId, permissionId);

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
      message: error.message || "Failed to check permission",
    });
  }
});

export default router;

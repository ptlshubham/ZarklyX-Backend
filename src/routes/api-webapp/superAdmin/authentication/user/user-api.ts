import express, { Request, Response } from "express";
import { zarklyXAuthMiddleware } from "../../../../../middleware/zarklyX-auth.middleware";
import {
  getAllZarklyXUsers,
  getZarklyXUserById,
  updateZarklyXUser,
  deleteZarklyXUser,
  toggleZarklyXUserStatus,
} from "../../../../api-webapp/superAdmin/authentication/user/user-handler";
import { resetZarklyXPassword } from "../../../../api-webapp/superAdmin/authentication/auth-handler";

const router = express.Router();

/**
 * GET /api/zarklyx/users
 * Get all ZarklyX users with pagination and filters
 */
router.get("/getZarklyXUsers", zarklyXAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { page, limit, search, roleId, department, isActive } = req.query;

    const result = await getAllZarklyXUsers({
      page: page ? parseInt(page as string) : undefined,
      limit: limit ? parseInt(limit as string) : undefined,
      search: search as string,
      roleId: roleId as string,
      department: department as string,
      isActive: isActive === "true" ? true : isActive === "false" ? false : undefined,
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
      message: error.message || "Failed to fetch users",
    });
  }
});

/**
 * GET /api/zarklyx/users/:id
 * Get single ZarklyX user by ID
 */
router.get("/getZarklyXUserById/:id", zarklyXAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    let { id } = req.params;
    if(Array.isArray(id)) id = id[0];

    const result = await getZarklyXUserById(id);

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
      message: error.message || "Failed to fetch user",
    });
  }
});

/**
 * PATCH /api/zarklyx/users/:id
 * Update ZarklyX user
 */
router.patch("/updateZarklyXUser/:id", zarklyXAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    let { id } = req.params;
    if(Array.isArray(id)) id = id[0];
    const { firstName, lastName, roleId, phoneNumber, isdCode, isoCode, department, isActive, isThemeDark } = req.body;

    // Validate inputs
    if (firstName !== undefined && !firstName.trim()) {
      res.status(400).json({
        success: false,
        message: "First name cannot be empty",
      });
      return;
    }

    if (lastName !== undefined && !lastName.trim()) {
      res.status(400).json({
        success: false,
        message: "Last name cannot be empty",
      });
      return;
    }

    const result = await updateZarklyXUser(
      id,
      {
        firstName: firstName?.trim(),
        lastName: lastName?.trim(),
        roleId,
        phoneNumber,
        isdCode,
        isoCode,
        department,
        isActive,
        isThemeDark,
      },
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
      message: error.message || "Failed to update user",
    });
  }
});

/**
 * DELETE /api/zarklyx/users/:id
 * Soft delete ZarklyX user
 */
router.delete("/deleteZarklyXUser/:id", zarklyXAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    let { id } = req.params;
    if(Array.isArray(id)) id = id[0];

    const result = await deleteZarklyXUser(id, req.zarklyXUser!.id);

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
      message: error.message || "Failed to delete user",
    });
  }
});

/**
 * POST /api/zarklyx/users/:id/toggle-status
 * Activate/Deactivate ZarklyX user
 */
router.post("/toggle-status/:id", zarklyXAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    let { id } = req.params;
    if(Array.isArray(id)) id = id[0];
    const { isActive } = req.body;

    if (typeof isActive !== "boolean") {
      res.status(400).json({
        success: false,
        message: "isActive must be a boolean",
      });
      return;
    }

    const result = await toggleZarklyXUserStatus(id, isActive, req.zarklyXUser!.id);

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
      message: error.message || "Failed to toggle user status",
    });
  }
});

/**
 * POST /api/zarklyx/users/:id/reset-password
 * Reset password for a ZarklyX user (Admin function)
 */
router.post("/reset-password/:id", zarklyXAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    let { id } = req.params;
    if(Array.isArray(id)) id = id[0];
    const { newPassword } = req.body;

    if (!newPassword) {
      res.status(400).json({
        success: false,
        message: "New password is required",
      });
      return;
    }

    if (newPassword.length < 8) {
      res.status(400).json({
        success: false,
        message: "Password must be at least 8 characters",
      });
      return;
    }

    const result = await resetZarklyXPassword(id, newPassword, req.zarklyXUser!.id);

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
      message: error.message || "Failed to reset password",
    });
  }
});

export default router;

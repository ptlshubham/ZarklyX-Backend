import express, { Request, Response } from "express";
import {
  registerZarklyXUser,
  loginZarklyXUser,
  changeZarklyXPassword,
} from "../../../api-webapp/superAdmin/authentication/auth-handler";
import { zarklyXAuthMiddleware } from "../../../../middleware/zarklyX-auth.middleware";
import { requireZarklyXRolePriority } from "../../../../middleware/zarklyX-permission.middleware";

const router = express.Router();

/**
 * POST /api/zarklyx/auth/register
 * Register a new ZarklyX internal user
 * Requires: Role priority <= 20 (SuperAdmin, PlatformAdmin, SupportLead)
 */
router.post(
  "/register",
  zarklyXAuthMiddleware,
  requireZarklyXRolePriority(20),
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { 
        email, 
        password, 
        firstName, 
        lastName, 
        roleId, 
        baseRoleId, 
        roleName, 
        roleDescription, 
        permissionIds, 
        phoneNumber, 
        isdCode, 
        isoCode, 
        department 
      } = req.body;

    // Validation
    if (!email || !password || !firstName || !lastName) {
      res.status(400).json({
        success: false,
        message: "Email, password, firstName, and lastName are required",
      });
      return;
    }

    // Must provide either roleId or baseRoleId
    if (!roleId && !baseRoleId) {
      res.status(400).json({
        success: false,
        message: "Either roleId or baseRoleId must be provided",
      });
      return;
    }

    if (password.length < 8) {
      res.status(400).json({
        success: false,
        message: "Password must be at least 8 characters",
      });
      return;
    }

    // Register user
    const result = await registerZarklyXUser({
      email,
      password,
      firstName,
      lastName,
      roleId,
      baseRoleId,
      roleName,
      roleDescription,
      permissionIds,
      phoneNumber,
      isdCode,
      isoCode,
      department,
      createdBy: req.zarklyXUser!.id,
    });

    if (!result.success) {
      res.status(400).json(result);
      return;
    }

    res.status(201).json({
      success: true,
      message: result.message,
      data: {
        user: result.user,
        token: result.token,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to register user",
    });
  }
});

/**
 * POST /api/zarklyx/auth/login
 * Login ZarklyX internal user
 * Public endpoint - no auth required
 */
router.post("/login", async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    // Validation
    if (!email || !password) {
      res.status(400).json({
        success: false,
        message: "Email and password are required",
      });
      return;
    }

    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      res.status(400).json({
        success: false,
        message: "Invalid email format",
      });
      return;
    }

    // Login user
    const result = await loginZarklyXUser(email, password);

    if (!result.success) {
      res.status(401).json(result);
      return;
    }

    // Check if 2FA is required
    if (result.requires2FA) {
      res.status(200).json({
        success: true,
        message: result.message,
        requires2FA: true,
        data: {
          user: result.user,
        },
      });
      return;
    }

    // Normal login (no 2FA)
    res.status(200).json({
      success: true,
      message: result.message,
      data: {
        user: result.user,
        token: result.token,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Login failed",
    });
  }
});

/**
 * POST /api/zarklyx/auth/logout
 * Logout ZarklyX user
 * Note: JWT tokens are stateless, so logout is handled client-side by removing the token
 */
router.post("/logout", zarklyXAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    res.status(200).json({
      success: true,
      message: "Logout successful. Please remove token from client.",
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Logout failed",
    });
  }
});

/**
 * POST /api/zarklyx/auth/change-password
 * Change password for authenticated ZarklyX user
 */
router.post("/change-password", zarklyXAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const { currentPassword, newPassword } = req.body;

    // Validation
    if (!currentPassword || !newPassword) {
      res.status(400).json({
        success: false,
        message: "Current password and new password are required",
      });
      return;
    }

    if (newPassword.length < 8) {
      res.status(400).json({
        success: false,
        message: "New password must be at least 8 characters",
      });
      return;
    }

    // Change password
    const result = await changeZarklyXPassword(
      req.zarklyXUser!.id,
      currentPassword,
      newPassword
    );

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
      message: error.message || "Failed to change password",
    });
  }
});

/**
 * GET /api/zarklyx/auth/getCurrentUserDetails
 * Get current authenticated ZarklyX user details
 */
router.get("/getCurrentUserDetails", zarklyXAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const user = req.zarklyXUser!;

    res.status(200).json({
      success: true,
      data: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        roleId: user.roleId,
        department: user.department,
        phoneNumber: user.phoneNumber,
        isdCode: user.isdCode,
        isoCode: user.isoCode,
        isThemeDark: user.isThemeDark,
        lastLoginAt: user.lastLoginAt,
        createdAt: user.createdAt,
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error.message || "Failed to get user details",
    });
  }
});

export default router;

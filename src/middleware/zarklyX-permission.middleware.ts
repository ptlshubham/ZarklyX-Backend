import { Request, Response, NextFunction } from "express";
import { 
  checkZarklyXUserPermission, 
  batchCheckZarklyXUserPermissions 
} from "../routes/api-webapp/superAdmin/rbac/zarklyX-rbac-check-handler";
import { ZarklyXRole } from "../routes/api-webapp/superAdmin/rbac/roles/roles-model";

/**
 * Middleware to check if ZarklyX user has a specific permission
 * Usage: router.get('/platform/companies', requireZarklyXPermission('platform.companies.view'), handler)
 */
export function requireZarklyXPermission(permissionKey: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.zarklyXUser?.id; // Assumes auth middleware sets req.zarklyXUser

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized - No ZarklyX user found",
        });
      }

      const result = await checkZarklyXUserPermission(userId, permissionKey);

      if (!result.hasAccess) {
        return res.status(403).json({
          success: false,
          message: `Access denied: ${result.reason}`,
          details: {
            permission: permissionKey,
            reason: result.reason,
          },
        });
      }

      // Attach permission check result to request for logging
      req.zarklyXPermissionCheck = {
        permission: permissionKey,
        granted: true,
        reason: result.reason,
      };

      next();
    } catch (error: any) {
      console.error("ZarklyX permission check error:", error);
      return res.status(500).json({
        success: false,
        message: "Error checking permissions",
        error: error.message,
      });
    }
  };
}

/**
 * Middleware to check if ZarklyX user has ANY of the specified permissions
 * Usage: router.get('/dashboard', requireAnyZarklyXPermission(['platform.analytics', 'platform.reports']), handler)
 */
export function requireAnyZarklyXPermission(permissionKeys: string[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.zarklyXUser?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized - No ZarklyX user found",
        });
      }

      const results = await batchCheckZarklyXUserPermissions(userId, permissionKeys);

      const hasAnyPermission = Object.values(results).some((hasAccess) => hasAccess);

      if (!hasAnyPermission) {
        return res.status(403).json({
          success: false,
          message: "Access denied: None of the required permissions are granted",
          details: {
            permissionsRequired: permissionKeys,
            permissionsChecked: results,
          },
        });
      }

      // Find which permissions were granted
      const grantedPermissions = Object.entries(results)
        .filter(([_, hasAccess]) => hasAccess)
        .map(([permission]) => permission);

      req.zarklyXPermissionCheck = {
        permissions: grantedPermissions,
        granted: true,
        reason: "Has one or more required permissions",
      };

      next();
    } catch (error: any) {
      console.error("ZarklyX permission check error:", error);
      return res.status(500).json({
        success: false,
        message: "Error checking permissions",
        error: error.message,
      });
    }
  };
}

/**
 * Middleware to check if ZarklyX user has ALL of the specified permissions
 * Usage: router.post('/critical', requireAllZarklyXPermissions(['platform.system', 'platform.admin']), handler)
 */
export function requireAllZarklyXPermissions(permissionKeys: string[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.zarklyXUser?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized - No ZarklyX user found",
        });
      }

      const results = await batchCheckZarklyXUserPermissions(userId, permissionKeys);

      const hasAllPermissions = Object.values(results).every((hasAccess) => hasAccess);

      if (!hasAllPermissions) {
        const deniedPermissions = Object.entries(results)
          .filter(([_, hasAccess]) => !hasAccess)
          .map(([permission]) => permission);

        return res.status(403).json({
          success: false,
          message: "Access denied: Missing required permissions",
          details: {
            permissionsRequired: permissionKeys,
            permissionsDenied: deniedPermissions,
          },
        });
      }

      req.zarklyXPermissionCheck = {
        permissions: permissionKeys,
        granted: true,
        reason: "Has all required permissions",
      };

      next();
    } catch (error: any) {
      console.error("ZarklyX permission check error:", error);
      return res.status(500).json({
        success: false,
        message: "Error checking permissions",
        error: error.message,
      });
    }
  };
}

/**
 * Middleware to ensure ZarklyX user has sufficient role priority
 * Usage: router.delete('/users', requireZarklyXRolePriority(10), handler)
 * Only allows users with priority <= specified value (lower = higher authority)
 */
export function requireZarklyXRolePriority(maxPriority: number) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.zarklyXUser?.id;
      const roleId = req.zarklyXUser?.roleId;

      if (!userId || !roleId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized - No ZarklyX user or role found",
        });
      }

      // Fetch role to check priority
      const userRole = await ZarklyXRole.findByPk(roleId);

      if (!userRole) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized - ZarklyX role not found",
        });
      }

      if (userRole.priority > maxPriority) {
        return res.status(403).json({
          success: false,
          message: `Access denied: Insufficient role authority`,
          details: {
            required: `Priority <= ${maxPriority}`,
            current: userRole.priority,
          },
        });
      }

      next();
    } catch (error: any) {
      console.error("ZarklyX role priority check error:", error);
      return res.status(500).json({
        success: false,
        message: "Error checking role priority",
        error: error.message,
      });
    }
  };
}

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      zarklyXUser?: {
        id: string;
        email: string;
        roleId: string;
      };
      zarklyXPermissionCheck?: {
        permission?: string;
        permissions?: string[];
        granted: boolean;
        reason: string;
      };
    }
  }
}

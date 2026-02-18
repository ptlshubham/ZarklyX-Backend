import { Request, Response, NextFunction } from "express";
import { checkUserPermission, batchCheckUserPermissions, checkCompanyModuleAccess } from "../routes/api-webapp/rbac/rbac-check-handler";
import { User } from "../routes/api-webapp/authentication/user/user-model";
import { Modules } from "../routes/api-webapp/superAdmin/modules/modules-model";

// Action hierarchy utilities
export const ACTION_HIERARCHY: Record<string, string[]> = {
  manage: ["create", "update", "delete", "view"],
  update: ["view"],
  create: [],
  delete: [],
  view: [],
  approve: ["view"],
  export: ["view"],
};

export function expandAction(action: string): string[] {
  const expanded = new Set<string>([action]);
  const children = ACTION_HIERARCHY[action] || [];

  for (const child of children) {
    const childExpanded = expandAction(child);
    childExpanded.forEach((a) => expanded.add(a));
  }

  return Array.from(expanded);
}

export function actionSatisfies(grantedAction: string, requiredAction: string): boolean {
  if (grantedAction === requiredAction) {
    return true;
  }

  const expandedActions = expandAction(grantedAction);
  return expandedActions.includes(requiredAction);
}

export function getActionsGranting(requiredAction: string): string[] {
  const actions = new Set<string>([requiredAction]);

  for (const [action, children] of Object.entries(ACTION_HIERARCHY)) {
    if (actionSatisfies(action, requiredAction)) {
      actions.add(action);
    }
  }

  return Array.from(actions);
}

export function parsePermissionKey(permissionKey: string): {
  module?: string;
  resource: string;
  action: string;
} {
  const parts = permissionKey.split(".");

  if (parts.length === 3) {
    return {
      module: parts[0],
      resource: parts[1],
      action: parts[2],
    };
  } else if (parts.length === 2) {
    return {
      resource: parts[0],
      action: parts[1],
    };
  } else {
    throw new Error(`Invalid permission key format: ${permissionKey}`);
  }
}

export function buildPermissionKey(resource: string, action: string, module?: string): string {
  if (module) {
    return `${module}.${resource}.${action}`;
  }
  return `${resource}.${action}`;
}

// Middleware functions

export function requirePermission(permissionKey: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized - No user found",
        });
      }

      const result = await checkUserPermission(userId, permissionKey);

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
      req.permissionCheck = {
        permission: permissionKey,
        granted: true,
        reason: result.reason,
      };

      next();
    } catch (error: any) {
      console.error("Permission check error:", error);
      return res.status(500).json({
        success: false,
        message: "Error checking permissions",
        error: error.message,
      });
    }
  };
}

/**
 * Middleware to check if user has ANY of the specified permissions
 * Usage: router.get('/endpoint', requireAnyPermission(['users.view', 'users.edit']), handler)
 */
export function requireAnyPermission(permissionKeys: string[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized - No user found",
        });
      }

      const results = await batchCheckUserPermissions(userId, permissionKeys);

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

      // Find which permission was granted
      const grantedPermissions = Object.entries(results)
        .filter(([_, hasAccess]) => hasAccess)
        .map(([permission]) => permission);

      req.permissionCheck = {
        permissions: grantedPermissions,
        granted: true,
        reason: "Has one or more required permissions",
      };

      next();
    } catch (error: any) {
      console.error("Permission check error:", error);
      return res.status(500).json({
        success: false,
        message: "Error checking permissions",
        error: error.message,
      });
    }
  };
}

/**
 * Middleware to check if user has ALL of the specified permissions
 * Usage: router.get('/endpoint', requireAllPermissions(['users.view', 'users.edit']), handler)
 */
export function requireAllPermissions(permissionKeys: string[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized - No user found",
        });
      }

      const results = await batchCheckUserPermissions(userId, permissionKeys);

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

      req.permissionCheck = {
        permissions: permissionKeys,
        granted: true,
        reason: "Has all required permissions",
      };

      next();
    } catch (error: any) {
      console.error("Permission check error:", error);
      return res.status(500).json({
        success: false,
        message: "Error checking permissions",
        error: error.message,
      });
    }
  };
}

/**
 * Middleware to check if user's company has access to a module
 * Usage: router.get('/endpoint', requireModule('CRM'), handler)
 */
export function requireModule(moduleName: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          success: false,
          message: "Unauthorized - No user found",
        });
      }

      const user = await User.findByPk(userId);

      if (!user) {
        return res.status(401).json({
          success: false,
          message: "User not found",
        });
      }

      if (!user.companyId) {
        return res.status(403).json({
          success: false,
          message: "User is not associated with a company",
        });
      }

      // Find module by name
      const module = await Modules.findOne({
        where: {
          name: moduleName,
          isActive: true,
          isDeleted: false,
        },
      });

      if (!module) {
        return res.status(403).json({
          success: false,
          message: `Module '${moduleName}' not found or inactive`,
          details: {
            module: moduleName,
          },
        });
      }
      
      // Check if module is free for all before subscription check
      if (module.isFreeForAll) {
        req.moduleCheck = {
          module: moduleName,
          granted: true,
        };
        return next();
      }

      const hasModuleAccess = await checkCompanyModuleAccess(user.companyId, module.id);

      if (!hasModuleAccess) {
        return res.status(403).json({
          success: false,
          message: `Access denied: Module '${moduleName}' not enabled for your company`,
          details: {
            module: moduleName,
          },
        });
      }

      req.moduleCheck = {
        module: moduleName,
        granted: true,
      };

      next();
    } catch (error: any) {
      console.error("Module access check error:", error);
      return res.status(500).json({
        success: false,
        message: "Error checking module access",
        error: error.message,
      });
    }
  };
}

// Extend Express Request type to include permission check info
declare global {
  namespace Express {
    interface Request {
      permissionCheck?: {
        permission?: string;
        permissions?: string[];
        module?: string;
        granted: boolean;
        reason: string;
      };
      moduleCheck?: {
        module: string;
        granted: boolean;
      };
    }
  }
}

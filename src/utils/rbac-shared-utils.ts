/**
 * ============================================================
 * RBAC SHARED UTILITIES
 * ============================================================
 * Common RBAC checking logic shared between Company and ZarklyX
 * permission systems to eliminate code duplication.
 */

import { Op, Model, ModelStatic } from "sequelize";
import { 
  getActionsGranting, 
  parsePermissionKey, 
  buildPermissionKey 
} from "../middleware/permission.middleware";

/**
 * Active override filter for non-expired overrides
 * Can be used with both Company and ZarklyX override tables
 */
export function getActiveOverrideFilter() {
  return {
    [Op.or]: [
      { expiresAt: null },
      { expiresAt: { [Op.gt]: new Date() } }
    ],
  };
}

/**
 * Generic hierarchical permission checker
 * Works with any permission model (Company or ZarklyX)
 * 
 * Checks if user has a higher-level permission that would grant the requested one
 * (e.g., "manage" grants "create", "read", "update", "delete")
 * 
 * @param permissionKey - The permission being requested (e.g., "users.create.authentication")
 * @param PermissionModel - The Permission model to query (Permissions or ZarklyXPermission)
 * @param checkFunction - Async function that checks if permission exists (returns truthy if found)
 * @returns Result with found status, matching result, and which permission granted access
 */
export async function checkHierarchicalPermission<T extends Model>(
  permissionKey: string,
  PermissionModel: ModelStatic<T>,
  checkFunction: (higherPermissionId: string) => Promise<any>
): Promise<{ found: boolean; result?: any; grantedVia?: string }> {
  try {
    // Parse the requested permission key
    const parsed = parsePermissionKey(permissionKey);
    
    // Get actions that would grant this action (e.g., "manage" grants "create")
    const actionsToCheck = getActionsGranting(parsed.action);
    const higherActions = actionsToCheck.filter(a => a !== parsed.action);

    // Check each higher-level action
    for (const action of higherActions) {
      const higherPermissionKey = buildPermissionKey(
        parsed.resource,
        action,
        parsed.module
      );

      // Find the higher-level permission
      const higherPermission = await PermissionModel.findOne({
        where: {
          name: higherPermissionKey,
          isActive: true,
          isDeleted: false,
        } as any, // Type assertion needed due to generic model
      });

      if (higherPermission) {
        // Check if user has this higher-level permission
        const permissionId = (higherPermission as any).id;
        const checkResult = await checkFunction(permissionId);
        
        if (checkResult) {
          return {
            found: true,
            result: checkResult,
            grantedVia: higherPermissionKey,
          };
        }
      }
    }
  } catch (error) {
    console.error("Error checking hierarchical permissions:", error);
  }

  return { found: false };
}

/**
 * Generic role permission checker
 * Works with any RolePermission model (Company or ZarklyX)
 * 
 * @param RolePermissionModel - The role-permission join model
 * @param roleId - Role to check
 * @param permissionId - Permission to check
 * @returns True if role has permission
 */
export async function checkRolePermission<T extends Model>(
  RolePermissionModel: ModelStatic<T>,
  roleId: string,
  permissionId: string
): Promise<boolean> {
  const rolePermission = await RolePermissionModel.findOne({
    where: {
      roleId,
      permissionId,
    } as any,
  });

  return !!rolePermission;
}

/**
 * Generic permission finder by key
 * Works with any Permission model
 * 
 * @param PermissionModel - The Permission model
 * @param permissionKey - Permission key to find
 * @returns Permission if found, null otherwise
 */
export async function findPermissionByKey<T extends Model>(
  PermissionModel: ModelStatic<T>,
  permissionKey: string
): Promise<T | null> {
  return await PermissionModel.findOne({
    where: {
      name: permissionKey,
      isActive: true,
      isDeleted: false,
    } as any,
  });
}

/**
 * Generic role permission checker by key
 * Combines findPermissionByKey + checkRolePermission
 * 
 * @param PermissionModel - The Permission model
 * @param RolePermissionModel - The role-permission join model
 * @param roleId - Role to check
 * @param permissionKey - Permission key to check
 * @returns True if role has permission
 */
export async function checkRolePermissionByKey<P extends Model, RP extends Model>(
  PermissionModel: ModelStatic<P>,
  RolePermissionModel: ModelStatic<RP>,
  roleId: string,
  permissionKey: string
): Promise<boolean> {
  const permission = await findPermissionByKey(PermissionModel, permissionKey);
  
  if (!permission) {
    return false;
  }

  const permissionId = (permission as any).id;
  return await checkRolePermission(RolePermissionModel, roleId, permissionId);
}

/**
 * Check if a model instance exists by ID
 * Generic utility for common existence checks
 */
export async function checkEntityExists<T extends Model>(
  Model: ModelStatic<T>,
  id: string,
  additionalWhere?: any
): Promise<{ exists: boolean; entity?: T }> {
  const where: any = { id, ...(additionalWhere || {}) };
  const entity = await Model.findOne({ where });

  return {
    exists: !!entity,
    entity: entity || undefined,
  };
}

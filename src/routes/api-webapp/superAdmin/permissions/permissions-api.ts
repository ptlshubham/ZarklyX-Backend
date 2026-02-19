import { Router, Request, Response } from "express";
import {
  createPermission,
  createPermissions,
  getAllPermissions,
  getPermissionById,
  getPermissionsByModuleId,
  updatePermission,
  deletePermission,
  getActivePermissions,
  togglePermissionActive,
  hardDeletePermission
} from "../../../api-webapp/superAdmin/permissions/permissions-handler";
import dbInstance from "../../../../db/core/control-db";

const router = Router();

// Create permission | post /superAdmin/permissions/createPermission
router.post("/createPermission", async (req, res) => {
  const t = await dbInstance.transaction();
  try {
    const { name, description, displayName, moduleId, action, price, isActive, isDeleted, isSystemPermission, isSubscriptionExempt } = req.body;
    if (!name || !description || !displayName || !moduleId || !action) {
      await t.rollback();
      return res.status(400).json({ error: "All fields (name, description, displayName, moduleId, action) are required" });
    }
    const permission = await createPermission({ name, description, displayName, moduleId, action, price: price || 0, isActive, isDeleted, isSystemPermission, isSubscriptionExempt }, t);
    await t.commit();
    return res.status(201).json({ success: true, data: permission });
  } catch (error: any) {
    await t.rollback();
    if (error.name === 'SequelizeUniqueConstraintError') {
      const field = error.errors?.[0]?.path || 'field';
      return res.status(409).json({
        success: false,
        error: "Permission already exists",
        message: `A permission with this ${field} already exists`,
        field: field
      });
    }
    return res.status(500).json({ error: "Failed to create permission", details: error });
  }
});

// Bulk create permissions | post /superAdmin/permissions/createBulkPermissions
router.post("/createBulkPermissions", async (req: Request, res: Response): Promise<any> => {
  const t = await dbInstance.transaction();
  try {
    const { permissions } = req.body;

    if (!permissions || !Array.isArray(permissions) || permissions.length === 0) {
      await t.rollback();
      return res.status(400).json({
        success: false,
        error: "Permissions array is required and must not be empty"
      });
    }

    // Validate each permission has required fields
    for (let i = 0; i < permissions.length; i++) {
      const perm = permissions[i];
      if (!perm.name || !perm.description || !perm.displayName || !perm.moduleId || !perm.action) {
        await t.rollback();
        return res.status(400).json({
          success: false,
          error: `Permission at index ${i} is missing required fields (name, description, displayName, moduleId, action)`
        });
      }
    }

    const result = await createPermissions(permissions, t);

    if (result.failed > 0) {
      await t.rollback();
      return res.status(207).json({
        success: false,
        message: `Created ${result.success} permissions, ${result.failed} failed`,
        data: result
      });
    }

    await t.commit();
    return res.status(201).json({
      success: true,
      message: `Successfully created ${result.success} permissions`,
      data: result
    });
  } catch (error: any) {
    await t.rollback();
    return res.status(500).json({
      success: false,
      error: "Failed to create permissions",
      details: error.message || error
    });
  }
});

// Get all permissions | get /superAdmin/permissions/getAllPermissions
router.get("/getAllPermissions", async (req, res) => {
  try {
    const permissions = await getAllPermissions();
    return res.status(200).json({ success: true, data: permissions });
  } catch (error) {
    return res.status(500).json({ error: "Failed to fetch permissions", details: error });
  }
});

// Get all active permissions | get /superAdmin/permissions/getActivePermissions
router.get("/getActivePermissions", async (req: Request, res: Response): Promise<any> => {
  try {
    const permissions = await getActivePermissions();
    return res.status(200).json({ success: true, data: permissions });
  } catch (error) {
    return res.status(500).json({ error: "Failed to fetch active permissions", details: error });
  }
});

// Get permission by ID | get /superAdmin/permissions/getPermissionById/:id
router.get("/getPermissionById/:id", async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) return res.status(400).json({ error: "Permission ID is required" });
    const permission = await getPermissionById(id);
    if (!permission) return res.status(404).json({ error: "Permission not found" });
    return res.status(200).json({ success: true, data: permission });
  } catch (error) {
    return res.status(500).json({ error: "Failed to fetch permission", details: error });
  }
});

// Get permissions by module ID | get /superAdmin/permissions/getPermissionsByModuleId/:moduleId
router.get("/getPermissionsByModuleId/:moduleId", async (req: Request, res: Response): Promise<any> => {
  try {
    let { moduleId } = req.params;
    moduleId = Array.isArray(moduleId) ? moduleId[0] : moduleId;
    if (!moduleId) return res.status(400).json({ error: "Module ID is required" });
    const permissions = await getPermissionsByModuleId(moduleId);
    return res.status(200).json({ success: true, data: permissions });
  } catch (error) {
    return res.status(500).json({ error: "Failed to fetch permissions by module ID", details: error });
  }
});

// Update permission | patch /superAdmin/permissions/updatePermissionById/:id
router.patch("/updatePermissionById/:id", async (req, res) => {
  const t = await dbInstance.transaction();
  try {
    const { id } = req.params;
    if (!id) {
      await t.rollback();
      return res.status(400).json({ error: "Permission ID is required" });
    }
    const updateFields: any = {};
    const { name, description, displayName, moduleId, action, price, isActive, isDeleted, isSystemPermission, isSubscriptionExempt, isFreeForAll } = req.body;
    if (typeof name === 'string') updateFields.name = name;
    if (typeof description === 'string') updateFields.description = description;
    if (typeof displayName === 'string') updateFields.displayName = displayName;
    if (typeof moduleId === 'string') updateFields.moduleId = moduleId;
    if (typeof action === 'string') updateFields.action = action;
    if (typeof price === 'number' && price >= 0) updateFields.price = price;
    if (typeof isActive === 'boolean') updateFields.isActive = isActive;
    if (typeof isDeleted === 'boolean') updateFields.isDeleted = isDeleted;
    if (typeof isSystemPermission === 'boolean') updateFields.isSystemPermission = isSystemPermission;
    if (typeof isSubscriptionExempt === 'boolean') updateFields.isSubscriptionExempt = isSubscriptionExempt;
    if (typeof isFreeForAll === 'boolean') updateFields.isFreeForAll = isFreeForAll;
    if (Object.keys(updateFields).length === 0) {
      await t.rollback();
      return res.status(400).json({ error: "At least one field must be provided" });
    }
    const permission = await updatePermission(id, updateFields, t);
    if (!permission) {
      await t.rollback();
      return res.status(404).json({ error: "Permission not found" });
    }
    await t.commit();
    return res.status(200).json({ success: true, data: permission });
  } catch (error: any) {
    await t.rollback();
    if (error.name === 'SequelizeUniqueConstraintError') {
      const field = error.errors?.[0]?.path || 'field';
      return res.status(409).json({
        success: false,
        error: "Permission already exists",
        message: `A permission with this ${field} already exists`,
        field: field
      });
    }
    return res.status(500).json({ error: "Failed to update permission", details: error });
  }
});

// Delete permission (soft delete) | delete /superAdmin/permissions/deletePermissionById/:id
router.delete("/deletePermissionById/:id", async (req, res) => {
  const t = await dbInstance.transaction();
  try {
    const { id } = req.params;
    if (!id) {
      await t.rollback();
      return res.status(400).json({ error: "Permission ID is required" });
    }
    const deleted = await deletePermission(id, t);
    if (!deleted) {
      await t.rollback();
      return res.status(404).json({ error: "Permission not found" });
    }
    await t.commit();
    return res.status(200).json({ success: true, message: "Permission deleted" });
  } catch (error) {
    await t.rollback();
    return res.status(500).json({ error: "Failed to delete permission", details: error });
  }
});

// Toggle permission active status | patch /superAdmin/permissions/togglePermissionStatus/:id/toggle
router.patch("/togglePermissionStatus/:id/toggle", async (req: Request, res: Response): Promise<any> => {
  const t = await dbInstance.transaction();
  try {
    let { id } = req.params;
    if (Array.isArray(id)) id = id[0];
    if (!id) {
      await t.rollback();
      return res.status(400).json({ error: "Permission ID is required" });
    }
    const permission = await togglePermissionActive(id, t);
    if (!permission) {
      await t.rollback();
      return res.status(404).json({ error: "Permission not found" });
    }
    await t.commit();
    return res.status(200).json({ success: true, data: permission });
  } catch (error) {
    await t.rollback();
    return res.status(500).json({ error: "Failed to toggle permission status", details: error });
  }
});

// Hard delete permission (permanent deletion) | delete /superAdmin/permissions/hardDeletePermissionById/:id
router.delete("/hardDeletePermissionById/:id", async (req: Request, res: Response): Promise<any> => {
  const t = await dbInstance.transaction();
  try {
    let { id } = req.params;
    if (Array.isArray(id)) id = id[0];
    if (!id) {
      await t.rollback();
      return res.status(400).json({ error: "Permission ID is required" });
    }
    const deleted = await hardDeletePermission(id, t);
    if (!deleted) {
      await t.rollback();
      return res.status(404).json({ error: "Permission not found" });
    }
    await t.commit();
    return res.status(200).json({ success: true, message: "Permission permanently deleted" });
  } catch (error) {
    await t.rollback();
    return res.status(500).json({ error: "Failed to permanently delete permission", details: error });
  }
});

export default router;

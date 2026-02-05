import { Router } from "express";
import {
  createModule,
  getModules,
  getModuleById,
  getActiveModules,
  updateModule,
  deleteModule,
  toggleModuleActive
} from "../../../api-webapp/superAdmin/modules/module-handler";
import { Request, Response } from "express-serve-static-core";
import dbInstance from "../../../../db/core/control-db";

const router = Router();

// post /superAdmin/modules/createModules
router.post("/createModules", async (req: Request, res: Response): Promise<any> => {
  const t = await dbInstance.transaction();
  try {
    const { name, description, price, isFreeForAll } = req.body;
    if (!name || !description) {
      await t.rollback();
      return res.status(400).json({
        success: false,
        message: "Name and description are required",
      });
    }

    // Validate price if provided
    if (price !== undefined && (typeof price !== 'number' || price < 0)) {
      await t.rollback();
      return res.status(400).json({
        success: false,
        message: "Price must be a valid non-negative number",
      });
    }

    // Validate isFreeForAll if provided
    if (isFreeForAll !== undefined && typeof isFreeForAll !== 'boolean') {
      await t.rollback();
      return res.status(400).json({
        success: false,
        message: "isFreeForAll must be a boolean value",
      });
    }

    const module = await createModule(name, description, price || 0.00, isFreeForAll || false, t);
    await t.commit();
    return res.status(200).json({
      success: true,
      message: "Module created successfully",
      data: module,
    });
  } catch (error: any) {
    await t.rollback();
    if (error.name === 'SequelizeUniqueConstraintError') {
      const field = error.errors?.[0]?.path || 'field';
      return res.status(409).json({
        success: false,
        message: `A module with this ${field} already exists`,
        field: field
      });
    }
    return res.status(500).json({ success: false, message: error.message || "Failed to create module" });
  }
});

// Get /superAdmin/modules/getAllModules
router.get("/getAllModules", async (_req: Request, res: Response): Promise<any> => {
  try {
    const modules = await getModules();
    return res.status(200).json({ success: true, data: modules });
  } catch (error) {
    return res.status(500).json({ error: "Failed to fetch modules", details: error });
  }
});

// Get /superAdmin/modules/getActiveModules
router.get("/getActiveModules", async (_req: Request, res: Response): Promise<any> => {
  try {
    const modules = await getActiveModules();
    return res.status(200).json({ success: true, data: modules });
  } catch (error) {
    return res.status(500).json({ error: "Failed to fetch active modules", details: error });
  }
});

// Get /superAdmin/modules/getModuleById/:id
router.get("/getModuleById/:id", async (req: Request, res: Response): Promise<any> => {
  try {
    let { id } = req.params;
    if (Array.isArray(id)) id = id[0];
    if (!id) {
      return res.status(400).json({ error: "Module ID is required" });
    }
    const module = await getModuleById(id);
    if (!module) {
      return res.status(404).json({ error: "Module not found" });
    }
    return res.status(200).json({ success: true, data: module });
  } catch (error) {
    return res.status(500).json({ error: "Failed to fetch module", details: error });
  }
});

// Patch /superAdmin/modules/updateModuleById/:id
router.patch("/updateModuleById/:id", async (req: Request, res: Response): Promise<any> => {
  const t = await dbInstance.transaction();
  try {
    let { id } = req.params;
    if (Array.isArray(id)) id = id[0];
    if (!id) {
      await t.rollback();
      return res.status(400).json({ error: "Module ID is required" });
    }
    const updateFields: any = { id };
    const { name, description, isActive, price, isFreeForAll } = req.body;
    if (typeof name === 'string') updateFields.name = name;
    if (typeof description === 'string') updateFields.description = description;
    if (typeof isActive === 'boolean') updateFields.isActive = isActive;
    if (price !== undefined && (typeof price !== 'number' || price < 0)) {
      await t.rollback();
      return res.status(400).json({
        success: false,
        message: "Price must be a valid non-negative number",
      });
    }
    if (price !== undefined && typeof price === 'number') updateFields.price = price;
    if (isFreeForAll !== undefined && typeof isFreeForAll !== 'boolean') {
      await t.rollback();
      return res.status(400).json({
        success: false,
        message: "isFreeForAll must be a boolean value",
      });
    }
    if (isFreeForAll !== undefined && typeof isFreeForAll === 'boolean') updateFields.isFreeForAll = isFreeForAll;
    if (Object.keys(updateFields).length === 1) { // only id present
      await t.rollback();
      return res.status(400).json({ error: "At least one field (name, description, price, isFreeForAll, isActive) must be provided" });
    }
    const module = await updateModule(id, updateFields, t);
    if (!module) {
      await t.rollback();
      return res.status(404).json({ error: "Module not found" });
    }
    await t.commit();
    return res.status(200).json({ success: true, data: module });
  } catch (error: any) {
    await t.rollback();
    if (error.name === 'SequelizeUniqueConstraintError') {
      const field = error.errors?.[0]?.path || 'field';
      return res.status(409).json({
        success: false,
        message: `A module with this ${field} already exists`,
        field: field
      });
    }
    return res.status(500).json({ error: "Failed to update module", details: error.message || error });
  }
});

// Delete /superAdmin/modules/deleteModuleById/:id
router.delete("/deleteModuleById/:id", async (req: Request, res: Response): Promise<any> => {
  const t = await dbInstance.transaction();
  try {
    let { id } = req.params;
    if (Array.isArray(id)) id = id[0];
    if (!id) {
      await t.rollback();
      return res.status(400).json({ error: "Module ID is required" });
    }
    const deleted = await deleteModule(id, t);
    if (!deleted) {
      await t.rollback();
      return res.status(404).json({ error: "Module not found" });
    }
    await t.commit();
    return res.status(200).json({ success: true, message: "Module deleted" });
  } catch (error) {
    await t.rollback();
    return res.status(500).json({ error: "Failed to delete module", details: error });
  }
});

// Patch /superAdmin/modules/toggleModuleStatus/:id/toggle
router.patch("/toggleModuleStatus/:id/toggle", async (req: Request, res: Response): Promise<any> => {
  const t = await dbInstance.transaction();
  try {
    let { id } = req.params;
    if (Array.isArray(id)) id = id[0];
    if (!id) {
      await t.rollback();
      return res.status(400).json({ error: "Module ID is required" });
    }
    const module = await toggleModuleActive(id, t);
    if (!module) {
      await t.rollback();
      return res.status(404).json({ error: "Module not found" });
    }
    await t.commit();
    return res.status(200).json({ success: true, data: module });
  } catch (error) {
    await t.rollback();
    return res.status(500).json({ error: "Failed to toggle module status", details: error });
  }
});

export default router;
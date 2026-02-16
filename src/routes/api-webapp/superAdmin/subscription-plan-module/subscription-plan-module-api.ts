import { Router, Request, Response } from "express";
import {
  createSubscriptionPlanModule,
  getSubscriptionPlanModules,
  getActiveSubscriptionPlanModules,
  getSubscriptionPlanModuleById,
  getModulesBySubscriptionPlanId,
  getModulesNotInSubscriptionPlan,
  updateSubscriptionPlanModule,
  deleteSubscriptionPlanModule,
  hardDeleteSubscriptionPlanModule
} from "../../../api-webapp/superAdmin/subscription-plan-module/subscription-plan-module-handler";
import dbInstance from "../../../../db/core/control-db";

const router = Router();

// Create mapping
router.post("/createSubscriptionPlanModule", async (req, res) => {
  const t = await dbInstance.transaction();
  try {
    const { subscriptionPlanId, moduleId, source, isActive, isDeleted } = req.body;
    if (!subscriptionPlanId || !moduleId) {
      await t.rollback();
      return res.status(400).json({ error: "subscriptionPlanId and moduleId are required" });
    }
    const mapping = await createSubscriptionPlanModule({ subscriptionPlanId, moduleId, source, isActive, isDeleted }, t);
    await t.commit();
    return res.status(201).json({ success: true, data: mapping });
  } catch (error: any) {
    await t.rollback();
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({
        success: false,
        error: "Module already assigned to subscription plan",
        message: "This module is already assigned to this subscription plan"
      });
    }
    return res.status(500).json({ error: "Failed to create Subscription Modules", details: error });
  }
});

// Get all mappings
router.get("/getAllSubscriptionPlanModules", async (req, res) => {
  try {
    const mappings = await getSubscriptionPlanModules();
    return res.status(200).json({ success: true, data: mappings });
  } catch (error) {
    return res.status(500).json({ error: "Failed to fetch Subscription Modules", details: error });
  }
});

// Get active subscription modules
router.get("/getActiveSubscriptionPlanModules", async (req: Request, res: Response): Promise<any> => {
  try {
    const mappings = await getActiveSubscriptionPlanModules();
    return res.status(200).json({ success: true, data: mappings });
  } catch (error) {
    return res.status(500).json({ error: "Failed to fetch active Subscription Modules", details: error });
  }
});

// Get by ID
router.get("/getSubscriptionPlanModuleById/:id", async (req, res) => {
  try {
    let { id } = req.params;
    id = Array.isArray(id) ? id[0] : id;
    if (!id) return res.status(400).json({ error: "ID is required" });
    const mapping = await getSubscriptionPlanModuleById(id);
    if (!mapping) return res.status(404).json({ error: "Subscription Modules not found" });
    return res.status(200).json({ success: true, data: mapping });
  } catch (error) {
    return res.status(500).json({ error: "Failed to fetch Subscription Modules", details: error });
  }
});

// Get modules by subscription plan ID
router.get("/getModulesBySubscriptionPlanId/:subscriptionPlanId", async (req: Request, res: Response): Promise<any> => {
  try {
    let { subscriptionPlanId } = req.params;
    subscriptionPlanId = Array.isArray(subscriptionPlanId) ? subscriptionPlanId[0] : subscriptionPlanId;
    if (!subscriptionPlanId) return res.status(400).json({ error: "Subscription Plan ID is required" });
    const modules = await getModulesBySubscriptionPlanId(subscriptionPlanId);
    return res.status(200).json({ success: true, data: modules });
  } catch (error) {
    return res.status(500).json({ error: "Failed to fetch modules for subscription plan", details: error });
  }
});

// Get modules not included in a subscription plan
router.get("/getModulesNotInSubscriptionPlan/:subscriptionPlanId", async (req: Request, res: Response): Promise<any> => {
  try {
    let { subscriptionPlanId } = req.params;
    subscriptionPlanId = Array.isArray(subscriptionPlanId) ? subscriptionPlanId[0] : subscriptionPlanId;
    if (!subscriptionPlanId) return res.status(400).json({ error: "Subscription Plan ID is required" });
    const modules = await getModulesNotInSubscriptionPlan(subscriptionPlanId);
    return res.status(200).json({ success: true, data: modules });
  } catch (error) {
    return res.status(500).json({ error: "Failed to fetch modules not in subscription plan", details: error });
  }
});

// Update mapping
router.patch("/updateSubscriptionPlanModuleById/:id", async (req, res) => {
  const t = await dbInstance.transaction();
  try {
    let { id } = req.params;
    id = Array.isArray(id) ? id[0] : id;
    if (!id) {
      await t.rollback();
      return res.status(400).json({ error: "ID is required" });
    }
    const updateFields: any = {};
    const { subscriptionPlanId, moduleId, source, isActive, isDeleted } = req.body;
    if (typeof subscriptionPlanId === 'string') updateFields.subscriptionPlanId = subscriptionPlanId;
    if (typeof moduleId === 'string') updateFields.moduleId = moduleId;
    if (typeof source === 'string') updateFields.source = source;
    if (typeof isActive === 'boolean') updateFields.isActive = isActive;
    if (typeof isDeleted === 'boolean') updateFields.isDeleted = isDeleted;
    if (Object.keys(updateFields).length === 0) {
      await t.rollback();
      return res.status(400).json({ error: "At least one field must be provided" });
    }
    const updated = await updateSubscriptionPlanModule(id, updateFields, t);
    if (!updated) {
      await t.rollback();
      return res.status(404).json({ error: "Subscription Modules not found" });
    }
    await t.commit();
    return res.status(200).json({ success: true, data: updated, message: "Subscription Module updated successfully" });
  } catch (error: any) {
    await t.rollback();
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({
        success: false,
        error: "Module already assigned to subscription plan",
        message: "This module is already assigned to this subscription plan"
      });
    }
    return res.status(500).json({ error: "Failed to update Subscription Modules", details: error });
  }
});

// Delete mapping
router.delete("/deleteSubscriptionPlanModuleById/:id", async (req, res) => {
  const t = await dbInstance.transaction();
  try {
    let { id } = req.params;
    id = Array.isArray(id) ? id[0] : id;
    if (!id) {
      await t.rollback();
      return res.status(400).json({ error: "ID is required" });
    }
    const deleted = await deleteSubscriptionPlanModule(id, t);
    if (!deleted) {
      await t.rollback();
      return res.status(404).json({ error: "Subscription Modules not found" });
    }
    await t.commit();
    return res.status(200).json({ success: true, message: "Subscription Modules deleted" });
  } catch (error) {
    await t.rollback();
    return res.status(500).json({ error: "Failed to delete Subscription Modules", details: error });
  }
});

// Hard delete mapping (permanently removes from database)
router.delete("/hardDeleteSubscriptionPlanModuleById/:id", async (req, res) => {
  const t = await dbInstance.transaction();
  try {
    let { id } = req.params;
    id = Array.isArray(id) ? id[0] : id;
    if (!id) {
      await t.rollback();
      return res.status(400).json({ error: "ID is required" });
    }
    const deleted = await hardDeleteSubscriptionPlanModule(id, t);
    if (!deleted) {
      await t.rollback();
      return res.status(404).json({ error: "Subscription Module not found" });
    }
    await t.commit();
    return res.status(200).json({ success: true, message: "Subscription Module permanently deleted" });
  } catch (error) {
    await t.rollback();
    return res.status(500).json({ error: "Failed to hard delete Subscription Module", details: error });
  }
});

export default router;

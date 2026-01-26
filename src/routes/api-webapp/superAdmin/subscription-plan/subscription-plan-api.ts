import { Router } from "express";
import {
  createSubscriptionPlan,
  getActiveSubscriptionPlans,
  getAllSubscriptionPlans,
  getSubscriptionPlanById,
  updateSubscriptionPlan,
  deleteSubscriptionPlan,
  calculateSubscriptionPrice,
} from "../../../api-webapp/superAdmin/subscription-plan/subscription-plan-handler";
import dbInstance from "../../../../db/core/control-db";

const router = Router();

// Create subscription plan
router.post("/createSubscriptionPlan", async (req, res) => {
  const t = await dbInstance.transaction();
  try {
    const {
      name,
      description,
      price,
      durationValue,
      durationUnit,
      isActive,
      modules, // Array of module IDs
    } = req.body;

    if (
      !name?.trim() ||
      typeof price !== "number" || price <= 0 ||
      typeof durationValue !== "number" || durationValue <= 0 ||
      !["month", "year"].includes(durationUnit)
    ) {
      await t.rollback();
      return res.status(400).json({
        error:
          "Valid name, price (>0), durationValue (>0), and durationUnit (month/year) are required",
      });
    }

    // Validate modules array if provided
    if (modules !== undefined && (!Array.isArray(modules) || modules.some((id: any) => typeof id !== 'string'))) {
      await t.rollback();
      return res.status(400).json({
        error: "modules must be an array of valid module IDs",
      });
    }

    const plan = await createSubscriptionPlan(
      {
        name,
        description,
        price,
        durationValue,
        durationUnit,
        isActive,
        modules,
      },
      t
    );

    await t.commit();
    return res.status(201).json({ 
      success: true, 
      data: plan,
      message: modules && modules.length > 0 
        ? `Subscription plan created with ${modules.length} module(s)` 
        : "Subscription plan created successfully"
    });
  } catch (error: any) {
    await t.rollback();

    if (error.name === "SequelizeUniqueConstraintError") {
      return res.status(409).json({
        error: "Subscription plan with this name already exists",
      });
    }

    if (error.name === "SequelizeForeignKeyConstraintError") {
      return res.status(400).json({
        error: "One or more module IDs are invalid",
      });
    }

    return res.status(500).json({
      error: "Failed to create subscription plan",
      details: error.message,
    });
  }
});

// Get active subscription plan
router.get("/getSubscriptionPlans", async (_req, res) => {
  try {
    const plans = await getActiveSubscriptionPlans();
    return res.status(200).json({ success: true, data: plans });
  } catch {
    return res.status(500).json({
      error: "Failed to fetch subscription plans",
    });
  }
});

// Get all subscription plans
router.get("/getAllSubscriptionPlans", async (_req, res) => {
  try {
    const plans = await getAllSubscriptionPlans();
    return res.status(200).json({ success: true, data: plans });
  } catch {
    return res.status(500).json({
      error: "Failed to fetch subscription plans",
    });
  }
});

// Get subscription plan by id
router.get("/getSubscriptionPlanById/:id", async (req, res) => {
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const plan = await getSubscriptionPlanById(id);

    if (!plan) {
      return res.status(404).json({
        error: "Subscription plan not found",
      });
    }

    return res.status(200).json({ success: true, data: plan });
  } catch {
    return res.status(500).json({
      error: "Failed to fetch subscription plan",
    });
  }
});

// Update subscription plan
router.patch("/updateSubscriptionPlan/:id", async (req, res) => {
  const t = await dbInstance.transaction();
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const updateFields: Partial<any> = {};
    const {
      name,
      description,
      price,
      durationValue,
      durationUnit,
      isActive,
    } = req.body;

    if (typeof name === "string" && name.trim()) updateFields.name = name;
    if (typeof description === "string") updateFields.description = description;
    if (typeof price === "number" && price > 0) updateFields.price = price;
    if (typeof durationValue === "number" && durationValue > 0)
      updateFields.durationValue = durationValue;
    if (["month", "year"].includes(durationUnit))
      updateFields.durationUnit = durationUnit;
    if (typeof isActive === "boolean") updateFields.isActive = isActive;

    if (Object.keys(updateFields).length === 0) {
      await t.rollback();
      return res.status(400).json({
        error: "At least one valid field must be provided",
      });
    }

    const plan = await updateSubscriptionPlan(
      id,
      updateFields,
      t
    );

    if (!plan) {
      await t.rollback();
      return res.status(404).json({
        error: "Subscription plan not found",
      });
    }

    await t.commit();
    return res.status(200).json({ success: true, data: plan });
  } catch (error: any) {
    await t.rollback();

    if (error.name === "SequelizeUniqueConstraintError") {
      return res.status(409).json({
        error: "Subscription plan with this name already exists",
      });
    }

    return res.status(500).json({
      error: "Failed to update subscription plan",
    });
  }
});

// Soft delete subscription plan
router.delete("/deleteSubscriptionPlan/:id", async (req, res) => {
  const t = await dbInstance.transaction();
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const deleted = await deleteSubscriptionPlan(id, t);

    if (!deleted) {
      await t.rollback();
      return res.status(404).json({
        error: "Subscription plan not found",
      });
    }

    await t.commit();
    return res.status(200).json({
      success: true,
      message: "Subscription plan deleted successfully",
    });
  } catch {
    await t.rollback();
    return res.status(500).json({
      error: "Failed to delete subscription plan",
    });
  }
});

// Calculate subscription price with addon modules
router.post("/calculatePrice", async (req, res) => {
  try {
    const { subscriptionPlanId, addonModuleIds, discount } = req.body;

    if (!subscriptionPlanId) {
      return res.status(400).json({
        success: false,
        error: "subscriptionPlanId is required",
      });
    }

    // Validate addonModuleIds if provided
    if (addonModuleIds !== undefined && !Array.isArray(addonModuleIds)) {
      return res.status(400).json({
        success: false,
        error: "addonModuleIds must be an array",
      });
    }

    // Validate discount if provided
    if (discount !== undefined) {
      if (!discount.type || !['percentage', 'fixed'].includes(discount.type)) {
        return res.status(400).json({
          success: false,
          error: "discount.type must be 'percentage' or 'fixed'",
        });
      }
      if (typeof discount.value !== 'number') {
        return res.status(400).json({
          success: false,
          error: "discount.value must be a number",
        });
      }
    }

    const priceCalculation = await calculateSubscriptionPrice(
      subscriptionPlanId,
      addonModuleIds || [],
      discount
    );

    return res.status(200).json({
      success: true,
      data: priceCalculation,
      message: "Price calculated successfully",
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      error: error.message || "Failed to calculate price",
    });
  }
});

export default router;

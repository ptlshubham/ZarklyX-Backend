import { Router } from "express";
import {
  createSubscriptionPlan,
  getActiveSubscriptionPlans,
  getAllSubscriptionPlans,
  getSubscriptionPlanById,
  updateSubscriptionPlan,
  deleteSubscriptionPlan,
  calculateSubscriptionPrice,
  setSubscriptionPlanStatus,
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
      currency,
      timing,
      timing_unit,
      billing_cycle,
      trial_available,
      trial_days,
      price_per_user,
      min_users,
      max_users,
      proration_enabled,
      display_order,
      status,
      is_popular,
      modules, // Array of module IDs (full module access)
    } = req.body;

    if (
      !name?.trim() ||
      typeof price !== "number" || price <= 0 ||
      typeof timing !== "number" || timing <= 0 ||
      !["day", "month", "year"].includes(timing_unit) ||
      !["monthly", "yearly"].includes(billing_cycle)
    ) {
      await t.rollback();
      return res.status(400).json({
        error:
          "Valid name, price (>0), timing (>0), timing_unit (day/month/year), and billing_cycle (monthly/yearly) are required",
      });
    }

    // Validate trial_days if trial_available is true
    if (trial_available && (!trial_days || typeof trial_days !== "number" || trial_days <= 0)) {
      await t.rollback();
      return res.status(400).json({
        error: "trial_days must be a positive number when trial_available is true",
      });
    }

    // Validate min_users and max_users relationship
    if (min_users !== undefined && max_users !== undefined && min_users > max_users) {
      await t.rollback();
      return res.status(400).json({
        error: "min_users cannot be greater than max_users",
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
        currency,
        timing,
        timing_unit,
        billing_cycle,
        trial_available,
        trial_days,
        price_per_user,
        min_users,
        max_users,
        proration_enabled,
        display_order,
        status,
        is_popular,
        modules,
      },
      t
    );

    await t.commit();

    const modulesCount = modules?.length || 0;
    let message = "Subscription plan created successfully";
    if (modulesCount > 0) {
      message = `Subscription plan created with ${modulesCount} module(s) `;
    }

    return res.status(201).json({
      success: true,
      data: plan,
      message: message
    });
  } catch (error: any) {
    await t.rollback();

    if (error.name === "SequelizeUniqueConstraintError") {
      return res.status(409).json({
        error: "Subscription plan with this name already exists",
      });
    }

    if (error.name === "SequelizeForeignKeyConstraintError") {
      console.log(error);
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

// Get only active subscription plans
router.get("/getOnlyActivePlans", async (_req, res) => {
  try {
    const plans = await getActiveSubscriptionPlans();
    return res.status(200).json({
      success: true,
      data: plans,
      message: "Active subscription plans retrieved successfully"
    });
  } catch (error: any) {
    return res.status(500).json({
      error: "Failed to fetch active subscription plans",
      details: error?.message,
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
      currency,
      timing,
      timing_unit,
      billing_cycle,
      trial_available,
      trial_days,
      price_per_user,
      min_users,
      max_users,
      proration_enabled,
      display_order,
      status,
      is_popular,
      modules,
    } = req.body;

    if (typeof name === "string" && name.trim()) updateFields.name = name;
    if (typeof description === "string") updateFields.description = description;
    if (typeof price === "number" && price > 0) updateFields.price = price;
    if (typeof currency === "string" && currency.trim()) updateFields.currency = currency;
    if (typeof timing === "number" && timing > 0) updateFields.timing = timing;
    if (["day", "month", "year"].includes(timing_unit)) updateFields.timing_unit = timing_unit;
    if (["monthly", "yearly"].includes(billing_cycle)) updateFields.billing_cycle = billing_cycle;
    if (typeof trial_available === "boolean") updateFields.trial_available = trial_available;
    if (typeof trial_days === "number" && trial_days > 0) updateFields.trial_days = trial_days;
    if (typeof price_per_user === "boolean") updateFields.price_per_user = price_per_user;
    if (typeof min_users === "number" && min_users > 0) updateFields.min_users = min_users;
    if (typeof max_users === "number" && max_users > 0) updateFields.max_users = max_users;
    if (typeof proration_enabled === "boolean") updateFields.proration_enabled = proration_enabled;
    if (typeof display_order === "number") updateFields.display_order = display_order;
    if (["active", "inactive"].includes(status)) updateFields.status = status;
    if (typeof is_popular === "boolean") updateFields.is_popular = is_popular;

    // Validate modules array if provided
    if (modules !== undefined) {
      if (!Array.isArray(modules) || modules.some((id: any) => typeof id !== 'string')) {
        await t.rollback();
        return res.status(400).json({
          error: "modules must be an array of valid module IDs",
        });
      }
      updateFields.modules = modules;
    }

    // Validate min_users and max_users relationship
    const finalMinUsers = updateFields.min_users !== undefined ? updateFields.min_users : null;
    const finalMaxUsers = updateFields.max_users !== undefined ? updateFields.max_users : null;

    if (finalMinUsers !== null && finalMaxUsers !== null && finalMinUsers > finalMaxUsers) {
      await t.rollback();
      return res.status(400).json({
        error: "min_users cannot be greater than max_users",
      });
    }

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

// Change subscription plan status (activate/deactivate)
router.patch("/changeSubscriptionPlanStatus/:id", async (req, res) => {
  const t = await dbInstance.transaction();
  try {
    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const { status } = req.body;

    if (!["active", "inactive"].includes(status)) {
      await t.rollback();
      return res.status(400).json({
        error: "status must be 'active' or 'inactive'",
      });
    }

    const plan = await setSubscriptionPlanStatus(id, status, t);

    if (!plan) {
      await t.rollback();
      return res.status(404).json({
        error: "Subscription plan not found",
      });
    }

    await t.commit();
    return res.status(200).json({ success: true, data: plan, message: `Subscription plan ${status} successfully` });
  } catch (error: any) {
    await t.rollback();
    return res.status(500).json({
      error: "Failed to update subscription plan status",
      details: error?.message,
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

// Calculate subscription price with addon modules and per-seat pricing
router.post("/calculatePrice", async (req, res) => {
  try {
    const { subscriptionPlanId, numberOfUsers, addonModuleIds, discount } = req.body;

    if (!subscriptionPlanId) {
      return res.status(400).json({
        success: false,
        error: "subscriptionPlanId is required",
      });
    }

    if (!numberOfUsers || typeof numberOfUsers !== 'number' || numberOfUsers < 1) {
      return res.status(400).json({
        success: false,
        error: "numberOfUsers is required and must be at least 1",
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
      numberOfUsers,
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

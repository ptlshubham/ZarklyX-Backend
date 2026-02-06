import { Transaction } from "sequelize";
import { SubscriptionPlan } from "../../../api-webapp/superAdmin/subscription-plan/subscription-plan-model";
import { SubscriptionPlanModule } from "../../../api-webapp/superAdmin/subscription-plan-module/subscription-plan-module-model";
import { Modules } from "../../../api-webapp/superAdmin/modules/modules-model";
import { bulkCreateSubscriptionPlanPermissions } from "../subscription-plan-permission/subscription-plan-permission-handler";

export const calculateExpiryDate = (
  startDate: Date,
  timing: number,
  timing_unit: "day" | "month" | "year"
): Date => {
  const expiry = new Date(startDate);

  if (timing_unit === "day") {
    expiry.setDate(expiry.getDate() + timing);
  } else if (timing_unit === "month") {
    expiry.setMonth(expiry.getMonth() + timing);
  } else {
    expiry.setFullYear(expiry.getFullYear() + timing);
  }

  return expiry;
};

export const createSubscriptionPlan = async (
  fields: {
    name: string;
    description?: string | null;
    price: number;
    currency?: string;
    timing: number;
    timing_unit: "day" | "month" | "year";
    billing_cycle: "monthly" | "yearly";
    trial_available?: boolean;
    trial_days?: number | null;
    price_per_user?: boolean;
    min_users?: number | null;
    max_users?: number | null;
    proration_enabled?: boolean;
    display_order?: number;
    status?: "active" | "inactive";
    is_popular?: boolean;
    modules?: string[]; // Array of module IDs (full module access)
    permissions?: string[]; // Array of permission IDs (feature-level access)
  },
  t: Transaction
) => {
  // Create the subscription plan
  const plan = await SubscriptionPlan.create(
    {
      name: fields.name,
      description: fields.description ?? null,
      price: fields.price,
      currency: fields.currency ?? "INR",
      timing: fields.timing,
      timing_unit: fields.timing_unit,
      billing_cycle: fields.billing_cycle,
      trial_available: fields.trial_available ?? false,
      trial_days: fields.trial_days ?? null,
      price_per_user: fields.price_per_user ?? true,
      min_users: fields.min_users ?? null,
      max_users: fields.max_users ?? null,
      proration_enabled: fields.proration_enabled ?? true,
      display_order: fields.display_order ?? 0,
      status: fields.status ?? "active",
      is_popular: fields.is_popular ?? false,
      isDeleted: false,
    },
    { transaction: t }
  );

  // If modules are provided, create subscription-plan-module associations (full module access)
  if (fields.modules && Array.isArray(fields.modules) && fields.modules.length > 0) {
    const moduleAssociations = fields.modules.map((moduleId) => ({
      subscriptionPlanId: plan.id,
      moduleId: moduleId,
      source: "plan" as const,
      isActive: true,
      isDeleted: false,
    }));

    await SubscriptionPlanModule.bulkCreate(moduleAssociations, { transaction: t });
  }

  // If permissions are provided, create subscription-plan-permission associations (feature-level access)
  if (fields.permissions && Array.isArray(fields.permissions) && fields.permissions.length > 0) {
    await bulkCreateSubscriptionPlanPermissions(
      plan.id,
      fields.permissions,
      "plan",
      t
    );
  }

  return plan;
};

/**
 * Get all active subscription plans
 */
export const getActiveSubscriptionPlans = async () => {
  return await SubscriptionPlan.findAll({
    where: { status: "active", isDeleted: false },
    order: [
      ["display_order", "ASC"],
      ["createdAt", "DESC"]
    ],
  });
};

/**
 * Get all subscription plans
 * @param includeDeleted - Include soft-deleted plans (default: false)
 */
export const getAllSubscriptionPlans = async (includeDeleted: boolean = false) => {
  const whereClause = includeDeleted ? {} : { is_deleted: false };
  return await SubscriptionPlan.findAll({
    where: whereClause,
    order: [
      ["display_order", "ASC"],
      ["createdAt", "DESC"]
    ],
  });
};

/**
 * Get subscription plan by ID
 */
export const getSubscriptionPlanById = async (id: string) => {
  return await SubscriptionPlan.findOne({
    where: { id, status: "active", isDeleted: false },
  });
};

/**
 * Update subscription plan
 */
export const updateSubscriptionPlan = async (
  id: string,
  updateFields: Partial<SubscriptionPlan>,
  t: Transaction
) => {
  const plan = await SubscriptionPlan.findOne({
    where: { id, isDeleted: false },
    transaction: t,
    lock: t.LOCK.UPDATE,
  });

  if (!plan) return null;

  await plan.update(updateFields, { transaction: t });
  return plan;
};

/**
 * Set subscription plan status to active or inactive
 */
export const setSubscriptionPlanStatus = async (
  id: string,
  status: "active" | "inactive",
  t: Transaction
) => {
  const plan = await SubscriptionPlan.findOne({
    where: { id, isDeleted: false },
    transaction: t,
    lock: t.LOCK.UPDATE,
  });

  if (!plan) return null;

  await plan.update({ status }, { transaction: t });
  return plan;
};

/**
 * Soft delete subscription plan (set is_deleted to true)
 * Never hard delete subscription plans - preserve historical data for analytics
 */
export const deleteSubscriptionPlan = async (
  id: string,
  t: Transaction
) => {
  const plan = await SubscriptionPlan.findOne({
    where: { id, isDeleted: false },
    transaction: t,
    lock: t.LOCK.UPDATE,
  });

  if (!plan) return false;

  await plan.update(
    { isDeleted: true, status: "inactive" },
    { transaction: t }
  );

  return true;
};

/**
 * Calculate total price for subscription + addon modules with optional discount
 * @param subscriptionPlanId - Base subscription plan ID
 * @param numberOfUsers - Number of user seats (required for per-seat pricing)
 * @param addonModuleIds - Array of addon module IDs
 * @param discount - Optional discount object { type: 'percentage' | 'fixed', value: number }
 * @returns Total price breakdown
 */
export const calculateSubscriptionPrice = async (
  subscriptionPlanId: string,
  numberOfUsers: number,
  addonModuleIds: string[] = [],
  discount?: { type: 'percentage' | 'fixed'; value: number }
): Promise<{
  basePlanPrice: number;
  pricePerUser: boolean;
  numberOfUsers: number;
  calculatedPlanPrice: number;
  addonModulesPrice: number;
  subtotal: number;
  discountAmount: number;
  totalPrice: number;
  breakdown: {
    planName: string;
    basePlanPrice: number;
    pricePerUser: boolean;
    numberOfUsers: number;
    calculatedPlanPrice: number;
    minUsers: number | null;
    maxUsers: number | null;
    addons: Array<{ moduleName: string; price: number }>;
    discount?: { type: string; value: number; amount: number };
  };
}> => {
  // Get base subscription plan
  const plan = await SubscriptionPlan.findByPk(subscriptionPlanId);
  if (!plan) {
    throw new Error("Subscription plan not found");
  }

  // Validate numberOfUsers
  if (!numberOfUsers || numberOfUsers < 1) {
    throw new Error("numberOfUsers must be at least 1");
  }

  // Validate min_users constraint
  if (plan.min_users !== null && numberOfUsers < plan.min_users) {
    throw new Error(`This plan requires a minimum of ${plan.min_users} users`);
  }

  // Validate max_users constraint
  if (plan.max_users !== null && numberOfUsers > plan.max_users) {
    throw new Error(`This plan allows a maximum of ${plan.max_users} users`);
  }

  const basePlanPrice = Number(plan.price);

  // Calculate plan price based on pricing model
  let calculatedPlanPrice: number;
  if (plan.price_per_user) {
    // Per-seat pricing: base_price × number_of_users
    calculatedPlanPrice = basePlanPrice * numberOfUsers;
  } else {
    // Fixed pricing: base_price regardless of users
    calculatedPlanPrice = basePlanPrice;
  }
  let addonModulesPrice = 0;
  const addons: Array<{ moduleName: string; price: number }> = [];

  // Calculate addon modules price
  if (addonModuleIds.length > 0) {
    const modules = await Modules.findAll({
      where: {
        id: addonModuleIds,
        isActive: true,
        isDeleted: false,
      },
    });

    if (modules.length !== addonModuleIds.length) {
      throw new Error("One or more addon modules not found or inactive");
    }

    for (const module of modules) {
      const modulePrice = Number(module.price);
      addonModulesPrice += modulePrice;
      addons.push({
        moduleName: module.name,
        price: modulePrice,
      });
    }
  }

  const subtotal = calculatedPlanPrice + addonModulesPrice;
  let discountAmount = 0;
  let discountDetails = undefined;

  // Apply discount if provided
  if (discount) {
    if (discount.type === 'percentage') {
      // Validate percentage (0-100)
      if (discount.value < 0 || discount.value > 100) {
        throw new Error("Percentage discount must be between 0 and 100");
      }
      discountAmount = (subtotal * discount.value) / 100;
      discountDetails = {
        type: 'percentage',
        value: discount.value,
        amount: discountAmount,
      };
    } else if (discount.type === 'fixed') {
      // Validate fixed amount
      if (discount.value < 0) {
        throw new Error("Fixed discount must be non-negative");
      }
      if (discount.value > subtotal) {
        throw new Error("Discount amount cannot exceed subtotal");
      }
      discountAmount = discount.value;
      discountDetails = {
        type: 'fixed',
        value: discount.value,
        amount: discountAmount,
      };
    } else {
      throw new Error("Invalid discount type. Must be 'percentage' or 'fixed'");
    }
  }

  const totalPrice = subtotal - discountAmount;

  return {
    basePlanPrice,
    pricePerUser: plan.price_per_user,
    numberOfUsers,
    calculatedPlanPrice,
    addonModulesPrice,
    subtotal,
    discountAmount,
    totalPrice: Math.max(0, totalPrice), // Ensure non-negative
    breakdown: {
      planName: plan.name,
      basePlanPrice,
      pricePerUser: plan.price_per_user,
      numberOfUsers,
      calculatedPlanPrice,
      minUsers: plan.min_users,
      maxUsers: plan.max_users,
      addons,
      discount: discountDetails,
    },
  };
};

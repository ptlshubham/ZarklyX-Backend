import { Transaction } from "sequelize";
import { SubscriptionPlan } from "../../../api-webapp/superAdmin/subscription-plan/subscription-plan-model";
import { SubscriptionPlanModule } from "../../../api-webapp/superAdmin/subscription-plan-module/subscription-plan-module-model";
import { Modules } from "../../../api-webapp/superAdmin/modules/modules-model";

export const calculateExpiryDate = (
  startDate: Date,
  durationValue: number,
  durationUnit: "month" | "year"
): Date => {
  const expiry = new Date(startDate);

  if (durationUnit === "month") {
    expiry.setMonth(expiry.getMonth() + durationValue);
  } else {
    expiry.setFullYear(expiry.getFullYear() + durationValue);
  }

  return expiry;
};

export const createSubscriptionPlan = async (
  fields: {
    name: string;
    description?: string | null;
    price: number;
    durationValue: number;
    durationUnit: "month" | "year";
    isActive?: boolean;
    modules?: string[]; // Array of module IDs
  },
  t: Transaction
) => {
  // Create the subscription plan
  const plan = await SubscriptionPlan.create(
    {
      name: fields.name,
      description: fields.description ?? null,
      price: fields.price,
      durationValue: fields.durationValue,
      durationUnit: fields.durationUnit,
      isActive: fields.isActive ?? true,
      isDeleted: false,
    },
    { transaction: t }
  );

  // If modules are provided, create subscription-plan-module associations
  if (fields.modules && Array.isArray(fields.modules) && fields.modules.length > 0) {
    const moduleAssociations = fields.modules.map((moduleId) => ({
      subscriptionPlanId: plan.id,
      moduleId: moduleId,
      isActive: true,
      isDeleted: false,
    }));

    await SubscriptionPlanModule.bulkCreate(moduleAssociations, { transaction: t });
  }

  return plan;
};

/**
 * Get all active subscription plans
 */
export const getActiveSubscriptionPlans = async () => {
  return await SubscriptionPlan.findAll({
    where: { isActive: true, isDeleted: false },
    order: [["createdAt", "DESC"]],
  });
};

/**
 * Get all subscription plans
 */
export const getAllSubscriptionPlans = async () => {
  return await SubscriptionPlan.findAll({
    order: [["createdAt", "DESC"]],
  });
};

/**
 * Get subscription plan by ID
 */
export const getSubscriptionPlanById = async (id: string) => {
  return await SubscriptionPlan.findOne({
    where: { id, isActive: true, isDeleted: false },
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
    where: { id, isActive: true, isDeleted: false },
    transaction: t,
    lock: t.LOCK.UPDATE,
  });

  if (!plan) return null;

  await plan.update(updateFields, { transaction: t });
  return plan;
};

/**
 * Soft delete subscription plan
 */
export const deleteSubscriptionPlan = async (
  id: string,
  t: Transaction
) => {
  const plan = await SubscriptionPlan.findOne({
    where: { id, isActive: true, isDeleted: false },
    transaction: t,
    lock: t.LOCK.UPDATE,
  });

  if (!plan) return false;

  await plan.update(
    { isActive: false, isDeleted: true },
    { transaction: t }
  );

  return true;
};

/**
 * Calculate total price for subscription + addon modules with optional discount
 * @param subscriptionPlanId - Base subscription plan ID
 * @param addonModuleIds - Array of addon module IDs
 * @param discount - Optional discount object { type: 'percentage' | 'fixed', value: number }
 * @returns Total price breakdown
 */
export const calculateSubscriptionPrice = async (
  subscriptionPlanId: string,
  addonModuleIds: string[] = [],
  discount?: { type: 'percentage' | 'fixed'; value: number }
): Promise<{
  basePlanPrice: number;
  addonModulesPrice: number;
  subtotal: number;
  discountAmount: number;
  totalPrice: number;
  breakdown: {
    planName: string;
    planPrice: number;
    addons: Array<{ moduleName: string; price: number }>;
    discount?: { type: string; value: number; amount: number };
  };
}> => {
  // Get base subscription plan
  const plan = await SubscriptionPlan.findByPk(subscriptionPlanId);
  if (!plan) {
    throw new Error("Subscription plan not found");
  }

  const basePlanPrice = Number(plan.price);
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

  const subtotal = basePlanPrice + addonModulesPrice;
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
    addonModulesPrice,
    subtotal,
    discountAmount,
    totalPrice: Math.max(0, totalPrice), // Ensure non-negative
    breakdown: {
      planName: plan.name,
      planPrice: basePlanPrice,
      addons,
      discount: discountDetails,
    },
  };
};

import { Transaction } from "sequelize";
import { SubscriptionPlanModule } from "../../../api-webapp/superAdmin/subscription-plan-module/subscription-plan-module-model";

// Create a new subscription plan module mapping
export const createSubscriptionPlanModule = async (fields: {
  subscriptionPlanId: string;
  moduleId: string;
  isActive?: boolean;
  isDeleted?: boolean;
}, t: Transaction) => {
  return await SubscriptionPlanModule.create(
    {
      ...fields,
      isActive: fields.isActive ?? true,
      isDeleted: fields.isDeleted ?? false,
    },
    { transaction: t }
  );
};

// Get all subscription plan module mappings
export const getSubscriptionPlanModules = async () => {
  return await SubscriptionPlanModule.findAll();
};

// Get active subscription plan module mappings
export const getActiveSubscriptionPlanModules = async () => {
    return await SubscriptionPlanModule.findAll({
        where: { isActive: true, isDeleted: false},
    });
};

// Get by ID
export const getSubscriptionPlanModuleById = async (id: string) => {
  return await SubscriptionPlanModule.findOne({
    where: { id: id, isActive: true, isDeleted: false },
  });
};

// Get modules by subscription plan ID
export const getModulesBySubscriptionPlanId = async (subscriptionPlanId: string) => {
  return await SubscriptionPlanModule.findAll({
    where: { subscriptionPlanId, isActive: true, isDeleted: false },
  });
};

// Update mapping
export const updateSubscriptionPlanModule = async (id: string, updateFields: any, t: Transaction) => {
  const mapping = await SubscriptionPlanModule.findOne({
    where: { id, isActive: true, isDeleted: false },
    transaction: t,
    lock: t.LOCK.UPDATE,
  });

  if (!mapping) return null;

  await mapping.update(updateFields, { transaction: t });
  return mapping;
};

// Delete mapping
export const deleteSubscriptionPlanModule = async (id: string, t: Transaction) => {
  const mapping = await SubscriptionPlanModule.findOne({
    where: { id, isActive: true, isDeleted: false },
    transaction: t,
    lock: t.LOCK.UPDATE,
  });

  if (!mapping) return false;

  await mapping.update(
    { isActive: false, isDeleted: true },
    { transaction: t }
  );

  return true;
};

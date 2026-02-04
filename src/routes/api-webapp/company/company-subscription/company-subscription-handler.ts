import { Transaction } from "sequelize";
import { CompanySubscription } from "../../../api-webapp/company/company-subscription/company-subscription-model";
import { SubscriptionPlan } from "./../../../api-webapp/superAdmin/subscription-plan/subscription-plan-model";
import { SubscriptionPlanModule } from "../../../api-webapp/superAdmin/subscription-plan-module/subscription-plan-module-model";
import { SubscriptionPlanPermission } from "../../../api-webapp/superAdmin/subscription-plan-permission/subscription-plan-permission-model";
import { CompanyModule } from "../../../api-webapp/company/company-module/company-module-model";
import { CompanyPermission } from "../../../api-webapp/company/company-permission/company-permission-model";

// Create a new company subscription
export const createCompanySubscription = async (fields: {
  companyId: string;
  subscriptionPlanId: string;
  numberOfUsers: number;
  originalPrice: number; // Price before discount
  discountType?: 'percentage' | 'fixed' | null;
  discountValue?: number | null;
  discountAmount?: number;
  addonModuleCost?: number; // Total cost of addon modules
  addonPermissionCost?: number; // Total cost of addon permissions
  price: number; // Final price after discount (including addons)
  startDate?: Date;
  status?: string;
  isCurrent?: boolean;
  isActive?: boolean;
  isDeleted?: boolean;
  addonModules?: Array<{ moduleId: string; price: number }>;
  addonPermissions?: Array<{ permissionId: string; price: number }>;
}, t: Transaction) => {
  // Fetch the subscription plan to get duration
  const subscriptionPlan = await SubscriptionPlan.findByPk(fields.subscriptionPlanId);
  if (!subscriptionPlan) {
    throw new Error("Subscription plan not found");
  }

  // Calculate endDate based on startDate + duration
  const startDate = fields.startDate || new Date();
  const endDate = new Date(startDate);
  
  if (subscriptionPlan.timing_unit === "month") {
    endDate.setMonth(endDate.getMonth() + subscriptionPlan.timing);
  } else if (subscriptionPlan.timing_unit === "year") {
    endDate.setFullYear(endDate.getFullYear() + subscriptionPlan.timing);
  } else if (subscriptionPlan.timing_unit === "day") {
    endDate.setDate(endDate.getDate() + subscriptionPlan.timing);
  }

  // Create the subscription record
  const subscription = await CompanySubscription.create({
    companyId: fields.companyId,
    subscriptionPlanId: fields.subscriptionPlanId,
    numberOfUsers: fields.numberOfUsers,
    startDate,
    endDate,
    originalPrice: fields.originalPrice,
    discountType: fields.discountType || null,
    discountValue: fields.discountValue || null,
    discountAmount: fields.discountAmount || 0,
    addonModuleCost: fields.addonModuleCost || 0,
    addonPermissionCost: fields.addonPermissionCost || 0,
    price: fields.price,
    status: fields.status || 'active',
    isCurrent: fields.isCurrent ?? true,
    isActive: fields.isActive ?? true,
    isDeleted: fields.isDeleted ?? false,
  }, { transaction: t });

  // Copy plan modules to company_modules (source: "plan")
  const planModules = await SubscriptionPlanModule.findAll({
    where: {
      subscriptionPlanId: fields.subscriptionPlanId,
      isActive: true,
      isDeleted: false
    }
  });

  if (planModules.length > 0) {
    const companyModules = planModules.map(pm => ({
      companyId: fields.companyId,
      moduleId: pm.moduleId,
      subscriptionId: subscription.id, // Link to subscription
      source: "plan" as const,
      purchaseDate: startDate,
      price: 0, // Included in subscription
      isActive: true,
      isDeleted: false
    }));
    await CompanyModule.bulkCreate(companyModules, { transaction: t });
  }

  // Copy plan permissions to company_permissions (source: "plan")
  const planPermissions = await SubscriptionPlanPermission.findAll({
    where: {
      subscriptionPlanId: fields.subscriptionPlanId,
      isActive: true,
      isDeleted: false
    }
  });

  if (planPermissions.length > 0) {
    const companyPermissions = planPermissions.map(pp => ({
      companyId: fields.companyId,
      permissionId: pp.permissionId,
      subscriptionId: subscription.id, // Link to subscription
      source: "plan" as const,
      purchaseDate: startDate,
      price: 0, // Included in subscription
      isActive: true,
      isDeleted: false
    }));
    await CompanyPermission.bulkCreate(companyPermissions, { transaction: t });
  }

  // Add addon modules purchased during subscription (source: "addon")
  if (fields.addonModules && fields.addonModules.length > 0) {
    const addonModuleEntries = fields.addonModules.map(addon => ({
      companyId: fields.companyId,
      moduleId: addon.moduleId,
      subscriptionId: subscription.id, // Link to subscription (purchased WITH subscription)
      source: "addon" as const,
      purchaseDate: startDate,
      price: addon.price,
      isActive: true,
      isDeleted: false
    }));
    await CompanyModule.bulkCreate(addonModuleEntries, { transaction: t });
  }

  // Add addon permissions purchased during subscription (source: "addon")
  if (fields.addonPermissions && fields.addonPermissions.length > 0) {
    const addonPermissionEntries = fields.addonPermissions.map(addon => ({
      companyId: fields.companyId,
      permissionId: addon.permissionId,
      subscriptionId: subscription.id, // Link to subscription (purchased WITH subscription)
      source: "addon" as const,
      purchaseDate: startDate,
      price: addon.price,
      isActive: true,
      isDeleted: false
    }));
    await CompanyPermission.bulkCreate(addonPermissionEntries, { transaction: t });
  }

  return subscription;
};

// Get all company subscriptions
export const getCompanySubscriptions = async () => {
  return await CompanySubscription.findAll();
};

// Get active company subscriptions
export const getActiveCompanySubscriptions = async () => {
  return await CompanySubscription.findAll({
    where: { isActive: true, isDeleted: false },
  });
};

// Get company subscription by ID
export const getCompanySubscriptionById = async (id: string) => {
  return await CompanySubscription.findOne({
    where: { id, isActive: true, isDeleted: false },
  });
};

// Get company subscriptions by company ID
export const getCompanySubscriptionsByCompanyId = async (companyId: string) => {
  return await CompanySubscription.findAll({
    where: { companyId, isActive: true, isDeleted: false },
  });
};

// Get current subscription for a company
export const getCurrentCompanySubscription = async (companyId: string) => {
  return await CompanySubscription.findOne({
    where: { companyId, isCurrent: true, isActive: true, isDeleted: false },
  });
};

// Update current subscription for a company (used for renewals)
export const updateCurrentCompanySubscription = async (companyId: string, updateFields: any, t: Transaction) => {
  const [affectedRows] = await CompanySubscription.update(
    updateFields,
    { where: { companyId, isCurrent: true }, transaction: t }
  );
  return affectedRows > 0;
};

// Delete company subscription (soft delete)
export const deleteCompanySubscription = async (id: string, t: Transaction) => {
  await CompanySubscription.update(
    { isActive: false, isDeleted: true },
    { where: { id }, transaction: t }
  );
  return true;
};

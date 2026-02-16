import { Router, Request, Response } from "express";
import {
  createCompanySubscription,
  getCompanySubscriptions,
  getActiveCompanySubscriptions,
  getCompanySubscriptionById,
  getCompanySubscriptionsByCompanyId,
  getCurrentCompanySubscription,
  updateCurrentCompanySubscription,
  deleteCompanySubscription
} from "../../../api-webapp/company/company-subscription/company-subscription-handler";
import dbInstance from "../../../../db/core/control-db";
import { SubscriptionPlan } from "../../../api-webapp/superAdmin/subscription-plan/subscription-plan-model";
import { Modules } from "../../../api-webapp/superAdmin/modules/modules-model";
import { Permissions } from "../../../api-webapp/superAdmin/permissions/permissions-model";
import { CompanyModule } from "../../../api-webapp/company/company-module/company-module-model";
import { CompanyPermission } from "../../../api-webapp/company/company-permission/company-permission-model";
import { SubscriptionPlanModule } from "../../../api-webapp/superAdmin/subscription-plan-module/subscription-plan-module-model";
import { SubscriptionPlanPermission } from "../../../api-webapp/superAdmin/subscription-plan-permission/subscription-plan-permission-model";

const router = Router();

// Create company subscription
router.post("/createCompanySubscription", async (req: Request, res: Response): Promise<any> => {
  const t = await dbInstance.transaction();
  try {
    const { 
      companyId, 
      subscriptionPlanId, 
      numberOfUsers, 
      startDate, 
      status,
      isCurrent,
      discountType,
      discountValue,
      addonModules,     // Array: [{ moduleId, price }]
      addonPermissions  // Array: [{ permissionId, price }]
    } = req.body;
    
    if (!companyId || !subscriptionPlanId || !numberOfUsers) {
      await t.rollback();
      return res.status(400).json({ error: "companyId, subscriptionPlanId, and numberOfUsers are required" });
    }
    
    if (typeof numberOfUsers !== 'number' || numberOfUsers < 1) {
      await t.rollback();
      return res.status(400).json({ error: "numberOfUsers must be a positive number" });
    }

    // Validate discount if provided
    if (discountType && !['percentage', 'fixed'].includes(discountType)) {
      await t.rollback();
      return res.status(400).json({ error: "discountType must be 'percentage' or 'fixed'" });
    }

    // Validate addon modules if provided
    if (addonModules !== undefined) {
      if (!Array.isArray(addonModules)) {
        await t.rollback();
        return res.status(400).json({ error: "addonModules must be an array" });
      }
      for (const moduleId of addonModules) {
        if (typeof moduleId !== 'string') {
          await t.rollback();
          return res.status(400).json({ error: "Each addon module must be a valid module ID" });
        }
      }
    }

    // Validate addon permissions if provided
    if (addonPermissions !== undefined) {
      if (!Array.isArray(addonPermissions)) {
        await t.rollback();
        return res.status(400).json({ error: "addonPermissions must be an array" });
      }
      for (const permissionId of addonPermissions) {
        if (typeof permissionId !== 'string') {
          await t.rollback();
          return res.status(400).json({ error: "Each addon permission must be a valid permission ID" });
        }
      }
    }

    // Fetch subscription plan to calculate price
    const subscriptionPlan = await SubscriptionPlan.findByPk(subscriptionPlanId);
    if (!subscriptionPlan) {
      await t.rollback();
      return res.status(404).json({ error: "Subscription plan not found" });
    }

    // Calculate original price
    let originalPrice = subscriptionPlan.price;
    if (subscriptionPlan.price_per_user) {
      originalPrice = subscriptionPlan.price * numberOfUsers;
    }

    // Calculate discount
    let discountAmount = 0;
    if (discountType && discountValue) {
      if (discountType === 'percentage') {
        discountAmount = (originalPrice * discountValue) / 100;
      } else if (discountType === 'fixed') {
        discountAmount = discountValue;
      }
    }

    // Fetch addon modules with prices from database
    let addonModuleCost = 0;
    let addonModulesWithPrices: Array<{moduleId: string, price: number}> = [];
    if (addonModules && addonModules.length > 0) {
      const modules = await Modules.findAll({
        where: { id: addonModules, isActive: true, isDeleted: false },
        transaction: t,
      });
      
      if (modules.length !== addonModules.length) {
        await t.rollback();
        return res.status(404).json({ error: "One or more addon modules not found or inactive" });
      }
      
      addonModulesWithPrices = modules.map(m => ({ moduleId: m.id, price: Number(m.price) }));
      addonModuleCost = addonModulesWithPrices.reduce((sum, addon) => sum + addon.price, 0);
    }

    // Fetch addon permissions with prices from database
    let addonPermissionCost = 0;
    let addonPermissionsWithPrices: Array<{permissionId: string, price: number}> = [];
    if (addonPermissions && addonPermissions.length > 0) {
      const permissions = await Permissions.findAll({
        where: { id: addonPermissions, isActive: true, isDeleted: false },
        transaction: t,
      });
      
      if (permissions.length !== addonPermissions.length) {
        await t.rollback();
        return res.status(404).json({ error: "One or more addon permissions not found or inactive" });
      }
      
      addonPermissionsWithPrices = permissions.map(p => ({ permissionId: p.id, price: Number(p.price) }));
      addonPermissionCost = addonPermissionsWithPrices.reduce((sum, addon) => sum + addon.price, 0);
    }

    // Calculate final price (subscription - discount + addons)
    const finalPrice = (originalPrice - discountAmount) + addonModuleCost + addonPermissionCost;

    const subscription = await createCompanySubscription(
      { 
        companyId, 
        subscriptionPlanId, 
        numberOfUsers, 
        originalPrice,
        discountType: discountType || null,
        discountValue: discountValue || null,
        discountAmount,
        addonModuleCost,
        addonPermissionCost,
        price: finalPrice,
        startDate, 
        status: status || 'active',
        isCurrent: isCurrent ?? true,
        addonModules: addonModulesWithPrices,
        addonPermissions: addonPermissionsWithPrices
      },
      t
    );
    await t.commit();
    
    let message = "Company subscription created successfully";
    const addonCount = (addonModules?.length || 0) + (addonPermissions?.length || 0);
    if (addonCount > 0) {
      message += ` with ${addonCount} addon(s)`;
    }
    
    return res.status(201).json({ 
      success: true, 
      data: subscription,
      message,
      summary: {
        subscriptionPrice: originalPrice - discountAmount,
        addonModuleCost,
        addonPermissionCost,
        totalPrice: finalPrice
      }
    });
  } catch (error: any) {
    await t.rollback();
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({ 
        success: false,
        error: "Subscription already exists",
        message: "This company already has an active subscription" 
      });
    }
    return res.status(500).json({ error: "Failed to create company subscription", details: error.message || error });
  }
});

// Get all company subscriptions
router.get("/getAllCompanySubscriptions", async (req: Request, res: Response): Promise<any> => {
  try {
    const subscriptions = await getCompanySubscriptions();
    return res.status(200).json({ success: true, data: subscriptions });
  } catch (error) {
    return res.status(500).json({ error: "Failed to fetch company subscriptions", details: error });
  }
});

// Get active company subscriptions
router.get("/getActiveCompanySubscriptions", async (req: Request, res: Response): Promise<any> => {
  try {
    const subscriptions = await getActiveCompanySubscriptions();
    return res.status(200).json({ success: true, data: subscriptions });
  } catch (error) {
    return res.status(500).json({ error: "Failed to fetch active company subscriptions", details: error });
  }
});

// Get company subscription by ID
router.get("/getCompanySubscriptionById/:id", async (req: Request, res: Response): Promise<any> => {
  try {
    let { id } = req.params;
    if (Array.isArray(id)) id = id[0];
    if (!id) return res.status(400).json({ error: "ID is required" });
    const subscription = await getCompanySubscriptionById(id);
    if (!subscription) return res.status(404).json({ error: "Company subscription not found" });
    return res.status(200).json({ success: true, data: subscription });
  } catch (error) {
    return res.status(500).json({ error: "Failed to fetch company subscription", details: error });
  }
});

// Get company subscriptions by company ID
router.get("/getCompanySubscriptionsByCompanyId/:companyId", async (req: Request, res: Response): Promise<any> => {
  try {
    let { companyId } = req.params;
    if (Array.isArray(companyId)) companyId = companyId[0];
    if (!companyId) return res.status(400).json({ error: "Company ID is required" });
    const subscriptions = await getCompanySubscriptionsByCompanyId(companyId);
    return res.status(200).json({ success: true, data: subscriptions });
  } catch (error) {
    return res.status(500).json({ error: "Failed to fetch company subscriptions", details: error });
  }
});

// Get current subscription for a company
router.get("/getCurrentCompanySubscription/:companyId", async (req: Request, res: Response): Promise<any> => {
  try {
    let { companyId } = req.params;
    if (Array.isArray(companyId)) companyId = companyId[0];
    if (!companyId) return res.status(400).json({ error: "Company ID is required" });
    const subscription = await getCurrentCompanySubscription(companyId);
    if (!subscription) return res.status(404).json({ error: "No current subscription found" });
    return res.status(200).json({ success: true, data: subscription });
  } catch (error) {
    return res.status(500).json({ error: "Failed to fetch current subscription", details: error });
  }
});

// Renew or change company subscription (creates new subscription record)
router.post("/renewCompanySubscription/:companyId", async (req: Request, res: Response): Promise<any> => {
  const t = await dbInstance.transaction();
  try {
    let { companyId } = req.params;
    if (Array.isArray(companyId)) companyId = companyId[0];
    const { 
      subscriptionPlanId, 
      numberOfUsers, 
      startDate,
      discountType,
      discountValue
    } = req.body;
    
    if (!companyId || !subscriptionPlanId) {
      await t.rollback();
      return res.status(400).json({ error: "companyId and subscriptionPlanId are required" });
    }

    if (!numberOfUsers || typeof numberOfUsers !== 'number' || numberOfUsers < 1) {
      await t.rollback();
      return res.status(400).json({ error: "numberOfUsers is required and must be a positive number" });
    }

    // Validate discount if provided
    if (discountType && !['percentage', 'fixed'].includes(discountType)) {
      await t.rollback();
      return res.status(400).json({ error: "discountType must be 'percentage' or 'fixed'" });
    }

    // Set current subscription to not current
    await updateCurrentCompanySubscription(
      companyId, 
      { isCurrent: false }, 
      t
    );

    // Get subscription plan to fetch price
    const subscriptionPlan = await SubscriptionPlan.findByPk(subscriptionPlanId);
    if (!subscriptionPlan) {
      await t.rollback();
      return res.status(404).json({ error: "Subscription plan not found" });
    }

    // Calculate original price
    let originalPrice = subscriptionPlan.price;
    if (subscriptionPlan.price_per_user) {
      originalPrice = subscriptionPlan.price * numberOfUsers;
    }

    // Calculate discount
    let discountAmount = 0;
    if (discountType && discountValue) {
      if (discountType === 'percentage') {
        discountAmount = (originalPrice * discountValue) / 100;
      } else if (discountType === 'fixed') {
        discountAmount = discountValue;
      }
    }

    // Calculate final price
    const finalPrice = originalPrice - discountAmount;

    // Create new subscription with calculated endDate
    const newSubscription = await createCompanySubscription(
      { 
        companyId, 
        subscriptionPlanId, 
        numberOfUsers,
        originalPrice,
        discountType: discountType || null,
        discountValue: discountValue || null,
        discountAmount,
        price: finalPrice,
        startDate,
        status: 'active',
        isCurrent: true 
      },
      t
    );

    await t.commit();
    return res.status(201).json({ 
      success: true, 
      message: "Subscription renewed successfully",
      data: newSubscription 
    });
  } catch (error: any) {
    await t.rollback();
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({ 
        success: false,
        error: "Subscription already exists",
        message: "This company already has an active subscription" 
      });
    }
    return res.status(500).json({ 
      error: "Failed to renew subscription", 
      details: error.message || error 
    });
  }
});

// Delete company subscription (soft delete)
router.delete("/deleteCompanySubscriptionById/:id", async (req: Request, res: Response): Promise<any> => {
  const t = await dbInstance.transaction();
  try {
    let { id } = req.params;
    if (Array.isArray(id)) id = id[0];
    if (!id) {
      await t.rollback();
      return res.status(400).json({ error: "ID is required" });
    }
    const deleted = await deleteCompanySubscription(id, t);
    if (!deleted) {
      await t.rollback();
      return res.status(404).json({ error: "Company subscription not found" });
    }
    await t.commit();
    return res.status(200).json({ success: true, message: "Company subscription deleted" });
  } catch (error) {
    await t.rollback();
    return res.status(500).json({ error: "Failed to delete company subscription", details: error });
  }
});

// Get complete subscription details with modules and permissions breakdown
router.get("/getSubscriptionDetails/:companyId", async (req: Request, res: Response): Promise<any> => {
  try {
    let { companyId } = req.params;
    if (Array.isArray(companyId)) companyId = companyId[0];
    
    if (!companyId) {
      return res.status(400).json({ error: "Company ID is required" });
    }

    // Get current subscription
    const subscription = await getCurrentCompanySubscription(companyId);
    if (!subscription) {
      return res.status(404).json({ error: "No active subscription found for this company" });
    }

    // Get subscription plan details
    const plan = await SubscriptionPlan.findByPk(subscription.subscriptionPlanId);

    // Get all company modules (both plan and addon)
    const companyModules = await CompanyModule.findAll({
      where: {
        companyId,
        isActive: true,
        isDeleted: false,
      },
      include: [{
        model: Modules,
        as: "module",
        attributes: ['id', 'name', 'description', 'price'],
      }],
    });

    // Separate plan modules from addon modules
    const planModules = companyModules.filter(cm => cm.source === 'plan');
    const addonModules = companyModules.filter(cm => cm.source === 'addon');

    // Get all company permissions (both plan and addon)
    const companyPermissions = await CompanyPermission.findAll({
      where: {
        companyId,
        isActive: true,
        isDeleted: false,
      },
      include: [{
        model: Permissions,
        as: "permission",
        attributes: ['id', 'name', 'description', 'moduleId', 'action', 'price'],
      }],
    });

    // Separate plan permissions from addon permissions
    const planPermissions = companyPermissions.filter(cp => cp.source === 'plan');
    const addonPermissions = companyPermissions.filter(cp => cp.source === 'addon');

    // Calculate costs
    const addonModuleCost = addonModules.reduce((sum, cm) => sum + Number(cm.price || 0), 0);
    const addonPermissionCost = addonPermissions.reduce((sum, cp) => sum + Number(cp.price || 0), 0);

    return res.status(200).json({
      success: true,
      data: {
        subscription: {
          id: subscription.id,
          subscriptionPlanId: subscription.subscriptionPlanId,
          planName: plan?.name,
          planDescription: plan?.description,
          numberOfUsers: subscription.numberOfUsers,
          startDate: subscription.startDate,
          endDate: subscription.endDate,
          status: subscription.status,
          pricing: {
            originalPrice: subscription.originalPrice,
            discountType: subscription.discountType,
            discountValue: subscription.discountValue,
            discountAmount: subscription.discountAmount,
            addonModuleCost: subscription.addonModuleCost,
            addonPermissionCost: subscription.addonPermissionCost,
            finalPrice: subscription.price,
          },
        },
        includedInPlan: {
          modules: planModules.map(cm => ({
            id: cm.id,
            moduleId: cm.moduleId,
            moduleName: (cm as any).module?.name,
            moduleDescription: (cm as any).module?.description,
            source: cm.source,
            purchaseDate: cm.purchaseDate,
          })),
          permissions: planPermissions.map(cp => ({
            id: cp.id,
            permissionId: cp.permissionId,
            permissionName: (cp as any).permission?.name,
            permissionDescription: (cp as any).permission?.description,
            moduleId: (cp as any).permission?.moduleId,
            action: (cp as any).permission?.action,
            source: cp.source,
            purchaseDate: cp.purchaseDate,
          })),
        },
        purchasedAddons: {
          modules: addonModules.map(cm => ({
            id: cm.id,
            moduleId: cm.moduleId,
            moduleName: (cm as any).module?.name,
            moduleDescription: (cm as any).module?.description,
            price: cm.price,
            source: cm.source,
            purchaseDate: cm.purchaseDate,
          })),
          permissions: addonPermissions.map(cp => ({
            id: cp.id,
            permissionId: cp.permissionId,
            permissionName: (cp as any).permission?.name,
            permissionDescription: (cp as any).permission?.description,
            moduleId: (cp as any).permission?.moduleId,
            action: (cp as any).permission?.action,
            price: cp.price,
            source: cp.source,
            purchaseDate: cp.purchaseDate,
          })),
        },
        summary: {
          totalModules: companyModules.length,
          planModules: planModules.length,
          addonModules: addonModules.length,
          totalPermissions: companyPermissions.length,
          planPermissions: planPermissions.length,
          addonPermissions: addonPermissions.length,
          totalAddonCost: addonModuleCost + addonPermissionCost,
        },
      },
      message: "Subscription details fetched successfully",
    });
  } catch (error: any) {
    return res.status(500).json({
      error: "Failed to fetch subscription details",
      details: error.message,
    });
  }
});

export default router;

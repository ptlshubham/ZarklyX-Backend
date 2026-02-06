import { Transaction } from "sequelize";
import { SubscriptionPlanPermission } from "./subscription-plan-permission-model";
import { Permissions } from "../permissions/permissions-model";
import { SubscriptionPlan } from "../subscription-plan/subscription-plan-model";

/**
 * Create a single subscription plan permission
 */
export async function createSubscriptionPlanPermission(
  subscriptionPlanId: string,
  permissionId: string,
  source: "plan" | "addon" = "plan",
  isActive: boolean = true,
  transaction?: Transaction
): Promise<SubscriptionPlanPermission | null> {
  try {
    // Check if plan exists (use transaction to see uncommitted data)
    const plan = await SubscriptionPlan.findByPk(subscriptionPlanId, { transaction });
    if (!plan) return null;

    // Check if permission exists
    const permission = await Permissions.findByPk(permissionId, { transaction });
    if (!permission) return null;

    // Check for existing record
    const existing = await SubscriptionPlanPermission.findOne({
      where: { subscriptionPlanId, permissionId },
      transaction,
    });

    if (existing) return null; // Already exists

    const planPermission = await SubscriptionPlanPermission.create(
      {
        subscriptionPlanId,
        permissionId,
        source,
        isActive,
        isDeleted: false,
      },
      { transaction }
    );

    return planPermission;
  } catch (error) {
    console.error("Error creating subscription plan permission:", error);
    throw error;
  }
}

/**
 * Bulk create subscription plan permissions
 */
export async function bulkCreateSubscriptionPlanPermissions(
  subscriptionPlanId: string,
  permissionIds: string[],
  source: "plan" | "addon" = "plan",
  transaction?: Transaction
): Promise<SubscriptionPlanPermission[]> {
  try {
    // Check if plan exists (use transaction to see uncommitted data)
    const plan = await SubscriptionPlan.findByPk(subscriptionPlanId, { transaction });
    if (!plan) throw new Error("Subscription plan not found");

    // Check if permissions exist
    const permissions = await Permissions.findAll({
      where: { id: permissionIds, isActive: true, isDeleted: false },
      transaction,
    });

    if (permissions.length !== permissionIds.length) {
      throw new Error("One or more permissions not found or inactive");
    }

    // Filter out existing records
    const existingRecords = await SubscriptionPlanPermission.findAll({
      where: { subscriptionPlanId, permissionId: permissionIds },
      attributes: ["permissionId"],
      transaction,
    });

    const existingPermissionIds = new Set(
      existingRecords.map((r) => r.permissionId)
    );

    const newPermissionIds = permissionIds.filter(
      (id) => !existingPermissionIds.has(id)
    );

    if (newPermissionIds.length === 0) {
      return []; // All already exist
    }

    const planPermissions = await SubscriptionPlanPermission.bulkCreate(
      newPermissionIds.map((permissionId) => ({
        subscriptionPlanId,
        permissionId,
        source,
        isActive: true,
        isDeleted: false,
      })),
      { transaction }
    );

    return planPermissions;
  } catch (error) {
    console.error("Error bulk creating subscription plan permissions:", error);
    throw error;
  }
}

/**
 * Get all permissions for a subscription plan
 */
export async function getPermissionsBySubscriptionPlanId(
  subscriptionPlanId: string,
  includeInactive: boolean = false
): Promise<SubscriptionPlanPermission[]> {
  try {
    const where: any = { subscriptionPlanId, isDeleted: false };

    if (!includeInactive) {
      where.isActive = true;
    }

    const planPermissions = await SubscriptionPlanPermission.findAll({
      where,
      include: [
        {
          model: Permissions,
          as: "permission",
          attributes: ["id", "name", "description", "action", "moduleId"],
        },
      ],
      order: [["createdAt", "DESC"]],
    });

    return planPermissions;
  } catch (error) {
    console.error("Error fetching subscription plan permissions:", error);
    throw error;
  }
}

/**
 * Update subscription plan permission
 */
export async function updateSubscriptionPlanPermission(
  id: string,
  updates: { source?: "plan" | "addon"; isActive?: boolean },
  transaction?: Transaction
): Promise<SubscriptionPlanPermission | null> {
  try {
    const planPermission = await SubscriptionPlanPermission.findOne({
      where: { id, isDeleted: false },
      lock: transaction ? Transaction.LOCK.UPDATE : undefined,
      transaction,
    });

    if (!planPermission) return null;

    await planPermission.update(updates, { transaction });

    return planPermission;
  } catch (error) {
    console.error("Error updating subscription plan permission:", error);
    throw error;
  }
}

/**
 * Delete (soft delete) subscription plan permission
 */
export async function deleteSubscriptionPlanPermission(
  id: string,
  transaction?: Transaction
): Promise<boolean> {
  try {
    const planPermission = await SubscriptionPlanPermission.findOne({
      where: { id, isDeleted: false },
      lock: transaction ? Transaction.LOCK.UPDATE : undefined,
      transaction,
    });

    if (!planPermission) return false;

    await planPermission.update(
      { isDeleted: true, isActive: false },
      { transaction }
    );

    return true;
  } catch (error) {
    console.error("Error deleting subscription plan permission:", error);
    throw error;
  }
}

/**
 * Delete all permissions for a subscription plan
 */
export async function deleteAllPlanPermissions(
  subscriptionPlanId: string,
  transaction?: Transaction
): Promise<number> {
  try {
    const [affectedCount] = await SubscriptionPlanPermission.update(
      { isDeleted: true, isActive: false },
      {
        where: { subscriptionPlanId, isDeleted: false },
        transaction,
      }
    );

    return affectedCount;
  } catch (error) {
    console.error("Error deleting all plan permissions:", error);
    throw error;
  }
}

/**
 * Hard delete a subscription plan permission (permanent removal from database)
 */
export async function hardDeleteSubscriptionPlanPermission(
  id: string,
  transaction?: Transaction
): Promise<boolean> {
  try {
    const planPermission = await SubscriptionPlanPermission.findOne({
      where: { id },
      lock: transaction ? Transaction.LOCK.UPDATE : undefined,
      transaction,
    });

    if (!planPermission) return false;

    await planPermission.destroy({ transaction });

    return true;
  } catch (error) {
    console.error("Error hard deleting subscription plan permission:", error);
    throw error;
  }
}

/**
 * Hard delete all permissions for a subscription plan (permanent removal from database)
 */
export async function hardDeleteAllPlanPermissions(
  subscriptionPlanId: string,
  transaction?: Transaction
): Promise<number> {
  try {
    const affectedCount = await SubscriptionPlanPermission.destroy({
      where: { subscriptionPlanId },
      transaction,
    });

    return affectedCount;
  } catch (error) {
    console.error("Error hard deleting all plan permissions:", error);
    throw error;
  }
}

/**
 * Toggle subscription plan permission status (activate/deactivate)
 */
export async function toggleSubscriptionPlanPermissionStatus(
  id: string,
  isActive: boolean,
  transaction?: Transaction
): Promise<SubscriptionPlanPermission | null> {
  try {
    const planPermission = await SubscriptionPlanPermission.findOne({
      where: { id, isDeleted: false },
      lock: transaction ? Transaction.LOCK.UPDATE : undefined,
      transaction,
    });

    if (!planPermission) return null;

    await planPermission.update({ isActive }, { transaction });

    return planPermission;
  } catch (error) {
    console.error("Error toggling subscription plan permission status:", error);
    throw error;
  }
}

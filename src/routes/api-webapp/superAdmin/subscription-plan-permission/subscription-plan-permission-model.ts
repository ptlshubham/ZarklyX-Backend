import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  Sequelize,
} from "sequelize";
import { SubscriptionPlan } from "../subscription-plan/subscription-plan-model";
import { Permissions } from "../permissions/permissions-model";

export class SubscriptionPlanPermission extends Model<
  InferAttributes<SubscriptionPlanPermission>,
  InferCreationAttributes<SubscriptionPlanPermission>
> {
  declare id: CreationOptional<string>;
  declare subscriptionPlanId: string;
  declare permissionId: string;
  declare source: "plan" | "addon";
  declare isActive: boolean;
  declare isDeleted: boolean;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  static initModel(sequelize: Sequelize): typeof SubscriptionPlanPermission {
    SubscriptionPlanPermission.init(
      {
        id: {
          type: DataTypes.UUID,
          defaultValue: DataTypes.UUIDV4,
          primaryKey: true,
          allowNull: false,
        },
        subscriptionPlanId: {
          type: DataTypes.UUID,
          allowNull: false,
          references: {
            model: SubscriptionPlan,
            key: "id",
          },
        },
        permissionId: {
          type: DataTypes.UUID,
          allowNull: false,
          references: {
            model: Permissions,
            key: "id",
          },
        },
        source: {
          type: DataTypes.ENUM("plan", "addon"),
          allowNull: false,
          defaultValue: "plan",
          comment: "Tracks if permission is from base plan or addon",
        },
        isActive: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: true,
        },
        isDeleted: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: false,
        },
        createdAt: {
          type: DataTypes.DATE,
          allowNull: false,
          defaultValue: DataTypes.NOW,
        },
        updatedAt: {
          type: DataTypes.DATE,
          allowNull: false,
          defaultValue: DataTypes.NOW,
        },
      },
      {
        sequelize,
        modelName: "subscriptionPlanPermission",
        tableName: "subscription_plan_permissions",
        timestamps: true,
        indexes: [
          {
            unique: true,
            fields: ["subscriptionPlanId", "permissionId"],
            name: "subscription_plan_permission_unique",
          },
        ],
      }
    );

    return SubscriptionPlanPermission;
  }
}

export const initSubscriptionPlanPermissionModel = (sequelize: Sequelize) =>
  SubscriptionPlanPermission.initModel(sequelize);

import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  Sequelize,
} from "sequelize";
import { SubscriptionPlan } from "../../../api-webapp/superAdmin/subscription-plan/subscription-plan-model";
import { Modules } from "../../../api-webapp/superAdmin/modules/modules-model";

export class SubscriptionPlanModule extends Model<
  InferAttributes<SubscriptionPlanModule>,
  InferCreationAttributes<SubscriptionPlanModule>
> {
  declare id: CreationOptional<string>;
  declare subscriptionPlanId: string;
  declare moduleId: string;
  declare isActive: boolean;
  declare isDeleted: boolean;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  static initModel(sequelize: Sequelize): typeof SubscriptionPlanModule {
    SubscriptionPlanModule.init(
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
        moduleId: {
          type: DataTypes.UUID,
          allowNull: false,
          references: {
            model: Modules,
            key: "id",
          },
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
        modelName: "SubscriptionPlanModule",
        tableName: "subscription_plan_module",
        timestamps: true,
      }
    );

    return SubscriptionPlanModule;
  }
}

export const initSubscriptionPlanModuleModel = (sequelize: Sequelize) =>
  SubscriptionPlanModule.initModel(sequelize);

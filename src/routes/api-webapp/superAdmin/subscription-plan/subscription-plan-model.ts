import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  Sequelize,
} from "sequelize";

export class SubscriptionPlan extends Model<
  InferAttributes<SubscriptionPlan>,
  InferCreationAttributes<SubscriptionPlan>
> {
  declare id: CreationOptional<string>;
  declare name: string;
  declare description: string | null;
  declare price: number;
  declare currency: string;
  declare timing: number;
  declare timing_unit: "day" | "month" | "year";
  declare billing_cycle: "monthly" | "yearly";
  declare trial_available: boolean;
  declare trial_days: number | null;
  declare price_per_user: boolean;
  declare min_users: number | null;
  declare max_users: number | null;
  declare proration_enabled: boolean;
  declare display_order: number;
  declare status: "active" | "inactive";
  declare is_popular: boolean;
  declare isDeleted: boolean;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  static initModel(sequelize: Sequelize): typeof SubscriptionPlan {
    SubscriptionPlan.init(
      {
        id: {
          type: DataTypes.UUID,
          defaultValue: DataTypes.UUIDV4,
          primaryKey: true,
          allowNull: false,
        },
        name: {
          type: DataTypes.STRING(255),
          allowNull: false,
          unique: true,
        },
        description: {
          type: DataTypes.TEXT,
          allowNull: true,
        },
        price: {
          type: DataTypes.DECIMAL(10, 2),
          allowNull: false,
        },
        currency: {
          type: DataTypes.STRING(10),
          allowNull: false,
          defaultValue: "INR",
        },
        timing: {
          type: DataTypes.INTEGER,
          allowNull: false,
        },
        timing_unit: {
          type: DataTypes.ENUM("day", "month", "year"),
          allowNull: false,
        },
        billing_cycle: {
          type: DataTypes.ENUM("monthly", "yearly"),
          allowNull: false,
        },
        trial_available: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: false,
        },
        trial_days: {
          type: DataTypes.INTEGER,
          allowNull: true,
        },
        price_per_user: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: true,
          comment: "Enable per-user/seat pricing (e.g., $199/user/month)",
        },
        min_users: {
          type: DataTypes.INTEGER,
          allowNull: true,
          comment: "Minimum number of user seats required (enterprise plans)",
        },
        max_users: {
          type: DataTypes.INTEGER,
          allowNull: true,
          comment: "Maximum number of user seats allowed",
        },
        proration_enabled: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: true,
          comment: "Enable proration for upgrades/downgrades",
        },
        display_order: {
          type: DataTypes.INTEGER,
          allowNull: false,
          defaultValue: 0,
          comment: "Display order on pricing page (lower = shown first)",
        },
        status: {
          type: DataTypes.ENUM("active", "inactive"),
          allowNull: false,
          defaultValue: "active",
        },
        is_popular: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: false,
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
        modelName: "SubscriptionPlan",
        tableName: "subscription_plan",
        timestamps: true,
      }
    );

    return SubscriptionPlan;
  }
}

export const initSubscriptionPlanModel = (sequelize: Sequelize) =>
  SubscriptionPlan.initModel(sequelize);

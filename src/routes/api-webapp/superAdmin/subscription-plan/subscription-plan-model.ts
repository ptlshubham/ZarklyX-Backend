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
  declare durationValue: number; // e.g. 1, 6, 12
  declare durationUnit: "month" | "year";
  declare isActive: boolean;
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
        durationValue: {
            type: DataTypes.INTEGER,
            allowNull: false,
        },
        durationUnit: {
            type: DataTypes.ENUM("month", "year"),
            allowNull: false,
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

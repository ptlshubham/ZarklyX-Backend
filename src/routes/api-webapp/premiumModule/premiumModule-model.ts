import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  Sequelize,
} from "sequelize";

export class PremiumModule extends Model<
  InferAttributes<PremiumModule>,
  InferCreationAttributes<PremiumModule>
> {
  declare id: CreationOptional<number>;
  declare icon: string | null;
  declare name: string;
  declare isActive: boolean;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  static initModel(sequelize: Sequelize): typeof PremiumModule {
    PremiumModule.init(
      {
        id: {
          type: DataTypes.INTEGER,
          primaryKey: true,
          autoIncrement: true,
          allowNull: false,
          unique: true,
        },
        icon: {
          type: DataTypes.STRING(255),
          allowNull: true,
        },
        name: {
          type: DataTypes.STRING(255),
          allowNull: false,
          unique: {
            name: "premium_module_name",
            msg: "Premium module name must be unique",
          },
        },
        isActive: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: true,
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
        modelName: "premiumModule",
        tableName: "premiumModule",
        timestamps: true,
      }
    );

    return PremiumModule;
  }
}

export const initPremiumModuleModel = (sequelize: Sequelize) =>
  PremiumModule.initModel(sequelize);

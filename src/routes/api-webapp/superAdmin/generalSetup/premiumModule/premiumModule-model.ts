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
  declare id: CreationOptional<string>;
  declare icon: string | null;
  declare name: string;
  declare isActive: boolean;
  declare isDeleted: boolean;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  static initModel(sequelize: Sequelize): typeof PremiumModule {
    PremiumModule.init(
      {
        id: {
          type: DataTypes.UUID,
          primaryKey: true,
          allowNull: false,
          unique: true,
          defaultValue: DataTypes.UUIDV4,
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

import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  Sequelize,
} from "sequelize";
import { BusinessType } from "./businessType-model";

export class BusinessSubcategory extends Model<
  InferAttributes<BusinessSubcategory>,
  InferCreationAttributes<BusinessSubcategory>
> {
  declare id: CreationOptional<number>;
  declare businessTypeId: number;
  declare name: string;
  declare description: string | null;
  declare isActive: boolean;
  declare isDeleted: boolean;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  static initModel(sequelize: Sequelize): typeof BusinessSubcategory {
    BusinessSubcategory.init(
      {
        id: {
          type: DataTypes.INTEGER,
          primaryKey: true,
          autoIncrement: true,
          allowNull: false,
        },
        businessTypeId: {
          type: DataTypes.INTEGER,
          allowNull: false,
          references: {
            model: BusinessType,
            key: "id",
          },
        },
        name: {
          type: DataTypes.STRING(255),
          allowNull: false,
        },
        description: {
          type: DataTypes.TEXT,
          allowNull: true,
          defaultValue: null,
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
        modelName: "businessSubcategory",
        tableName: "business_subcategories",
        timestamps: true,
      }
    );

    return BusinessSubcategory;
  }
}

export const initBusinessSubcategoryModel = (sequelize: Sequelize) =>
  BusinessSubcategory.initModel(sequelize);
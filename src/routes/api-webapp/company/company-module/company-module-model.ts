import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  Sequelize,
} from "sequelize";
import { Company } from "../../../api-webapp/company/company-model";
import { Modules } from "../../../api-webapp/superAdmin/modules/modules-model";


export class CompanyModule extends Model<
  InferAttributes<CompanyModule>,
  InferCreationAttributes<CompanyModule>
> {
  declare id: CreationOptional<string>;
  declare companyId: string;
  declare moduleId: string;
  declare subscriptionId: string | null; // Links addon to subscription it was purchased with (NULL for separately purchased)
  declare source: "plan" | "addon";
  declare purchaseDate: Date;
  declare price: number;
  declare isActive: boolean;
  declare isDeleted: boolean;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  static initModel(sequelize: Sequelize): typeof CompanyModule {
    CompanyModule.init(
      {
        id: {
          type: DataTypes.UUID,
          defaultValue: DataTypes.UUIDV4,
          primaryKey: true,
          allowNull: false,
        },
        companyId: {
          type: DataTypes.UUID,
          allowNull: false,
          references: {
            model: Company,
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
        subscriptionId: {
          type: DataTypes.UUID,
          allowNull: true,
          defaultValue: null,
          comment: "Links addon to subscription it was purchased with. NULL for separately purchased addons",
        },
        source: {
          type: DataTypes.ENUM("plan", "addon"),
          allowNull: false,
          defaultValue: "addon",
          comment: "Tracks if module is from plan or company addon",
        },
        purchaseDate: {
          type: DataTypes.DATEONLY,
          allowNull: false,
          defaultValue: DataTypes.NOW,
        },
        price: {
          type: DataTypes.DECIMAL(10,2),
          allowNull: true,
          defaultValue: 0.0
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
        modelName: "CompanyModule",
        tableName: "company_module",
        timestamps: true,
        indexes: [
          {
            unique: true,
            fields: ["companyId", "moduleId"],
            name: "company_module_unique",
          },
        ],
      }
    );

    return CompanyModule;
  }
}

export const initCompanyModuleModel = (sequelize: Sequelize) =>
  CompanyModule.initModel(sequelize);

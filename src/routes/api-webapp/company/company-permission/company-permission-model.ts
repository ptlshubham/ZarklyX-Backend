import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  Sequelize,
} from "sequelize";
import { Company } from "../../../api-webapp/company/company-model";
import { Permissions } from "../../../api-webapp/superAdmin/permissions/permissions-model";

export class CompanyPermission extends Model<
  InferAttributes<CompanyPermission>,
  InferCreationAttributes<CompanyPermission>
> {
  declare id: CreationOptional<string>;
  declare companyId: string;
  declare permissionId: string;
  declare subscriptionId: string | null; // Links addon to subscription it was purchased with (NULL for separately purchased)
  declare source: "plan" | "addon";
  declare purchaseDate: Date;
  declare price: number;
  declare isActive: boolean;
  declare isDeleted: boolean;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  static initModel(sequelize: Sequelize): typeof CompanyPermission {
    CompanyPermission.init(
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
        permissionId: {
          type: DataTypes.UUID,
          allowNull: false,
          references: {
            model: Permissions,
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
          comment: "Tracks if permission is from plan or company addon",
        },
        purchaseDate: {
          type: DataTypes.DATEONLY,
          allowNull: false,
          defaultValue: DataTypes.NOW,
        },
        price: {
          type: DataTypes.DECIMAL(10, 2),
          allowNull: false,
          defaultValue: 0,
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
        modelName: "CompanyPermission",
        tableName: "company_permissions",
        timestamps: true,
        indexes: [
          {
            unique: true,
            fields: ["companyId", "permissionId"],
            name: "company_permission_unique",
          },
        ],
      }
    );

    return CompanyPermission;
  }
}

export const initCompanyPermissionModel = (sequelize: Sequelize) =>
  CompanyPermission.initModel(sequelize);

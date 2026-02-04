import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  Sequelize,
} from "sequelize";
import { Modules } from "../../../../api-webapp/superAdmin/modules/modules-model";

export class ZarklyXPermission extends Model<
  InferAttributes<ZarklyXPermission>,
  InferCreationAttributes<ZarklyXPermission>
> {
  declare id: CreationOptional<string>;
  declare name: string;
  declare description: string;
  declare moduleId: string;
  declare action: string;
  declare isSystemPermission: boolean;
  declare isActive: boolean;
  declare isDeleted: boolean;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  static initModel(sequelize: Sequelize): typeof ZarklyXPermission {
    ZarklyXPermission.init(
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
          comment: "Format: platform.{module}.{action} (e.g., platform.companies.view)",
        },
        description: {
          type: DataTypes.TEXT,
          allowNull: false,
        },
        moduleId: {
          type: DataTypes.UUID,
          allowNull: false,
          references: {
            model: Modules,
            key: "id",
          },
        },
        action: {
          type: DataTypes.STRING(50),
          allowNull: false,
          comment: "view, create, edit, delete, manage, etc.",
        },
        isSystemPermission: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: false,
          comment: "Critical permissions that cannot be overridden (e.g., platform.users.delete)",
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
        modelName: "ZarklyXPermission",
        tableName: "zarklyX_permissions",
        timestamps: true,
        indexes: [
          {
            unique: true,
            fields: ["name"],
            name: "idx_zarklyX_permissions_name",
          },
          {
            fields: ["moduleId", "action"],
            name: "idx_zarklyX_permissions_module_action",
          },
        ],
      }
    );
    return ZarklyXPermission;
  };
}

export const initZarklyXPermissionModel = (sequelize: Sequelize) =>
  ZarklyXPermission.initModel(sequelize);

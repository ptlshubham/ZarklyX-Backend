import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  Sequelize,
} from "sequelize";
import { ZarklyXRole } from "../../../../api-webapp/superAdmin/rbac/roles/roles-model";
import { ZarklyXPermission } from "../../../../api-webapp/superAdmin/rbac/permissions/permissions-model";

export class ZarklyXRolePermission extends Model<
  InferAttributes<ZarklyXRolePermission>,
  InferCreationAttributes<ZarklyXRolePermission>
> {
  declare id: CreationOptional<string>;
  declare roleId: string;
  declare permissionId: string;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  static initModel(sequelize: Sequelize): typeof ZarklyXRolePermission {
    ZarklyXRolePermission.init(
      {
        id: {
          type: DataTypes.UUID,
          defaultValue: DataTypes.UUIDV4,
          primaryKey: true,
          allowNull: false,
        },
        roleId: {
          type: DataTypes.UUID,
          allowNull: false,
          references: {
            model: ZarklyXRole,
            key: "id",
          },
          onDelete: "CASCADE",
        },
        permissionId: {
          type: DataTypes.UUID,
          allowNull: false,
          references: {
            model: ZarklyXPermission,
            key: "id",
          },
          onDelete: "CASCADE",
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
        modelName: "ZarklyXRolePermission",
        tableName: "zarklyX_role_permissions",
        timestamps: true,
        indexes: [
          {
            unique: true,
            fields: ["roleId", "permissionId"],
            name: "idx_zarklyX_role_permissions_unique",
          },
          {
            fields: ["roleId"],
            name: "idx_zarklyX_role_permissions_role",
          },
          {
            fields: ["permissionId"],
            name: "idx_zarklyX_role_permissions_permission",
          },
        ],
      }
    );

    return ZarklyXRolePermission;
  }
}

export const initZarklyXRolePermissionModel = (sequelize: Sequelize) =>
  ZarklyXRolePermission.initModel(sequelize);

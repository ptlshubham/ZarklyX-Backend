import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  Sequelize,
} from "sequelize";
import { Role } from "../../api-webapp/roles/role-model";
import { Permissions } from "../../api-webapp/superAdmin/permissions/permissions-model";

export class RolePermissions extends Model<
  InferAttributes<RolePermissions>,
  InferCreationAttributes<RolePermissions>
> {
  declare id: CreationOptional<string>;
  declare roleId: string;
  declare permissionId: string;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  static initModel(sequelize: Sequelize): typeof RolePermissions {
    RolePermissions.init(
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
            model: Role,
            key: "id",
          },
          onDelete: "CASCADE",
        },
        permissionId: {
          type: DataTypes.UUID,
          allowNull: false,
          references: {
            model: Permissions,
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
        modelName: "RolePermissions",
        tableName: "role_permissions",
        timestamps: true,
        indexes: [
          {
            unique: true,
            fields: ["roleId", "permissionId"],
            name: "unique_role_permission",
          },
          {
            fields: ["roleId"],
            name: "idx_role_permissions_roleId",
          },
          {
            fields: ["permissionId"],
            name: "idx_role_permissions_permissionId",
          },
        ],
      }
    );

    return RolePermissions;
  }
}

export const initRolePermissionsModel = (sequelize: Sequelize) =>
  RolePermissions.initModel(sequelize);

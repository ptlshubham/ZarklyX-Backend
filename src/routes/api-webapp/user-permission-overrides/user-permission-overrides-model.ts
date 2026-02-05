import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  Sequelize,
} from "sequelize";
import { User } from "../../api-webapp/authentication/user/user-model";
import { Permissions } from "../../api-webapp/superAdmin/permissions/permissions-model";

export class UserPermissionOverrides extends Model<
  InferAttributes<UserPermissionOverrides>,
  InferCreationAttributes<UserPermissionOverrides>
> {
  declare id: CreationOptional<string>;
  declare userId: string;
  declare permissionId: string;
  declare effect: "allow" | "deny";
  declare reason: string | null;
  declare expiresAt: Date | null;
  declare grantedByUserId: string | null;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  static initModel(sequelize: Sequelize): typeof UserPermissionOverrides {
    UserPermissionOverrides.init(
      {
        id: {
          type: DataTypes.UUID,
          defaultValue: DataTypes.UUIDV4,
          primaryKey: true,
          allowNull: false,
        },
        userId: {
          type: DataTypes.UUID,
          allowNull: false,
          references: {
            model: User,
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
        effect: {
          type: DataTypes.ENUM("allow", "deny"),
          allowNull: false,
        },
        reason: {
          type: DataTypes.TEXT,
          allowNull: true,
        },
        expiresAt: {
          type: DataTypes.DATE,
          allowNull: true,
        },
        grantedByUserId: {
          type: DataTypes.UUID,
          allowNull: true,
          references: {
            model: User,
            key: "id",
          },
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
        modelName: "UserPermissionOverrides",
        tableName: "user_permission_overrides",
        timestamps: true,
        indexes: [
          {
            unique: true,
            fields: ["userId", "permissionId"],
            name: "unique_user_permission_override",
          },
          {
            fields: ["userId"],
            name: "idx_user_overrides_userId",
          },
          {
            fields: ["expiresAt"],
            name: "idx_user_overrides_expiresAt",
          },
          {
            fields: ["effect"],
            name: "idx_user_overrides_effect",
          },
        ],
      }
    );

    return UserPermissionOverrides;
  }
}

export const initUserPermissionOverridesModel = (sequelize: Sequelize) =>
  UserPermissionOverrides.initModel(sequelize);

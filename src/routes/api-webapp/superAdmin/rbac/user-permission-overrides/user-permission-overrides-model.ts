import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  Sequelize,
} from "sequelize";
import { ZarklyXUser } from "../../../../api-webapp/superAdmin/authentication/user/user-model";
import { ZarklyXPermission } from "../../../../api-webapp/superAdmin/rbac/permissions/permissions-model";

export class ZarklyXUserPermissionOverride extends Model<
  InferAttributes<ZarklyXUserPermissionOverride>,
  InferCreationAttributes<ZarklyXUserPermissionOverride>
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

  static initModel(sequelize: Sequelize): typeof ZarklyXUserPermissionOverride {
    ZarklyXUserPermissionOverride.init(
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
            model: ZarklyXUser,
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
        effect: {
          type: DataTypes.ENUM("allow", "deny"),
          allowNull: false,
          comment: "allow = grant permission, deny = revoke permission",
        },
        reason: {
          type: DataTypes.TEXT,
          allowNull: true,
          comment: "Why this override was created (audit trail)",
        },
        expiresAt: {
          type: DataTypes.DATE,
          allowNull: true,
          comment: "Optional expiration date for temporary access",
        },
        grantedByUserId: {
          type: DataTypes.UUID,
          allowNull: true,
          references: {
            model: ZarklyXUser,
            key: "id",
          },
          comment: "Which admin granted this override (audit trail)",
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
        modelName: "ZarklyXUserPermissionOverride",
        tableName: "zarklyX_user_permission_overrides",
        timestamps: true,
        indexes: [
          {
            unique: true,
            fields: ["userId", "permissionId"],
            name: "idx_zarklyX_user_overrides_unique",
          },
          {
            fields: ["userId", "effect"],
            name: "idx_zarklyX_user_overrides_user_effect",
          },
          {
            fields: ["expiresAt"],
            name: "idx_zarklyX_user_overrides_expires",
          },
        ],
      }
    );

    return ZarklyXUserPermissionOverride;
  }
}

export const initZarklyXUserPermissionOverrideModel = (sequelize: Sequelize) =>
  ZarklyXUserPermissionOverride.initModel(sequelize);

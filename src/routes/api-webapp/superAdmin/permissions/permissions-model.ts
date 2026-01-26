import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  Sequelize,
} from "sequelize";
import { Modules } from "../../../api-webapp/superAdmin/modules/modules-model";
export class Permissions extends Model<
  InferAttributes<Permissions>,
  InferCreationAttributes<Permissions>
> {
  declare id: CreationOptional<string>;
  declare name: string;
  declare description: string;
  declare moduleId: string;
  declare action: string;
  declare isSystemPermission: boolean; // Protects critical permissions from overrides
  declare isSubscriptionExempt: boolean; // Allows access even without subscription (account survival)
  declare isActive: boolean;
  declare isDeleted: boolean;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  static initModel(sequelize: Sequelize): typeof Permissions {
    Permissions.init(
      {
        id: {
          type: DataTypes.UUID,
          defaultValue: DataTypes.UUIDV4,
          primaryKey: true,
          unique: true,
        },
        name: {
          type: DataTypes.STRING,
          allowNull: false,
          unique: true,
        },
        description: {
          type: DataTypes.STRING,
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
            type: DataTypes.STRING,
            allowNull: false,
        },
        isSystemPermission: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: false,
        },
        isSubscriptionExempt: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: false,
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
        modelName: "permissions",
        tableName: "permissions",
        timestamps: true,
      }
    );

    return Permissions;
  }
}

export const initPermissionsModel = (sequelize: Sequelize) =>
  Permissions.initModel(sequelize);

import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  Sequelize,
} from "sequelize";
import { ZarklyXRole } from "../../../../api-webapp/superAdmin/rbac/roles/roles-model";

export class ZarklyXUser extends Model<
  InferAttributes<ZarklyXUser>,
  InferCreationAttributes<ZarklyXUser>
> {
  declare id: CreationOptional<string>;
  declare email: string;
  declare password: string;
  declare firstName: string;
  declare lastName: string;
  declare roleId: string;
  declare phoneNumber: string;
  declare isdCode: string;
  declare isoCode: string;
  declare department: string | null;
  declare isThemeDark: boolean;
  declare isEmailVerified: boolean;
  declare googleId: string | null;
  declare appleId: string | null;
  declare authProvider: string;

  // Two-factor authentication
  declare twofactorEnabled: boolean;
  declare twofactorSecret: string | null;
  declare twofactorVerified: boolean;
  declare twofactorBackupCodes: string[] | null;
    
  // Temporary 2FA setup fields
  declare temp2FACode: string | null;
  declare temp2FACodeExpiry: Date | null;
  declare temp2FASecret: string | null;
  declare temp2FASecretExpiry: Date | null;

  declare isActive: boolean;
  declare isDeleted: boolean;
  declare lastLoginAt: Date | null;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  static initModel(sequelize: Sequelize): typeof ZarklyXUser {
    ZarklyXUser.init(
      {
        id: {
          type: DataTypes.UUID,
          defaultValue: DataTypes.UUIDV4,
          primaryKey: true,
          allowNull: false,
        },
        email: {
          type: DataTypes.STRING(255),
          allowNull: false,
          unique: true,
          validate: {
            isEmail: true,
          },
        },
        password: {
          type: DataTypes.STRING(255),
          allowNull: false,
        },
        firstName: {
          type: DataTypes.STRING(100),
          allowNull: false,
        },
        lastName: {
          type: DataTypes.STRING(100),
          allowNull: false,
        },
        roleId: {
          type: DataTypes.UUID,
          allowNull: false,
          references: {
            model: ZarklyXRole,
            key: "id",
          },
        },
        phoneNumber: {
          type: DataTypes.STRING(20),
          allowNull: true,
        },
        isoCode: {
            type: DataTypes.STRING(10),
            allowNull: true,
            defaultValue: null,
        },
        isdCode: {
            type: DataTypes.STRING(10),
            allowNull: true,
            defaultValue: null,
        },
        department: {
          type: DataTypes.STRING(100),
          allowNull: true,
          comment: "Engineering, Support, Sales, Finance, Operations, etc.",
        },
        isThemeDark: {
            type: DataTypes.BOOLEAN,
            allowNull: true,
            defaultValue: false,
        },
        isEmailVerified: {
            type: DataTypes.BOOLEAN,
            defaultValue: false,
        },
        googleId: {
            type: DataTypes.STRING,
            allowNull: true,
            // Removed unique constraint to stay within MySQL 64-key limit
        },
        appleId: {
            type: DataTypes.STRING,
            allowNull: true,
            // Removed unique constraint to stay within MySQL 64-key limit
        },
        authProvider: {
            type: DataTypes.ENUM("email", "google", "apple"),
            allowNull: false,
            defaultValue: "email",
        },
        // Two-factor authentication
        twofactorEnabled: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: false,
        },
        twofactorSecret: {
          type: DataTypes.STRING(255),
          allowNull: true,
          defaultValue: null,
        },
        twofactorVerified: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: false,              
        },
        twofactorBackupCodes: {                  
          type: DataTypes.JSON,
          allowNull: true,
          defaultValue: null,                
        },
                        // Temporary 2FA setup fields
                        temp2FACode: {
                            type: DataTypes.STRING(6),
                            allowNull: true,
                            defaultValue: null,
                        },
                        temp2FACodeExpiry: {
                            type: DataTypes.DATE,
                            allowNull: true,
                            defaultValue: null,
                        },
                        temp2FASecret: {
                            type: DataTypes.STRING(255),
                            allowNull: true,
                            defaultValue: null,
                        },
                        temp2FASecretExpiry: {
                            type: DataTypes.DATE,
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
        lastLoginAt: {
          type: DataTypes.DATE,
          allowNull: true,
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
        modelName: "ZarklyXUser",
        tableName: "zarklyX_users",
        timestamps: true,
        indexes: [
          {
            unique: true,
            fields: ["email"],
            name: "idx_zarklyX_users_email",
          },
          {
            fields: ["roleId", "isActive", "isDeleted"],
            name: "idx_zarklyX_users_role_active",
          },
        ],
      }
    );

    return ZarklyXUser;
  }
}

export const initZarklyXUserModel = (sequelize: Sequelize) =>
  ZarklyXUser.initModel(sequelize);

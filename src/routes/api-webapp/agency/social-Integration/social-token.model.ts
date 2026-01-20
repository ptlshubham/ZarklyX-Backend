import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  Sequelize,
} from "sequelize";

export class SocialToken extends Model<
  InferAttributes<SocialToken>,
  InferCreationAttributes<SocialToken>
> {
  declare id: CreationOptional<string>;
  // declare userId: number;
  declare companyId: string;
  declare accountEmail: string | null;
  // 'provider' is the canonical field used by token-store.service to identify
  // which social platform this token belongs to (e.g. 'google', 'facebook').
  declare provider: string;
  // declare providerId: number;
  // declare profile_picture: string | null;
  declare scopes: string;
  declare accessToken: string | null;
  declare refreshToken: string | null;
  declare expiryDate: number | null;
  declare tokenType: string | null;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare accountId: string | null;

  static initModel(sequelize: Sequelize): typeof SocialToken {
    SocialToken.init(
      {
        id: {
          type: DataTypes.UUID,
          defaultValue: DataTypes.UUIDV4,
          primaryKey: true,
          allowNull: false,
        },
        // userId: {
        //   type: DataTypes.INTEGER.UNSIGNED,
        //   allowNull: false,
        // },
        companyId: {
          type: DataTypes.STRING(255),
          allowNull: false,
        },
        accountEmail: {
          type: DataTypes.STRING(255),
          allowNull: true,
          defaultValue: null,
        },
        provider: {
          type: DataTypes.STRING(32),
          allowNull: false,
        },
        // providerId: {
        //   type: DataTypes.INTEGER.UNSIGNED,
        //   allowNull: false,
        // },
        // profile_picture: {
        //   type: DataTypes.STRING(255),
        //   allowNull: true,
        //   defaultValue: null,
        // },
        scopes: {
          type: DataTypes.TEXT,
          allowNull: false,
        },
        accessToken: {
          type: DataTypes.TEXT,
          allowNull: true,
          defaultValue: null,
        },
        refreshToken: {
          type: DataTypes.TEXT,
          allowNull: true,
          defaultValue: null,
        },
        expiryDate: {
          type: DataTypes.BIGINT,
          allowNull: true,
          defaultValue: null,
        },
        tokenType: {
          type: DataTypes.STRING(32),
          allowNull: true,
          defaultValue: null,
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
        accountId: {
          type: DataTypes.STRING(255),
          allowNull: true,
          defaultValue: null,
        },
      },
      {
        sequelize,
        modelName: "socialToken",
        tableName: "social_tokens",
        timestamps: true,
      }
    );

    return SocialToken;
  }
}

export const initSocialTokenModel = (sequelize: Sequelize) => SocialToken.initModel(sequelize);

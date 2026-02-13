import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  Sequelize,
} from "sequelize";
import { SocialToken } from "./social-token.model";

export class MetaSocialAccount extends Model<
  InferAttributes<MetaSocialAccount>,
  InferCreationAttributes<MetaSocialAccount>
> {
  declare id: CreationOptional<string>;
  declare companyId: string;
  declare assignedClientId: string | null;
  declare platform: "facebook" | "instagram";
  declare userAccessTokenId: string | null;
  declare facebookUserId: string;
  declare facebookPageId: string | null;
  declare facebookBusinessId: string | null;
  declare instagramBusinessId: string | null;
  declare accountName: string;
  declare profilePhoto: string | null;
  declare pageAccessToken: string | null;
  declare isAdded: boolean;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare userAccessTokenData?: SocialToken;

  static initModel(sequelize: Sequelize): typeof MetaSocialAccount {
    MetaSocialAccount.init(
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
        },

        assignedClientId: {
          type: DataTypes.UUID,
          allowNull: true,
        },

        platform: {
          type: DataTypes.ENUM("facebook", "instagram"),
          allowNull: false,
        },

        userAccessTokenId: {
          type: DataTypes.UUID,
          allowNull: true,
        },

        facebookUserId: {
          type: DataTypes.STRING(255),
          allowNull: false,
        },

        facebookPageId: {
          type: DataTypes.STRING(255),
          allowNull: true,
          defaultValue: null,
        },

        facebookBusinessId: {
          type: DataTypes.STRING(255),
          allowNull: true,
          defaultValue: null,
        },

        instagramBusinessId: {
          type: DataTypes.STRING(255),
          allowNull: true,
          defaultValue: null,
        },

        accountName: {
          type: DataTypes.STRING(255),
          allowNull: false,
        },

        profilePhoto: {
          type: DataTypes.STRING(1024),
          allowNull: true,
          defaultValue: null,
        },

        pageAccessToken: {
          type: DataTypes.TEXT,
          allowNull: true,
          defaultValue: null,
        },

        isAdded: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: false
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
        modelName: "metaSocialAccount",
        tableName: "meta_social_accounts",
        timestamps: true,
        indexes: [
          {
            unique: true,
            name: "uniq_company_platform_instagram_facebook",
            fields: ["companyId", "platform", "instagramBusinessId", "facebookPageId"]
          }
        ]
      }
    );

    return MetaSocialAccount;
  }
}

export const initMetaSocialAccountModel = (sequelize: Sequelize) =>
  MetaSocialAccount.initModel(sequelize);

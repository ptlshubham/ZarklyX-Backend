import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  Sequelize,
} from "sequelize";

export class MetaSocialAccount extends Model<
  InferAttributes<MetaSocialAccount>,
  InferCreationAttributes<MetaSocialAccount>
> {
  declare id: CreationOptional<string>;
  declare companyId: string;
  declare assignedClientId: string;
  declare platform: "facebook" | "instagram";
  declare userAccessToken: string | null;
  declare facebookUserId: string;
  declare facebookPageId: string;
  declare instagramBusinessId: string | null;
  declare accountName: string;
  declare pageAccessToken: string | null;
  declare isAdded: boolean;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

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
          type: DataTypes.INTEGER,
          allowNull: true,
        },

        platform: {
          type: DataTypes.ENUM("facebook", "instagram"),
          allowNull: false,
        },

        userAccessToken: {
          type: DataTypes.UUID,
          allowNull: false
        },

        facebookUserId: {
          type: DataTypes.STRING(255),
          allowNull: false,
        },

        facebookPageId: {
          type: DataTypes.STRING(255),
          allowNull: false,
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

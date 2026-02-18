import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  Sequelize,
} from "sequelize";

/**
 * LinkedInAccount Model
 * Represents LinkedIn organizations/accounts that are connected to the platform
 * Tracks which LinkedIn organization is assigned to which company/client
 */

export class LinkedInAccount extends Model<
  InferAttributes<LinkedInAccount>,
  InferCreationAttributes<LinkedInAccount>
> {
  declare id: CreationOptional<string>;
  declare companyId: string;
  declare userAccessTokenId: string;
  declare linkedinOrganizationId: string;
  declare organizationName: string;
  declare organizationEmail: string | null;
  declare accountType: string; // 'personal' | 'organization' | 'ad_account'
  declare profileUrl: string | null;
  declare profileImage: string | null;
  declare isAdded: boolean; // Flag indicating if account is added/enabled
  declare addedAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare createdAt: CreationOptional<Date>;

  static initModel(sequelize: Sequelize): typeof LinkedInAccount {
    LinkedInAccount.init(
      {
        id: {
          type: DataTypes.UUID,
          defaultValue: DataTypes.UUIDV4,
          primaryKey: true,
          allowNull: false,
        },
        companyId: {
          type: DataTypes.STRING(255),
          allowNull: false,
        },
        userAccessTokenId: {
          type: DataTypes.UUID,
          allowNull: false,
          references: {
            model: "social_tokens",
            key: "id",
          },
          onDelete: "CASCADE",
        },
        linkedinOrganizationId: {
          type: DataTypes.STRING(255),
          allowNull: false,
        },
        organizationName: {
          type: DataTypes.STRING(255),
          allowNull: false,
        },
        organizationEmail: {
          type: DataTypes.STRING(255),
          allowNull: true,
        },
        accountType: {
          type: DataTypes.ENUM("personal", "organization", "ad_account"),
          defaultValue: "personal",
          allowNull: false,
        },
        profileUrl: {
          type: DataTypes.TEXT,
          allowNull: true,
        },
        profileImage: {
          type: DataTypes.TEXT,
          allowNull: true,
        },
        isAdded: {
          type: DataTypes.BOOLEAN,
          defaultValue: false,
          allowNull: false,
        },
        addedAt: {
          type: DataTypes.DATE,
          defaultValue: DataTypes.NOW,
          allowNull: false,
        },
        updatedAt: {
          type: DataTypes.DATE,
          defaultValue: DataTypes.NOW,
          allowNull: false,
        },
        createdAt: {
          type: DataTypes.DATE,
          defaultValue: DataTypes.NOW,
          allowNull: false,
        },
      },
      {
        sequelize,
        tableName: "linkedin_accounts",
        timestamps: true,
        underscored: false,
        freezeTableName: true,
      }
    );

    return LinkedInAccount;
  }
}

export default LinkedInAccount;

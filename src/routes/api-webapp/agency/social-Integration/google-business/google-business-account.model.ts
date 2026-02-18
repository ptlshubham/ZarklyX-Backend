import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  Sequelize,
} from "sequelize";

/**
 * GoogleBusinessAccount Model
 * Represents Google My Business accounts that are connected to the platform
 * Tracks which Google Business account is assigned to which company/client
 */

export class GoogleBusinessAccount extends Model<
  InferAttributes<GoogleBusinessAccount>,
  InferCreationAttributes<GoogleBusinessAccount>
> {
  declare id: CreationOptional<string>;
  declare companyId: string;
  declare userAccessTokenId: string;
  declare googleBusinessAccountId: string;
  declare accountName: string;
  declare accountEmail: string | null;
  declare businessLocationsCount: number | null;
  declare profileUrl: string | null;
  declare profileImage: string | null;
  declare isAdded: boolean; // Flag indicating if account is added/enabled
  declare addedAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare createdAt: CreationOptional<Date>;

  static initModel(sequelize: Sequelize): typeof GoogleBusinessAccount {
    GoogleBusinessAccount.init(
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
        googleBusinessAccountId: {
          type: DataTypes.STRING(255),
          allowNull: false,
        },
        accountName: {
          type: DataTypes.STRING(255),
          allowNull: false,
        },
        accountEmail: {
          type: DataTypes.STRING(255),
          allowNull: true,
        },
        businessLocationsCount: {
          type: DataTypes.INTEGER,
          allowNull: true,
          defaultValue: null,
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
        tableName: "google_business_accounts",
        timestamps: true,
        underscored: true,
      }
    );
    return GoogleBusinessAccount;
  }
}

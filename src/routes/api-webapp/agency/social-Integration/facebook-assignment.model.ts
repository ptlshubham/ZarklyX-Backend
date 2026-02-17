import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  Sequelize,
} from "sequelize";
import { MetaSocialAccount } from "./meta-social-account.model";

export class FacebookAssignment extends Model<
  InferAttributes<FacebookAssignment>,
  InferCreationAttributes<FacebookAssignment>
> {
  declare id: CreationOptional<string>;
  declare companyId: string;
  declare pageId: string;
  declare clientId: number;
  declare metaAccountId: string | null;
  declare facebookPageName: string;
  declare facebookPageCategory: string | null;
  declare clientName: string;
  declare clientEmail: string | null;
  declare isSaved: boolean;
  declare assignedAt: Date;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  static initModel(sequelize: Sequelize): typeof FacebookAssignment {
    FacebookAssignment.init(
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

        pageId: {
          type: DataTypes.STRING(255),
          allowNull: false,
        },

        clientId: {
          type: DataTypes.INTEGER,
          allowNull: false,
        },

        metaAccountId: {
          type: DataTypes.UUID,
          allowNull: true,
          references: {
            model: "meta_social_accounts",
            key: "id",
          },
        },

        facebookPageName: {
          type: DataTypes.STRING(255),
          allowNull: false,
        },

        facebookPageCategory: {
          type: DataTypes.STRING(255),
          allowNull: true,
          defaultValue: null,
        },

        clientName: {
          type: DataTypes.STRING(255),
          allowNull: false,
        },

        clientEmail: {
          type: DataTypes.STRING(255),
          allowNull: true,
          defaultValue: null,
        },

        isSaved: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: false,
        },

        assignedAt: {
          type: DataTypes.DATE,
          allowNull: false,
          defaultValue: DataTypes.NOW,
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
        modelName: "facebookAssignment",
        tableName: "facebook_assignments",
        timestamps: true,
        indexes: [
          {
            unique: true,
            name: "uniq_company_page",
            fields: ["companyId", "pageId"],
          },
        ],
      }
    );

    return FacebookAssignment;
  }
}

export const initFacebookAssignmentModel = (sequelize: Sequelize) =>
  FacebookAssignment.initModel(sequelize);

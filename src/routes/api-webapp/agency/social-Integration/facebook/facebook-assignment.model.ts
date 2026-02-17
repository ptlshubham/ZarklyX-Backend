import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  Sequelize,
} from "sequelize";

/**
 * FacebookAssignment Model
 * Represents the assignment of Facebook pages to clients/employees
 * Tracks which client/employee is assigned to manage which Facebook page
 */

export class FacebookAssignment extends Model<
  InferAttributes<FacebookAssignment>,
  InferCreationAttributes<FacebookAssignment>
> {
  declare id: CreationOptional<string>;
  declare companyId: string;
  declare metaAccountId: string;
  declare pageId: string;
  declare clientId: string;
  declare clientName: string;
  declare clientEmail: string;
  declare facebookPageName: string;
  declare facebookPageCategory: string | null;
  declare isSaved: boolean; // Flag indicating saved pages
  declare assignedAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare createdAt: CreationOptional<Date>;

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
          type: DataTypes.STRING(255),
          allowNull: false,
        },  
        metaAccountId: {
          type: DataTypes.UUID,
          allowNull: false,
          references: {
            model: "meta_social_accounts",
            key: "id",
          },
          onDelete: "CASCADE",
        },
        pageId: {
          type: DataTypes.STRING(255),
          allowNull: false,
        },
        clientId: {
          type: DataTypes.STRING(255),
          allowNull: false,
        },
        clientName: {
          type: DataTypes.STRING(255),
          allowNull: false,
        },
        clientEmail: {
          type: DataTypes.STRING(255),
          allowNull: false,
        },
        facebookPageName: {
          type: DataTypes.STRING(255),
          allowNull: false,
        },
        facebookPageCategory: {
          type: DataTypes.STRING(255),
          allowNull: true,
        },
        isSaved: {
          type: DataTypes.BOOLEAN,
          defaultValue: false,
          allowNull: false,
        },
        assignedAt: {
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
        tableName: "facebook_assignments",
        timestamps: true,
        underscored: false,
        freezeTableName: true,
      }
    );

    return FacebookAssignment;
  }
}

export default FacebookAssignment;

import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  Sequelize,
} from "sequelize";

/**
 * PinterestAssignment Model
 * Represents the assignment of Pinterest boards to clients/employees
 * Tracks which client/employee is assigned to manage which Pinterest board
 */

export class PinterestAssignment extends Model<
  InferAttributes<PinterestAssignment>,
  InferCreationAttributes<PinterestAssignment>
> {
  declare id: CreationOptional<string>;
  declare companyId: string;
  declare pinterestUserId: string;
  declare boardId: string;
  declare clientId: string;
  declare clientName: string;
  declare clientEmail: string;
  declare pinterestBoardName: string;
  declare pinterestBoardDescription: string | null;
  declare boardPrivacy: string | null;
  declare collaboratorCount: number | null;
  declare isSaved: boolean; // Flag indicating saved boards
  declare connectedAt: CreationOptional<Date>; // When the Pinterest user was connected
  declare assignedAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;
  declare createdAt: CreationOptional<Date>;

  static initModel(sequelize: Sequelize): typeof PinterestAssignment {
    PinterestAssignment.init(
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
        pinterestUserId: {
          type: DataTypes.STRING(255),
          allowNull: false,
          comment: "Reference to SocialToken.accountId (not a hard foreign key to avoid constraint issues)",
        },
        boardId: {
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
        pinterestBoardName: {
          type: DataTypes.STRING(255),
          allowNull: false,
        },
        pinterestBoardDescription: {
          type: DataTypes.TEXT,
          allowNull: true,
        },
        boardPrivacy: {
          type: DataTypes.STRING(50),
          allowNull: true,
          comment: "PUBLIC, PROTECTED, or SECRET",
        },
        collaboratorCount: {
          type: DataTypes.INTEGER,
          allowNull: true,
        },
        isSaved: {
          type: DataTypes.BOOLEAN,
          defaultValue: false,
          allowNull: false,
        },
        connectedAt: {
          type: DataTypes.DATE,
          defaultValue: DataTypes.NOW,
          allowNull: false,
          comment: "When the Pinterest user was connected",
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
        tableName: "pinterest_assignments",
        timestamps: true,
        underscored: false,
        freezeTableName: true,
      }
    );

    return PinterestAssignment;
  }
}

export default PinterestAssignment;

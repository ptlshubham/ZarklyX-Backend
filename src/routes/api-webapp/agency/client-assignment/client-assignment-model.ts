import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  Sequelize,
} from "sequelize";
import { Clients } from "../clients/clients-model";
import { User } from "../../authentication/user/user-model";

export class ClientUserAssignment extends Model<
  InferAttributes<ClientUserAssignment>,
  InferCreationAttributes<ClientUserAssignment>
> {
  declare id: CreationOptional<string>;
  declare companyId: string;
  declare clientId: string;
  declare assignedUserId: string;
  declare role: "manager" | "employee";
  declare assignedBy: string;
  declare isActive: boolean;
  declare createdAt: CreationOptional<Date>;
}

export const initClientUserAssignmentModel = (sequelize: Sequelize) => {
  ClientUserAssignment.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      companyId: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      clientId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: Clients, key: "id" },
      },
      assignedUserId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: { model: User, key: "id" },
      },
      role: {
        type: DataTypes.ENUM("manager", "employee"),
        allowNull: false,
      },
      assignedBy: {
        type: DataTypes.UUID,
        allowNull: false,
      },
      isActive: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
      },
      createdAt: {
        type: DataTypes.DATE,
        defaultValue: DataTypes.NOW,
      },
    },
    {
      sequelize,
      tableName: "client_user_assignments",
      timestamps: false,
      indexes: [
        { fields: ["clientId"] },
        { fields: ["assignedUserId"] },
        { unique: true, fields: ["clientId", "assignedUserId"] },
      ],
    }
  );
};
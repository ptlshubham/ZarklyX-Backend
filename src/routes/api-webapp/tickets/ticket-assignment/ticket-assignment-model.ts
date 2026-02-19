import {
    CreationOptional,
    DataTypes,
    InferAttributes,
    InferCreationAttributes,
    Model,
    Sequelize,
} from "sequelize";

export class TicketAssignment extends Model<
    InferAttributes<TicketAssignment>,
    InferCreationAttributes<TicketAssignment>
> {
    declare id: CreationOptional<string>; // UUID
    declare ticketId: string; 
    declare employeeId: string; 
    declare employeeTicketStatus: "Pending" | "Processing" | "Hold" | "Review" | "Changes" | "Completed";
    declare assignedBy: string; 
    declare isActive: boolean;
    declare isDeleted: boolean;
    declare createdAt: CreationOptional<Date>;
    declare updatedAt: CreationOptional<Date>;

    static initModel(sequelize: Sequelize): typeof TicketAssignment {
        TicketAssignment.init(
            {
                id: {
                    type: DataTypes.UUID,
                    defaultValue: DataTypes.UUIDV4,
                    primaryKey: true,
                    allowNull: false,
                    unique: true,
                },
                ticketId: {
                    type: DataTypes.UUID,
                    allowNull: false,
                    references: {
                        model: "tickets",
                        key: "id",
                    },
                    onDelete: "CASCADE",
                },
                  assignedBy: {
                    type: DataTypes.UUID,
                    allowNull: false,
                    references: {
                        model: "user",
                        key: "id",
                    },
                    comment: "Manager/Admin who assigned this employee",
                },
                employeeId: {
                    type: DataTypes.UUID,
                    allowNull: false,
                    references: {
                        model: "employee",
                        key: "id",
                    },
                    onDelete: "CASCADE",
                },
                employeeTicketStatus: {
                    type: DataTypes.ENUM("Pending", "Processing", "Hold", "Review", "Changes", "Completed"),
                    allowNull: false,
                    defaultValue: "Pending",
                    comment: "Individual employee's status on this ticket",
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
                modelName: "TicketAssignment",
                tableName: "ticket_assignments",
                timestamps: true,
                indexes: [
                    {
                        fields: ["ticketId"],
                        name: "idx_ticket_assignments_ticket",
                    },
                    {
                        fields: ["employeeId"],
                        name: "idx_ticket_assignments_employee",
                    },
                    {
                        fields: ["ticketId", "employeeId"],
                        name: "idx_ticket_assignments_unique",
                        unique: true,
                    },
                    {
                        fields: ["employeeTicketStatus"],
                        name: "idx_ticket_assignments_status",
                    },
                ],
            }
        );

        return TicketAssignment;
    }

    // TODO: Define associations in a separate file or initialization function
    // static associate(models: any) {
    //     TicketAssignment.belongsTo(models.Ticket, { foreignKey: "ticketId", as: "ticket" });
    //     TicketAssignment.belongsTo(models.Employee, { foreignKey: "employeeId", as: "employee" });
    //     TicketAssignment.belongsTo(models.User, { foreignKey: "assignedBy", as: "assigner" });
    // }
}

export const initTicketAssignmentModel = (sequelize: Sequelize) =>
    TicketAssignment.initModel(sequelize);

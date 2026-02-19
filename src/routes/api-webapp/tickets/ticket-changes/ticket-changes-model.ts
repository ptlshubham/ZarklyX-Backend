import {
    CreationOptional,
    DataTypes,
    InferAttributes,
    InferCreationAttributes,
    Model,
    Sequelize,
} from "sequelize";

export class TicketChanges extends Model<
    InferAttributes<TicketChanges>,
    InferCreationAttributes<TicketChanges>
> {
    // Primary Key
    declare id: CreationOptional<string>; // UUID

    // Relationships
    declare ticketId: string; // FK to Ticket
    declare requestedByUserId: string; // FK to User (usually client)//clientid
    declare employeeId: string | null; // FK to employee (employee is assigned to work on the change request)

    // Change Tracking
    declare changeNumber: string; // "A7F9Q2" or "A7F9Q2-1", "A7F9Q2-2"
    declare changeStatus: "Pending" | "In Progress" | "Completed";

    // Change Request Details
    declare changeDescription: string; // What the client wants changed
    declare isMultiEmployeeChange: boolean; // True if this change request is assigned to multiple employees (for handover scenarios)
    declare isActive: boolean; 
    declare isDeleted: boolean;
    declare createdAt: CreationOptional<Date>;
    declare updatedAt: CreationOptional<Date>;

    static initModel(sequelize: Sequelize): typeof TicketChanges {
        TicketChanges.init(
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
                requestedByUserId: {
                    type: DataTypes.UUID,
                    allowNull: false,
                    references: {
                        model: "user",
                        key: "id",
                    },
                    comment: "User who requested the change (client/manager/admin - all are Users)",
                },
                employeeId: {
                    type: DataTypes.UUID,
                    allowNull: true,
                    references: {
                        model: "employee",
                        key: "id",
                    },
                    comment: "Employee assigned to work on this change request (the employee)",
                },
                changeNumber: {
                    type: DataTypes.STRING(20),
                    allowNull: false,
                    comment: "Unique change identifier e.g. A7F9Q2, A7F9Q2-1",
                },
                changeStatus: {
                    type: DataTypes.ENUM("Pending", "In Progress", "Completed"),
                    allowNull: false,
                    defaultValue: "Pending",
                    comment: "Status of this specific change request",
                },
                changeDescription: {
                    type: DataTypes.TEXT,
                    allowNull: false,
                    validate: {
                        notEmpty: {
                            msg: "Change description cannot be empty",
                        },
                    },
                    comment: "Description of what needs to be changed",
                },
                isMultiEmployeeChange: {
                    type: DataTypes.BOOLEAN,
                    defaultValue: false,
                    allowNull: false,
                },
                isActive:{
                    type: DataTypes.BOOLEAN,
                    allowNull: false,
                    defaultValue: true,
                },
                isDeleted:{
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
                modelName: "TicketChanges",
                tableName: "ticket_changes",
                timestamps: true,
                indexes: [
                    {
                        fields: ["ticketId"],
                        name: "idx_ticket_changes_ticket",
                    },
                    {
                        fields: ["requestedByUserId"],
                        name: "idx_ticket_changes_requester",
                    },
                    {
                        fields: ["createdAt"],
                        name: "idx_ticket_changes_created",
                    },
                ],
            }
        );

        return TicketChanges;
    }

}

export const initTicketChangeModel = (sequelize: Sequelize) =>
    TicketChanges.initModel(sequelize);

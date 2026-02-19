import {
    CreationOptional,
    DataTypes,
    InferAttributes,
    InferCreationAttributes,
    Model,
    Sequelize,
} from "sequelize";

export class Ticket extends Model<
    InferAttributes<Ticket>,
    InferCreationAttributes<Ticket>
> {
 
    // Primary Key
    declare id: CreationOptional<string>; 
    declare ticketNumber: string; 
    declare companyId: string; // FK to Company
    declare clientId: string; // FK to Clients (all tickets are client tickets)
    declare createdByUserId: string; // FK to User (dynamic role of ticket creator)
    declare assignedManagerId: string; // FK to employee (from client's assigned manager)
    declare title: string;
    declare description: string;
    declare priority: "Low" | "Medium" | "High";
    declare overallStatus: "Pending" | "Processing" | "Hold" | "Review" | "Changes" | "Completed";

    declare deliveryDate: Date | null; 
    declare expectedDate: Date | null;
    declare isMultiAssignee: boolean; 
    declare lastHandoverId: string | null; 
    declare isActive: boolean; 
    declare isDeleted: boolean;
    declare deletedAt: Date | null;
    declare completedAt: Date | null; 
    declare createdAt: CreationOptional<Date>;
    declare updatedAt: CreationOptional<Date>;

    static initModel(sequelize: Sequelize): typeof Ticket {
        Ticket.init(
            {
                id: {
                    type: DataTypes.UUID,
                    defaultValue: DataTypes.UUIDV4,
                    primaryKey: true,
                    allowNull: false,
                    unique: true,
                },
                ticketNumber: {
                    type: DataTypes.STRING(10),
                    allowNull: false,
                    comment: "Human-readable unique ticket identifier (e.g. A7F9Q2)",
                },
                companyId: {
                    type: DataTypes.UUID,
                    allowNull: false,
                    references: {
                        model: "company",
                        key: "id",
                    },
                },
                clientId: {
                    type: DataTypes.UUID,
                    allowNull: false,
                    references: {
                        model: "clients",
                        key: "id",
                    },
                    comment: "Required - all tickets are client tickets",
                },
                assignedManagerId: {
                    type: DataTypes.UUID,
                    allowNull: false,
                    references: {
                        model: "employee",
                        key: "id",
                    },
                    comment: "Manager assigned to client (auto-loaded from client record)",
                },
                createdByUserId: {
                    type: DataTypes.UUID,
                    allowNull: false,
                    references: {
                        model: "user",
                        key: "id",
                    },
                    comment: "Dynamic user ID of ticket creator - user details can be fetched from user table",
                },
                title: {
                    type: DataTypes.STRING(255),
                    allowNull: false,
                    validate: {
                        notEmpty: {
                            msg: "Ticket title cannot be empty",
                        },
                    },
                },
                description: {
                    type: DataTypes.TEXT,
                    allowNull: false,
                    validate: {
                        notEmpty: {
                            msg: "Ticket description cannot be empty",
                        },
                    },
                },
                priority: {
                    type: DataTypes.ENUM("Low", "Medium", "High"),
                    allowNull: false,
                    defaultValue: "Medium",
                },
                overallStatus: {
                    type: DataTypes.ENUM("Pending", "Processing", "Hold","Review", "Changes", "Completed"),
                    allowNull: false,
                    defaultValue: "Pending",
                    comment: "Derived from employee assignment statuses",
                },
                expectedDate: {
                    type: DataTypes.DATE,
                    allowNull: true,
                    comment: "Client expected completion date",
                },
                deliveryDate: {
                    type: DataTypes.DATE,
                    allowNull: true,
                    comment: "Company committed deadline",
                },
                isMultiAssignee: {
                    type: DataTypes.BOOLEAN,
                    allowNull: false,
                    defaultValue: false,
                    comment: "True if ticket is assigned to multiple employees",
                },
                lastHandoverId: {
                    type: DataTypes.UUID,
                    allowNull: true,
                    references: {
                        model: "manager_handover",
                        key: "id",
                    },
                    comment: "If ticket was reassigned due to a manager handover, store handover id",
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
                deletedAt: {
                    type: DataTypes.DATE,
                    allowNull: true,
                },
                completedAt: {
                    type: DataTypes.DATE,
                    allowNull: true,
                    comment: "When ticket was marked completed",
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
                modelName: "Ticket",
                tableName: "tickets",
                timestamps: true,
                indexes: [
                    {
                        fields: ["companyId"],
                        name: "idx_tickets_company",
                    },
                    {
                        fields: ["clientId"],
                        name: "idx_tickets_client",
                    },
                    {
                        fields: ["createdByUserId"],
                        name: "idx_tickets_created_by_user",
                    },
                ],
            }
        );

        return Ticket;
    }

}

export const initTicketModel = (sequelize: Sequelize) => Ticket.initModel(sequelize);

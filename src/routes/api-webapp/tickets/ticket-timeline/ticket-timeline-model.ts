import {
    CreationOptional,
    DataTypes,
    InferAttributes,
    InferCreationAttributes,
    Model,
    Sequelize,
} from "sequelize";

export class TicketTimeline extends Model<
    InferAttributes<TicketTimeline>,
    InferCreationAttributes<TicketTimeline>
> {
    // Primary Key
    declare id: CreationOptional<string>; // UUID

    // Relationships
    declare ticketId: string; // FK to Ticket
    declare changedBy: string; // FK to User (who made the change)//employeeid

    // Timeline Event Details
    declare changeType: "status" | "priority" | "handover_assign" | "handover_revert" | "handover_cancel" | "handover_accept"; // Type of change
    declare oldValue: string | null; // Previous state (status or priority)
    declare newValue: string | null; // New state (status or priority)

    // Timestamps
    declare createdAt: CreationOptional<Date>;

    static initModel(sequelize: Sequelize): typeof TicketTimeline {
        TicketTimeline.init(
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
                changedBy: {
                    type: DataTypes.UUID,
                    allowNull: false,
                    references: {
                        model: "user",
                        key: "id",
                    },
                    comment: "User who performed this action",
                },
                changeType: {
                    type: DataTypes.ENUM("status", "priority", "handover_assign", "handover_revert", "handover_cancel"),
                    allowNull: false,
                    comment: "Type of change recorded in the timeline",
                },
                oldValue: {
                    type: DataTypes.STRING(50),
                    allowNull: true,
                    comment: "Previous status or priority value",
                },
                newValue: {
                    type: DataTypes.STRING(50),
                    allowNull: true,
                    comment: "New status or priority value",
                },
                createdAt: {
                    type: DataTypes.DATE,
                    allowNull: false,
                    defaultValue: DataTypes.NOW,
                },
            },
            {
                sequelize,
                modelName: "TicketTimeline",
                tableName: "ticket_timeline",
                timestamps: false, // Only createdAt, no updatedAt for audit logs
                updatedAt: false,
                indexes: [
                    {
                        fields: ["ticketId"],
                        name: "idx_ticket_timeline_ticket",
                    },
                    {
                        fields: ["changedBy"],
                        name: "idx_ticket_timeline_user",
                    },
                    {
                        fields: ["createdAt"],
                        name: "idx_ticket_timeline_created",
                    },
                ],
            }
        );

        return TicketTimeline;
    }

}

export const initTicketTimelineModel = (sequelize: Sequelize) =>
    TicketTimeline.initModel(sequelize);

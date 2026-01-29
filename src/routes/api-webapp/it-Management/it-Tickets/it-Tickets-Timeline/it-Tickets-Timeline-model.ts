import {
    CreationOptional,
    DataTypes,
    InferCreationAttributes,
    InferAttributes,
    Model,
    Sequelize,
} from "sequelize";

export class ItTicketsTimeline extends Model<
    InferAttributes<ItTicketsTimeline>,
    InferCreationAttributes<ItTicketsTimeline>
> {
    declare id: CreationOptional<string>; // UUID
    declare employeeId: string
    declare itTicketId: string
    declare status: string | null;
    declare createdAt: CreationOptional<Date>;
    declare updatedAt: CreationOptional<Date>;

    static initModel(sequelize: Sequelize): typeof ItTicketsTimeline {
        ItTicketsTimeline.init(
            {
                id: {
                    type: DataTypes.UUID,
                    defaultValue: DataTypes.UUIDV4,
                    primaryKey: true,
                    allowNull: false,
                    unique: true,
                },
                employeeId: {
                    type: DataTypes.UUID,
                    allowNull: true,
                    defaultValue: null,
                },
                itTicketId: {
                    type: DataTypes.UUID,
                    allowNull: true,
                    references: {
                        model: "itTickets",
                        key: "id",
                    },
                    onDelete: "CASCADE",
                },
                status: {
                    type: DataTypes.ENUM('Pending', 'In Progress', 'Hold', 'Completed', 'Rejected'),
                    allowNull: false,
                    defaultValue: 'Pending',
                },
                createdAt: {
                    type: DataTypes.DATE,
                    allowNull: false,
                    defaultValue: DataTypes.NOW,
                },
                updatedAt: {
                    type: DataTypes.DATE,
                    allowNull: true,
                    defaultValue: null,
                },
            },
            {
                sequelize,
                freezeTableName: true,
                tableName: "itTicketsTimeline",
                timestamps: true,
                updatedAt: false
            }
        );
        return ItTicketsTimeline;
    }
}
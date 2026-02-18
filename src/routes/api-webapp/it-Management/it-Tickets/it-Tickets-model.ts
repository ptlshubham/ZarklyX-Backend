import {
    CreationOptional,
    DataTypes,
    InferCreationAttributes,
    InferAttributes,
    Model,
    Sequelize,
} from "sequelize";

export class ItTickets extends Model<
    InferAttributes<ItTickets>,
    InferCreationAttributes<ItTickets>
> {
    declare id: CreationOptional<string>; // UUID
    declare employeeId: string;
    declare companyId: string;
    declare subject: string;
    declare description: string;
    declare priority: string;
    declare preferredDate: Date | null;
    declare status: string | null;
    declare isDeleted: boolean;
    declare createdAt: CreationOptional<Date>;
    declare updatedAt: CreationOptional<Date>;

    static initModel(sequelize: Sequelize): typeof ItTickets {
        ItTickets.init(
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
                companyId: {
                    type: DataTypes.UUID,
                    allowNull: true,
                    defaultValue: null,
                },
                subject: {
                    type: DataTypes.STRING(255),
                    allowNull: false,
                },
                description: {
                    type: DataTypes.TEXT,
                    allowNull: false,
                },
                priority: {
                    type: DataTypes.ENUM('Low', 'Medium', 'High'),
                    allowNull: false,
                },
                preferredDate: {
                    type: DataTypes.DATE,
                    allowNull: true,
                    defaultValue: null,
                },
                status: {
                    type: DataTypes.ENUM('Pending', 'In Progress', 'Hold', 'Completed', 'Rejected'),
                    allowNull: false,
                    defaultValue: 'Pending',
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
                freezeTableName: true,
                tableName: "itTickets",
                timestamps: true
            }
        );
        return ItTickets;
    }
}
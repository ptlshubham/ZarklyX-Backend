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
    declare userId: string;
    declare companyId: string;
    declare subject: string;
    declare description: string;
    declare preferredDate: Date | null;
    declare status: string | null;
    declare attachments: string[] | null;
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
                userId: {
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
                preferredDate: {
                    type: DataTypes.DATE,
                    allowNull: true,
                    defaultValue: null,
                },
                status: {
                    type: DataTypes.ENUM('Open', 'In Progress', 'Completed'),
                    allowNull: false,
                    defaultValue: 'Open',
                },
                attachments: {
                    type: DataTypes.JSON,
                    allowNull: true,
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
                isDeleted:{
                    type: DataTypes.BOOLEAN,
                    allowNull: false,
                    defaultValue: false,
                }
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
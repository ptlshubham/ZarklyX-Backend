import {
    CreationOptional,
    DataTypes,
    InferCreationAttributes,
    InferAttributes,
    Model,
    Sequelize,
} from "sequelize";

export class ItTicketsAttachments extends Model<
    InferAttributes<ItTicketsAttachments>,
    InferCreationAttributes<ItTicketsAttachments>
> {
    declare id: CreationOptional<string>; // UUID
    declare itTicketId: string | null;
    declare attachmentPath: string;
    declare createdAt: CreationOptional<Date>;
    declare updatedAt: CreationOptional<Date>;

    static initModel(sequelize: Sequelize): typeof ItTicketsAttachments {
        ItTicketsAttachments.init(
            {
                id: {
                    type: DataTypes.UUID,
                    defaultValue: DataTypes.UUIDV4,
                    primaryKey: true,
                    allowNull: false,
                    unique: true,
                },
                itTicketId: {
                    type: DataTypes.UUID,
                    allowNull: false,
                    references: {
                        model: "itTickets",
                        key: "id",
                    },
                    onDelete: "CASCADE",
                },
                attachmentPath:{
                    type:DataTypes.STRING(255),
                    allowNull:false,
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
                tableName: "itTicketsAttachments",
                timestamps: true
            }
        );
        return ItTicketsAttachments;
    }
}
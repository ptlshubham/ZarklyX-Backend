import {
    CreationOptional,
    DataTypes,
    InferAttributes,
    InferCreationAttributes,
    Model,
    Sequelize,
} from "sequelize";

export class TicketAttachment extends Model<
    InferAttributes<TicketAttachment>,
    InferCreationAttributes<TicketAttachment>
> {
    declare id: CreationOptional<string>; // UUID

    declare ticketId: string; // FK to Ticket
    declare changeId: string | null;  //FK to Change (if attachment is related to a change request)

    declare attachmentPath: string;

    declare createdAt: CreationOptional<Date>;
    declare updatedAt: CreationOptional<Date>;

    static initModel(sequelize: Sequelize): typeof TicketAttachment {
        TicketAttachment.init(
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
                  changeId: {
                    type: DataTypes.UUID,
                    allowNull: true,
                    references: {
                        model: "ticket_changes",
                        key: "id",
                    },
                    onDelete: "SET NULL",
                },
                attachmentPath: {
                    type: DataTypes.STRING(255),
                    allowNull: false,
                    comment: "File path or URL of the attachment",
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
                modelName: "TicketAttachment",
                tableName: "ticket_attachments",
                timestamps: true,
                indexes: [
                    {
                        fields: ["ticketId"],
                        name: "idx_ticket_attachments_ticket",
                    },
                    {
                        fields: ["createdAt"],
                        name: "idx_ticket_attachments_created",
                    },
                ],
            }
        );

        return TicketAttachment;
    }

}

export const initTicketAttachmentModel = (sequelize: Sequelize) =>
    TicketAttachment.initModel(sequelize);

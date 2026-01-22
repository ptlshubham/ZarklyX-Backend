import {
    CreationOptional,
    DataTypes,
    InferCreationAttributes,
    InferAttributes,
    Model,
    Sequelize,
} from "sequelize";

export class CreditNoteItem extends Model<
    InferAttributes<CreditNoteItem>,
    InferCreationAttributes<CreditNoteItem>
> {
    declare id: CreationOptional<string>;
    declare creditNoteId: string; // Foreign key to Credit-Note table
    declare itemId: string; // Foreign key to Item table
    // Snapshot fields from Item table
    declare itemName: string;
    declare description: string | null;
    declare hsn: string | null;
    declare sac: string | null;
    declare unitId: string; // Foreign key to Unit table
    declare tax: number;
    declare cessPercentage: number;
    declare quantity: number;
    declare unitPrice: number;
    declare discount: number; // Calculated discount amount
    declare taxable: number | null; // Taxable amount (after discount, before tax)
    declare taxAmount: number;
    declare totalAmount: number;
    declare isActive: boolean;
    declare isDeleted: boolean;
    declare createdAt: CreationOptional<Date>;
    declare updatedAt: CreationOptional<Date>;

    static initModel(sequelize: Sequelize): typeof CreditNoteItem {
        CreditNoteItem.init(
            {
                id: {
                    type: DataTypes.UUID,
                    defaultValue: DataTypes.UUIDV4,
                    primaryKey: true,
                },
                creditNoteId: {
                    type: DataTypes.UUID,
                    allowNull: false,
                },
                itemId: {
                    type: DataTypes.UUID,
                    allowNull: false,
                },
                itemName: {
                    type: DataTypes.STRING(255),
                    allowNull: false,
                },
                description: {
                    type: DataTypes.TEXT,
                    allowNull: true,
                },
                hsn: {
                    type: DataTypes.STRING(50),
                    allowNull: true,
                },
                sac: {
                    type: DataTypes.STRING(50),
                    allowNull: true,
                },
                unitId: {
                    type: DataTypes.UUID,
                    allowNull: false,
                },
                tax: {
                    type: DataTypes.DECIMAL(5, 2),
                    allowNull: false,
                    defaultValue: 0,
                },
                cessPercentage: {
                    type: DataTypes.DECIMAL(5, 2),
                    allowNull: false,
                    defaultValue: 0,
                },
                quantity: {
                    type: DataTypes.DECIMAL(10, 2),
                    allowNull: false,
                },
                unitPrice: {
                    type: DataTypes.DECIMAL(10, 2),
                    allowNull: false,
                },
                discount: {
                    type: DataTypes.DECIMAL(10, 2),
                    allowNull: false,
                    defaultValue: 0,
                },
                taxable: {
                    type: DataTypes.DECIMAL(12, 2),
                    allowNull: true,
                    comment: 'Taxable amount after discount but before tax',
                },
                taxAmount: {
                    type: DataTypes.DECIMAL(10, 2),
                    allowNull: false,
                },
                totalAmount: {
                    type: DataTypes.DECIMAL(10, 2),
                    allowNull: false,
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
                modelName: "CreditNoteItem",
                tableName: "credit_note_item",
                timestamps: true,
                indexes: [
                    {
                        fields: ['creditNoteId'],
                    },
                    {
                        fields: ['itemId'],
                    },
                ],
            }
        );
        return CreditNoteItem;
    }
}

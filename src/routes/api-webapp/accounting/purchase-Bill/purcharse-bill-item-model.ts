import {
    CreationOptional,
    DataTypes,
    InferCreationAttributes,
    InferAttributes,
    Model,
    Sequelize,
} from "sequelize";

export class PurchaseBillItem extends Model<
    InferAttributes<PurchaseBillItem>,
    InferCreationAttributes<PurchaseBillItem>
> {
    declare id: CreationOptional<string>;
    declare purchaseBillId: string; // Foreign key to Purchase Bill table
    declare itemId: string; // Foreign key to Item table
    // Snapshot fields from Item (copied at purchase bill creation)
    declare itemName: string;
    declare description: string | null;
    declare hsn: string | null; // For products
    declare sac: string | null; // For services
    declare unitId: string | null; // Foreign key to Unit table
    declare tax: number | null; // Tax percentage at time of Purchase bill
    declare cessPercentage: number | null;
    // Purchase Bill-specific fields
    declare quantity: number;
    declare unitPrice: number; // Price at time of purchase bill
    declare discount: number | null; // Item-specific discount
    declare taxable: number | null; // Taxable amount (after discount, before tax)
    declare taxAmount: number | null;
    declare totalAmount: number;
    declare createdAt: CreationOptional<Date>;
    declare updatedAt: CreationOptional<Date>;

    static initModel(sequelize: Sequelize): typeof PurchaseBillItem {
        PurchaseBillItem.init(
            {
                id: {
                    type: DataTypes.UUID,
                    defaultValue: DataTypes.UUIDV4,
                    primaryKey: true,
                },
                purchaseBillId: {
                    type: DataTypes.UUID,
                    allowNull: false,
                    references: {
                        model: 'purchase_bill',
                        key: 'id',
                    },
                    onDelete: 'CASCADE',
                },
                itemId: {
                    type: DataTypes.UUID,
                    allowNull: false,
                    references: {
                        model: 'item',
                        key: 'id',
                    },
                },
                itemName: {
                    type: DataTypes.STRING(255),
                    allowNull: false,
                    comment: 'Item name snapshot from Item table',
                },
                description: {
                    type: DataTypes.TEXT,
                    allowNull: true,
                    comment: 'Item description snapshot from Item table',
                },
                hsn: {
                    type: DataTypes.STRING(20),
                    allowNull: true,
                    comment: 'HSN code snapshot for products',
                },
                sac: {
                    type: DataTypes.STRING(20),
                    allowNull: true,
                    comment: 'SAC code snapshot for services',
                },
                unitId: {
                    type: DataTypes.UUID,
                    allowNull: true,
                    references: {
                        model: 'unit',
                        key: 'id',
                    },
                    comment: 'Unit reference snapshot from Item table',
                },
                tax: {
                    type: DataTypes.DECIMAL(5, 2),
                    allowNull: true,
                    comment: 'Tax percentage snapshot at time of purchase bill',
                },
                cessPercentage: {
                    type: DataTypes.DECIMAL(5, 2),
                    allowNull: true,
                    comment: 'Cess percentage snapshot at time of purchase bill',
                },
                quantity: {
                    type: DataTypes.DECIMAL(10, 2),
                    allowNull: false,
                    comment: 'Quantity ordered in this purchase bill',
                },
                unitPrice: {
                    type: DataTypes.DECIMAL(10, 2),
                    allowNull: false,
                    comment: 'Price at the time of purchase bill creation',
                },
                discount: {
                    type: DataTypes.DECIMAL(10, 2),
                    allowNull: true,
                    defaultValue: 0,
                    comment: 'Item-specific discount for this purchase bill',
                },                taxable: {
                    type: DataTypes.DECIMAL(12, 2),
                    allowNull: true,
                    comment: 'Taxable amount after discount but before tax',
                },                taxAmount: {
                    type: DataTypes.DECIMAL(10, 2),
                    allowNull: true,
                    comment: 'Calculated tax amount for this line item',
                },
                totalAmount: {
                    type: DataTypes.DECIMAL(12, 2),
                    allowNull: false,
                    comment: 'Total amount for this line item',
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
                modelName: "purchase_bill_item",
                tableName: "purchase_bill_item",
                timestamps: true,
                indexes: [
                    {
                        fields: ['purchaseBillId'],
                    },
                    {
                        fields: ['itemId'],
                    },
                    {
                        fields: ['purchaseBillId', 'itemId'],
                        unique: true,
                    },
                ],
            }
        );
        return PurchaseBillItem;
    }
}

import {
    CreationOptional,
    DataTypes,
    InferCreationAttributes,
    InferAttributes,
    Model,
    Sequelize,
} from "sequelize";
import { Op } from "sequelize";
export class Item extends Model<
    InferAttributes<Item>,
    InferCreationAttributes<Item>
> {
    declare id: CreationOptional<string>;
    declare companyId: string;
    declare itemType: 'product' | 'service';
    declare itemName: string;
    declare description: string | null;
    declare quantity: number | null; // For products only
    declare unitId: string | null; // Foreign key to Unit table
    declare tax: number | null; // Tax percentage
    declare hsn: string | null; // For products (Harmonized System of Nomenclature)
    declare sac: string | null; // For services (Service Accounting Code)
    declare sku: string | null; // Stock Keeping Unit
    declare unitPrice: number;
    declare currency: string;
    declare cessPercentage: number | null; // Cess percentage
    declare isActive: boolean;
    declare isDeleted: boolean;
    declare createdAt: CreationOptional<Date>;
    declare updatedAt: CreationOptional<Date>;

    static initModel(sequelize: Sequelize): typeof Item {
        Item.init(
            {
                id: {
                    type: DataTypes.UUID,
                    defaultValue: DataTypes.UUIDV4,
                    primaryKey: true,
                },
                companyId: {
                    type: DataTypes.UUID,
                    allowNull: false,
                },
                itemType: {
                    type: DataTypes.ENUM('product', 'service'),
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
                quantity: {
                    type: DataTypes.DECIMAL(10, 2),
                    allowNull: true,
                    comment: 'Quantity applicable for products only',
                },
                unitId: {
                    type: DataTypes.UUID,
                    allowNull: true,
                    references: {
                        model: 'unit',
                        key: 'id',
                    },
                },
                tax: {
                    type: DataTypes.DECIMAL(5, 2),
                    allowNull: true,
                    comment: 'Tax percentage (e.g., 18 for 18%)',
                },
                hsn: {
                    type: DataTypes.STRING(20),
                    allowNull: true,
                    comment: 'Harmonized System of Nomenclature code for products',
                },
                sac: {
                    type: DataTypes.STRING(20),
                    allowNull: true,
                    comment: 'Service Accounting Code for services',
                },
                sku: {
                    type: DataTypes.STRING(100),
                    allowNull: true,
                    comment: 'Stock Keeping Unit',
                },
                unitPrice: {
                    type: DataTypes.DECIMAL(10, 2),
                    allowNull: false,
                },
                currency: {
                    type: DataTypes.STRING(10),
                    allowNull: false,
                    defaultValue: 'INR',
                },
                cessPercentage: {
                    type: DataTypes.DECIMAL(5, 2),
                    allowNull: true,
                    comment: 'Cess percentage',
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
                tableName: "item",
                timestamps: true,
                indexes: [
                    {
                        fields: ['companyId', 'itemType'],
                    },
                    {
                        fields: ['companyId', 'isActive', 'isDeleted'],
                    },
                    {
                        fields: ['sku'],
                        unique: true,
                        where: {
                            sku: { [Op.ne]: null }
                        }
                    }
                ],
            }
        );
        return Item;
    }
}

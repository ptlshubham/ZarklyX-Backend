import {
    CreationOptional,
    DataTypes,
    InferCreationAttributes,
    InferAttributes,
    Model,
    Sequelize,
} from "sequelize";
import { Op } from "sequelize";
export class PurchaseBill extends Model<
    InferAttributes<PurchaseBill>,
    InferCreationAttributes<PurchaseBill>
> {
    declare id: CreationOptional<string>;
    declare companyId: string; // Foreign key to Company table
    declare vendorId: string; // Foreign key to Vendor table
    declare purchaseBillNumber: string
    declare placeOfSupply: string;
    declare invoiceNo: string;
    declare billDate: CreationOptional<Date>;
    declare status: string;
    declare poNo: string;
    declare poDate: CreationOptional<Date>;
    declare dueDate: CreationOptional<Date>;
    declare finalDiscount: number | null;
    declare unitId: string | null; // Foreign key to Unit table
    declare totalQuantity: number | null;
    declare shippingChargeType: string | null; // "road" | "rail" | "air" | "ship"
    declare shippingAmount: number | null;
    declare shippingTax: number | null;
    declare addDiscountToAll: number | null;
    declare showCess: boolean;
    declare cessValue: number | null;
    declare reverseCharge: boolean;
    declare termsConditions: string | null;
    declare privateNotes: string | null;
    declare subTotal: number | null;
    declare taxable: number | null; // Total taxable amount (after discounts, before taxes)
    declare cgst: number | null; // Tax percentage
    declare sgst: number | null; // Tax percentage
    declare igst: number | null; // Tax percentage
    declare total: number;
    declare balance: number;
    declare isActive: boolean;
    declare isDeleted: boolean;
    declare createdAt: CreationOptional<Date>;
    declare updatedAt: CreationOptional<Date>;

    static initModel(sequelize: Sequelize): typeof PurchaseBill {
        PurchaseBill.init(
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
                vendorId: {
                    type: DataTypes.UUID,
                    allowNull: false,
                },
                purchaseBillNumber: {
                    type: DataTypes.STRING,
                    allowNull: false,
                },
                placeOfSupply: {
                    type: DataTypes.STRING(100),
                    allowNull: false,
                },
                invoiceNo: {
                    type: DataTypes.STRING(100),
                    allowNull: false,
                },
                billDate: {
                    type: DataTypes.DATE,
                    allowNull: false,
                    defaultValue: DataTypes.NOW,
                },
                status: {
                    type: DataTypes.ENUM('Draft', 'Closed', 'Partially Paid', 'Open', 'Overdue', 'Cancelled'),
                    allowNull: true,
                    defaultValue: 'Open',
                },
                poNo: {
                    type: DataTypes.STRING(100),
                    allowNull: false,
                },
                poDate: {
                    type: DataTypes.DATE,
                    allowNull: false,
                },
                dueDate: {
                    type: DataTypes.DATE,
                    allowNull: false,
                },
                finalDiscount: {
                    type: DataTypes.DECIMAL(10, 2),
                    allowNull: true,
                },
                unitId: {
                    type: DataTypes.UUID,
                    allowNull: true,
                },
                totalQuantity: {
                    type: DataTypes.DECIMAL(10, 2),
                    allowNull: true,
                },
                shippingChargeType: {
                    type: DataTypes.ENUM('road', 'rail', 'air', 'ship'),
                    allowNull: true,
                },
                shippingAmount: {
                    type: DataTypes.DECIMAL(10, 2),
                    allowNull: true,
                },
                shippingTax: {
                    type: DataTypes.DECIMAL(10, 2),
                    allowNull: true,
                },
                addDiscountToAll: {
                    type: DataTypes.DECIMAL(10, 2),
                    allowNull: true,
                },
                showCess: {
                    type: DataTypes.BOOLEAN,
                    allowNull: false,
                    defaultValue: false,
                },
                cessValue: {
                    type: DataTypes.DECIMAL(10, 2),
                    allowNull: true,
                },
                reverseCharge: {
                    type: DataTypes.BOOLEAN,
                    allowNull: false,
                    defaultValue: false,
                },
                termsConditions: {
                    type: DataTypes.TEXT,
                    allowNull: true,
                },
                privateNotes: {
                    type: DataTypes.TEXT,
                    allowNull: true,
                },
                subTotal: {
                    type: DataTypes.DECIMAL(12, 2),
                    allowNull: true,
                },                
                taxable: {
                    type: DataTypes.DECIMAL(12, 2),
                    allowNull: true,
                    comment: 'Total taxable amount after discounts but before taxes',
                },                
                cgst: {
                    type: DataTypes.DECIMAL(10, 2),
                    allowNull: true,
                },
                sgst: {
                    type: DataTypes.DECIMAL(10, 2),
                    allowNull: true,
                },
                igst: {
                    type: DataTypes.DECIMAL(10, 2),
                    allowNull: true,
                },
                total: {
                    type: DataTypes.DECIMAL(12, 2),
                    allowNull: false,
                    defaultValue: 0,
                },
                balance: {
                    type: DataTypes.DECIMAL(12,2),
                    allowNull: false,
                    defaultValue: 0,
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
                modelName: "purchase_bill",
                tableName: "purchase_bill",
                timestamps: true,
                indexes: [
                    {
                        fields: ['companyId'],
                    },
                    {
                        fields: ['vendorId'],
                    },
                    {
                        fields: ['invoiceNo', 'companyId'],
                        unique: true,
                    },
                    {
                        fields: ['billDate'],
                    },
                ],
            }
        );
        return PurchaseBill;
    }
}

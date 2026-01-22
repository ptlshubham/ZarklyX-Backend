import {
    CreationOptional,
    DataTypes,
    InferCreationAttributes,
    InferAttributes,
    Model,
    Sequelize,
} from "sequelize";
import { Op } from "sequelize";
export class DebitNote extends Model<
    InferAttributes<DebitNote>,
    InferCreationAttributes<DebitNote>
> {
    declare id: CreationOptional<string>;
    declare companyId: string; // Foreign key to Company table
    declare clientId: string | null; // Foreign key to Client table (for invoice-based debit notes)
    declare vendorId: string | null; // Foreign key to Vendor table (for purchase bill-based debit notes)
    declare placeOfSupply: string; 
    declare debitNo: string;
    declare invoiceId: string | null; // Foreign key to Invoice table (when clientId is present)
    declare invoiceDate: CreationOptional<Date>;
    declare purchaseBillId: string | null; // Foreign key to Purchase bill table (when vendorId is present)
    declare billInvoiceNo: string | null;
    declare debitDate: CreationOptional<Date>;
    declare reason: string;
    
    declare finalDiscount: number | null;
    declare unitId: string | null; // Foreign key to Unit table
    declare unitQuantity: number | null;
    declare shippingChargeType: string | null; // "road" | "rail" | "air" | "ship"
    declare shippingAmount: number | null;
    declare shippingTax: number | null;
    declare addDiscountToAll: number | null;
    declare showCess: boolean;
    declare cessValue: number | null;
    declare notes: string | null;
    declare privateNotes: string | null;
    declare subTotal: number | null;
    declare taxable: number | null; // Total taxable amount (after discounts, before taxes)
    declare cgst: number | null; // Tax percentage
    declare sgst: number | null; // Tax percentage
    declare igst: number | null; // Tax percentage
    declare total: number; // Tax percentage
    declare status: string 
    declare isActive: boolean;
    declare isDeleted: boolean;
    declare createdAt: CreationOptional<Date>;
    declare updatedAt: CreationOptional<Date>;

    static initModel(sequelize: Sequelize): typeof DebitNote {
        DebitNote.init(
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
                clientId: {
                    type: DataTypes.UUID,
                    allowNull: true,
                },
                vendorId: {
                    type: DataTypes.UUID,
                    allowNull: true,
                },
                placeOfSupply: {
                    type: DataTypes.STRING(100),
                    allowNull: false,
                },
                debitNo: {
                    type: DataTypes.STRING(100),
                    allowNull: false,
                },
                invoiceId: {
                    type: DataTypes.UUID,
                    allowNull: true,
                },
                invoiceDate: {
                    type: DataTypes.DATE,
                    allowNull: false,
                    defaultValue: DataTypes.NOW,
                },
                purchaseBillId: {
                    type: DataTypes.UUID,
                    allowNull: true,
                },
                billInvoiceNo: {
                    type: DataTypes.STRING(100),
                    allowNull: true,
                },
                debitDate: {
                    type: DataTypes.DATE,
                    allowNull: false,
                    defaultValue: DataTypes.NOW,
                },
                reason: {
                    type: DataTypes.STRING,
                    allowNull: false
                },
                finalDiscount: {
                    type: DataTypes.DECIMAL(10, 2),
                    allowNull: true,
                },
                unitId: {
                    type: DataTypes.UUID,
                    allowNull: true,
                },
                unitQuantity: {
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
                    type: DataTypes.DECIMAL(5, 2),
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
                notes: {
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
                status: {
                    type: DataTypes.ENUM('Unpaid', 'Paid'),
                    allowNull: true,
                    defaultValue: "Unpaid"
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
                modelName: "DebitNote",
                tableName: "debit_note",
                timestamps: true,
                indexes: [
                    {
                        fields: ['companyId'],
                    },
                    {
                        fields: ['clientId'],
                    },
                    {
                        fields: ['vendorId'],
                    },
                    {
                        fields: ['purchaseBillId'],
                    },
                    {
                        fields: ['debitNo', 'companyId'],
                        unique: true,
                    },
                    {
                        fields: ['debitDate'],
                    },
                    {
                        fields: ['invoiceDate'],
                    }
                ],
            }
        );
        return DebitNote;
    }
}

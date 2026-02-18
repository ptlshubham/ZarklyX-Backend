export type TaxSelection = "ship to" | "bill to";

export type QuoteStatus = 'Draft' | 'Open' | 'Converted' | 'Expired' | 'Cancelled';

import {
    CreationOptional,
    DataTypes,
    InferCreationAttributes,
    InferAttributes,
    Model,
    Sequelize,
} from "sequelize";
import { Op } from "sequelize";
export class Quote extends Model<
    InferAttributes<Quote>,
    InferCreationAttributes<Quote>
> {
    declare id: CreationOptional<string>;
    declare companyId: string; // Foreign key to Company table
    declare clientId: string; // Foreign key to Client table
    declare taxSelectionOn: TaxSelection; // "ship to" | "bill to"
    declare placeOfSupply: string; 
    declare quotationNo: string;
    declare quotationDate: CreationOptional<Date>;
    declare poNo: string;
    declare validUntilDate: CreationOptional<Date>;
    declare status: QuoteStatus;
    declare finalDiscount: number | null;
    declare unitId: string | null; // Foreign key to Unit table
    declare totalQuantity: number | null;
    declare shippingChargeType: string | null; // "road" | "rail" | "air" | "ship"
    declare shippingAmount: number | null;
    declare shippingTax: number | null;
    declare addDiscountTotal: number | null;
    declare addDiscountToAll: number | null;
    declare customAmountLabel: string | null;
    declare customAmount: number | null;
    declare showCess: boolean;
    declare cessValue: number | null;
    declare termsConditions: string | null;
    declare privateNotes: string | null;
    declare subTotal: number | null;
    declare taxable: number | null; // Total taxable amount (after discounts, before taxes)
    declare cgst: number | null; // Tax percentage
    declare sgst: number | null; // Tax percentage
    declare igst: number | null; // Tax percentage
    declare total: number; // Tax percentage
    declare isActive: boolean;
    declare isDeleted: boolean;
    declare lastReminderSentAt: CreationOptional<Date> | null;
    declare publicToken: string | null;
    declare createdAt: CreationOptional<Date>;
    declare updatedAt: CreationOptional<Date>;

    static initModel(sequelize: Sequelize): typeof Quote {
        Quote.init(
            {
                id: {
                    type: DataTypes.UUID,
                    defaultValue: DataTypes.UUIDV4,
                    primaryKey: true,
                },
                publicToken: {
                    type: DataTypes.STRING(64),
                    allowNull: true,
                    
                },
                companyId: {
                    type: DataTypes.UUID,
                    allowNull: false,
                },
                clientId: {
                    type: DataTypes.UUID,
                    allowNull: false,
                },
                taxSelectionOn: {
                    type: DataTypes.ENUM('ship to', 'bill to'),
                    allowNull: false,
                },
                placeOfSupply: {
                    type: DataTypes.STRING(100),
                    allowNull: false,
                },
                quotationNo: {
                    type: DataTypes.STRING(100),
                    allowNull: false,
                },
                quotationDate: {
                    type: DataTypes.DATE,
                    allowNull: false,
                    defaultValue: DataTypes.NOW,
                },
                poNo: {
                    type: DataTypes.STRING(100),
                    allowNull: true,
                },
                validUntilDate: {
                    type: DataTypes.DATE,
                    allowNull: false,
                    defaultValue: DataTypes.NOW,
                },
                status: {
                    type: DataTypes.ENUM('Draft','Open','Converted','Expired','Cancelled'),
                    allowNull: false,
                    defaultValue: 'Open'
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
                    type: DataTypes.DECIMAL(5, 2),
                    allowNull: true,
                },
                addDiscountTotal: {
                    type: DataTypes.DECIMAL(10, 2),
                    allowNull: true,
                },
                addDiscountToAll: {
                    type: DataTypes.DECIMAL(10, 2),
                    allowNull: true,
                },
                customAmountLabel: {
                    type: DataTypes.STRING(100),
                    allowNull: true,
                },
                customAmount: {
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
                },                taxable: {
                    type: DataTypes.DECIMAL(12, 2),
                    allowNull: true,
                    comment: 'Total taxable amount after discounts but before taxes',
                },                cgst: {
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
                lastReminderSentAt: {
                    type: DataTypes.DATE,
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
            },
            {
                sequelize,
                modelName: "quote",
                tableName: "quote",
                timestamps: true,
                indexes: [
                    {
                        fields: ['companyId'],
                    },
                    {
                        fields: ['clientId'],
                    },
                    {
                        fields: ['quotationNo', 'companyId'],
                        unique: true,
                    },
                    {
                        fields: ['quotationDate'],
                    },
                ],
            }
        );
        return Quote;
    }
}

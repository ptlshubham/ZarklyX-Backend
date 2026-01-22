export type PaymentMethod =
  | "Cash"
  | "Cash Memo"
  | "TDS"
  | "TCS"
  | "Credit Card"
  | "Cheque"
  | "Bank Transfer"
  | "Pay Slip"
  | "Credit Note"
  | "Payment Gateway"
  | "UPI"
  | "QR Code"
  | "Other";


import {
    CreationOptional,
    DataTypes,
    InferCreationAttributes,
    InferAttributes,
    Model,
    Sequelize,
} from "sequelize";
import { Op } from "sequelize";
export class Expenses extends Model<
    InferAttributes<Expenses>,
    InferCreationAttributes<Expenses>
> {
    declare id: CreationOptional<string>;
    declare companyId: string; // Foreign key to Company table
    declare vendorId: string | null; // Foreign key to Vendor table
    declare placeOfSupply: string; 
    declare expenseNo: string;
    declare expenseDate: CreationOptional<Date>;
    declare clientId: string | null;
    declare paymentMethod: PaymentMethod;
    declare reverseCharge: boolean;
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
    declare createdAt: CreationOptional<Date>;
    declare updatedAt: CreationOptional<Date>;

    static initModel(sequelize: Sequelize): typeof Expenses {
        Expenses.init(
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
                placeOfSupply: {
                    type: DataTypes.STRING(100),
                    allowNull: false,
                },
                expenseNo: {
                    type: DataTypes.STRING(100),
                    allowNull: false,
                },
                expenseDate: {
                    type: DataTypes.DATE,
                    allowNull: false,
                    defaultValue: DataTypes.NOW,
                },
                clientId: {
                    type: DataTypes.UUID,
                    allowNull: false,
                    references: {
                        model: 'client',
                        key: 'id',
                    },
                    onDelete: 'CASCADE',
                },
                paymentMethod: {
                    type: DataTypes.ENUM(
                        "Cash",
                        "Cash Memo",
                        "TDS",
                        "TCS",
                        "Credit Card",
                        "Cheque",
                        "Bank Transfer",
                        "Pay Slip",
                        "Credit Note",
                        "Payment Gateway",
                        "UPI",
                        "QR Code",
                        "Other"
                    ),
                    allowNull: false,
                },
                reverseCharge: {
                    type: DataTypes.BOOLEAN,
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
                modelName: "expenses",
                tableName: "expenses",
                timestamps: true,
                indexes: [
                    {
                        fields: ['companyId'],
                    },
                    {
                        fields: ['vendorId'],
                    },
                    {
                        fields: ['clientId'],
                    },
                    {
                        fields: ['expenseNo', 'companyId'],
                        unique: true,
                    },
                    {
                        fields: ['expenseDate'],
                    },
                ],
            }
        );
        return Expenses;
    }
}

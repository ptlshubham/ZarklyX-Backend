import {
    CreationOptional,
    DataTypes,
    InferCreationAttributes,
    InferAttributes,
    Model,
    Sequelize,
} from "sequelize";
import { Op } from "sequelize";

export type InvoiceStatus =
  | "Draft"
  | "Unpaid"
  | "Partially Paid"
  | "Paid"
  | "Overdue"
  | "Cancelled";

export type TaxSelection = "ship to" | "bill to";

export type PaymentTerms =
  | "specific date"
  | "hide payment terms"
  | "NET 7"
  | "NET 10"
  | "NET 15"
  | "NET 30"
  | "NET 45"
  | "NET 60";

export class Invoice extends Model<
    InferAttributes<Invoice>,
    InferCreationAttributes<Invoice>
> {
    declare id: CreationOptional<string>;
    declare companyId: string; // Foreign key to Company table
    declare invoiceType: "tax Invoice" | "bill Of Supply";
    declare clientId: string; // Foreign key to Client table
    declare taxSelectionOn: TaxSelection;
    declare placeOfSupply: string; 
    declare invoiceNo: string;
    declare invoiceDate: CreationOptional<Date>;
    declare poNo: string;
    declare poDate: CreationOptional<Date>;
    declare dueDate: CreationOptional<Date>;
    declare status: InvoiceStatus;
    declare paymentTerms: PaymentTerms; //used to decide the dueDate
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
    declare reverseCharge: boolean;
    declare eWayBillNo: string | null;
    declare dispatchFrom: string | null;
    declare lrNo: string | null;
    declare challanNo: string | null;
    declare vehicleNo: string | null;
    declare transportMode: string | null; // "road" | "rail" | "air" | "ship"
    declare transactionType: string | null;
    declare shippingDistanceInKm: number | null;
    declare transporterName: string | null;
    declare transporterId: number | null;
    declare transporterGstin: string | null;
    declare transporterDocDate: CreationOptional<Date> | null;
    declare transporterDocNo: number | null;
    declare termsConditions: string | null;
    declare privateNotes: string | null;
    declare subTotal: number | null;
    declare taxable: number | null; // Total taxable amount (after discounts, before taxes)
    declare cgst: number | null; // Tax percentage
    declare sgst: number | null; // Tax percentage
    declare igst: number | null; // Tax percentage
    declare total: number; // Tax percentage
    declare balance: number // remaining balance after paying
    declare publicToken: string | null;
    declare isActive: boolean;
    declare isDeleted: boolean;
    declare lastReminderType : string | null;
    declare lastDueReminderSentAt: CreationOptional<Date>;
    declare createdAt: CreationOptional<Date>;
    declare updatedAt: CreationOptional<Date>;

    static initModel(sequelize: Sequelize): typeof Invoice {
        Invoice.init(
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
                invoiceType: {
                    type: DataTypes.ENUM('tax Invoice', 'bill Of Supply'),
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
                invoiceNo: {
                    type: DataTypes.STRING(100),
                    allowNull: false,
                },
                invoiceDate: {
                    type: DataTypes.DATE,
                    allowNull: false,
                    defaultValue: DataTypes.NOW,
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
                status: {
                    type: DataTypes.ENUM('Draft','Paid','Partially Paid','Unpaid','Overdue','Cancelled'),
                    allowNull: false,
                    defaultValue: 'Unpaid'
                },
                paymentTerms: {
                    type: DataTypes.STRING(255),
                    allowNull: false,
                },
                finalDiscount: {
                    type: DataTypes.DECIMAL(12, 2),
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
                reverseCharge: {
                    type: DataTypes.BOOLEAN,
                    allowNull: false,
                    defaultValue: false,
                },
                eWayBillNo: {
                    type: DataTypes.STRING(100),
                    allowNull: true,
                },
                dispatchFrom: {
                    type: DataTypes.STRING(255),
                    allowNull: true,
                },
                lrNo: {
                    type: DataTypes.STRING(100),
                    allowNull: true,
                },
                challanNo: {
                    type: DataTypes.STRING(100),
                    allowNull: true,
                },
                vehicleNo: {
                    type: DataTypes.STRING(50),
                    allowNull: true,
                },
                transportMode: {
                    type: DataTypes.ENUM('road', 'rail', 'air', 'ship'),
                    allowNull: true,
                },
                transactionType: {
                    type: DataTypes.STRING(100),
                    allowNull: true,
                },
                shippingDistanceInKm: {
                    type: DataTypes.DECIMAL(10, 2),
                    allowNull: true,
                },
                transporterName: {
                    type: DataTypes.STRING(255),
                    allowNull: true,
                },
                transporterId: {
                    type: DataTypes.INTEGER,
                    allowNull: true,
                },
                transporterGstin: {
                    type: DataTypes.STRING(15),
                    allowNull: true,
                },
                transporterDocDate: {
                    type: DataTypes.DATE,
                    allowNull: true,
                },
                transporterDocNo: {
                    type: DataTypes.INTEGER,
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
                balance: {
                    type: DataTypes.DECIMAL(12,2),
                    allowNull: false,
                    defaultValue: 0,
                },
                publicToken: {
                    type: DataTypes.STRING,
                    allowNull: true,
                    unique: true,
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
                lastReminderType: {
                    type: DataTypes.ENUM('BEFORE_3_DAYS','BEFORE_1_DAYS','OVERDUE'),
                    allowNull: true,
                },
                lastDueReminderSentAt: {
                    type: DataTypes.DATE,
                    allowNull: true
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
                modelName: "Invoice",
                tableName: "invoice",
                timestamps: true,
                indexes: [
                    {
                        fields: ['companyId'],
                    },
                    {
                        fields: ['clientId'],
                    },
                    {
                        fields: ['invoiceNo', 'companyId'],
                        unique: true,
                    },
                    {
                        fields: ['invoiceDate'],
                    },
                ],
            }
        );
        return Invoice;
    }
}

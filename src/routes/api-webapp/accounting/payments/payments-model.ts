import {
    CreationOptional,
    DataTypes,
    InferCreationAttributes,
    InferAttributes,
    Model,
    Sequelize,
} from "sequelize";

export type PaymentType = "Payment Made" | "Payment Received" | "Advance Payment Received" | "Advance Payment Made";

export type PaymentMethod = "Cash" | "Cash Memo" | "TDS" | "TCS" | "Credit Card" | "Cheque" | "Bank Transfer" | "Pay Slip" | "Credit Note" | "Payment Gateway" | "UPI" | "QR Code" | "Other";

export type PaymentStatus = "Active" | "Deleted" | "Reconciled" | "Pending";

export class Payments extends Model<
    InferAttributes<Payments>,
    InferCreationAttributes<Payments>
> {
    declare id: CreationOptional<string>;
    declare companyId: string;
    declare paymentType: PaymentType;
    declare clientId: string | null;
    declare vendorId: string | null;
    declare paymentNo: string;
    declare paymentAmount: number;
    declare paymentDate: CreationOptional<Date>;
    declare method: PaymentMethod;
    declare referenceNo: string | null;
    declare bankCharges: number | null;
    declare memo: string | null;
    declare status: PaymentStatus;
    declare isActive: boolean;
    declare isDeleted: boolean;
    declare createdAt: CreationOptional<Date>;
    declare updatedAt: CreationOptional<Date>;
    // Summary fields
    declare amountReceived: number | null;
    declare amountUsedForPayments: number | null;
    declare amountInExcess: number | null;

    static initModel(sequelize: Sequelize): typeof Payments {
        Payments.init(
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
                paymentType: {
                    type: DataTypes.ENUM('Payment Made', 'Payment Received', 'Advance Payment Received', 'Advance Payment Made'),
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
                paymentNo: {
                    type: DataTypes.STRING,
                    allowNull: false,
                },
                paymentAmount: {
                    type: DataTypes.DECIMAL(18,2),
                    allowNull: false,
                },
                paymentDate: {
                    type: DataTypes.DATE,
                    defaultValue: DataTypes.NOW,
                },
                method: {
                    type: DataTypes.ENUM('Cash', 'Cash Memo', 'TDS', 'TCS', 'Credit Card', 'Cheque', 'Bank Transfer', 'Pay Slip', 'Credit Note', 'Payment Gateway', 'UPI', 'QR Code', 'Other'),
                    allowNull: false,
                },
                referenceNo: {
                    type: DataTypes.STRING,
                    allowNull: true,
                },
                bankCharges: {
                    type: DataTypes.DECIMAL(18,2),
                    allowNull: true,
                },
                memo: {
                    type: DataTypes.TEXT,
                    allowNull: true,
                },
                status: {
                    type: DataTypes.ENUM('Active', 'Deleted', 'Reconciled', 'Pending'),
                    defaultValue: 'Active',
                },
                isActive: {
                    type: DataTypes.BOOLEAN,
                    defaultValue: true,
                },
                isDeleted: {
                    type: DataTypes.BOOLEAN,
                    defaultValue: false,
                },
                createdAt: {
                    type: DataTypes.DATE,
                    defaultValue: DataTypes.NOW,
                },
                updatedAt: {
                    type: DataTypes.DATE,
                    defaultValue: DataTypes.NOW,
                },
                amountReceived: {
                    type: DataTypes.DECIMAL(18,2),
                    allowNull: true,
                },
                amountUsedForPayments: {
                    type: DataTypes.DECIMAL(18,2),
                    allowNull: true,
                },
                amountInExcess: {
                    type: DataTypes.DECIMAL(18,2),
                    allowNull: true,
                },
            },
            {
                sequelize,
                tableName: "Payments",
                timestamps: true,
            }
        );
        return Payments;
    }

    // Helper method to format payment for receipt
    static formatForReceipt(payment: any, documents: any[]) {
        return {
            id: payment.id,
            paymentNo: payment.paymentNo,
            paymentDate: payment.paymentDate,
            paymentType: payment.paymentType,
            method: payment.method,
            referenceNo: payment.referenceNo,
            bankCharges: payment.bankCharges,
            memo: payment.memo,
            amountReceived: payment.amountReceived,
            amountUsedForPayments: payment.amountUsedForPayments,
            amountInExcess: payment.amountInExcess,
            documents: documents,
        };
    }
}

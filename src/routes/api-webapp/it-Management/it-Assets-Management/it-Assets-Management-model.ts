import {
    CreationOptional,
    DataTypes,
    InferAttributes,
    InferCreationAttributes,
    Model,
    Sequelize,
} from "sequelize";
export class ItAssetsManagement extends Model<
    InferAttributes<ItAssetsManagement>,
    InferCreationAttributes<ItAssetsManagement>
> {
    declare id: CreationOptional<string>;
    declare companyId: string;
    declare clientId: string | null;
    declare assetType: string;
    declare assetName: string;
    declare categoryId: string;
    declare purchaseDate: Date;
    declare startDate: Date;
    declare endDate: Date;
    declare warrantyStartDate: Date;
    declare warrantyEndDate: Date;
    declare renewalReminderDate: Date;
    declare paymentMode: string;
    declare paymentStatus: string;
    declare purchasedBy: string;
    declare paidBy: string;
    declare isClientPaymentReceived: boolean;
    declare price: number;
    declare quantity: number;
    declare totalAmount: number | null;
    declare currencyCode: string;
    declare lastReminderSentAt: Date;
    declare isRenewalReminderSent: boolean;
    declare isDeleted: boolean;
    declare createdAt: CreationOptional<Date>;
    declare updatedAt: CreationOptional<Date>;

    static initModel(sequelize: Sequelize): typeof ItAssetsManagement {
        ItAssetsManagement.init(
            {
                id: {
                    type: DataTypes.UUID,
                    defaultValue: DataTypes.UUIDV4,
                    primaryKey: true,
                    allowNull: false,
                    unique: true,
                },
                companyId: {
                    type: DataTypes.UUID,
                    allowNull: false,
                },
                clientId: {
                    type: DataTypes.UUID,
                    allowNull: true,
                    defaultValue: null,
                },
                assetType: {
                    type: DataTypes.ENUM("Product", "Service"),
                    allowNull: false,
                },
                assetName: {
                    type: DataTypes.STRING(255),
                    allowNull: false,
                },
                categoryId: {
                    type: DataTypes.UUID,
                    allowNull: false,
                    references: {
                        model: "itemCategory",
                        key: "id",
                    },
                },
                purchaseDate: {
                    type: DataTypes.DATE,
                    allowNull: true,
                },
                startDate: {
                    type: DataTypes.DATE,
                    allowNull: true,
                },
                endDate: {
                    type: DataTypes.DATE,
                    allowNull: true,
                },
                warrantyStartDate: {
                    type: DataTypes.DATE,
                    allowNull: true,
                },
                warrantyEndDate: {
                    type: DataTypes.DATE,
                    allowNull: true,
                },
                renewalReminderDate: {
                    type: DataTypes.DATE,
                    allowNull: true,
                },
                paymentMode: {
                    type: DataTypes.ENUM("UPI", "Cash", "Card", "Cheque", "Net Banking", "RTGS", "Bank Transfer", "NEFT", "Other"),
                    allowNull: false,
                },
                paymentStatus: {
                    type: DataTypes.ENUM("Paid", "Pending"),
                    allowNull: false,
                },
                purchasedBy: {
                    type: DataTypes.ENUM("Company", "Client"),
                    allowNull: false,
                },
                paidBy: {
                    type: DataTypes.ENUM("Company", "Client"),
                    allowNull: false,
                },
                isClientPaymentReceived: {
                    type: DataTypes.BOOLEAN,
                    allowNull: false,
                    defaultValue: false,
                },
                currencyCode: {
                    type: DataTypes.STRING(3),
                    allowNull: false,
                    defaultValue: "INR",
                },
                price: {
                    type: DataTypes.DECIMAL(10, 2),
                    allowNull: false,
                    defaultValue: 0
                },
                quantity: {
                    type: DataTypes.INTEGER,
                    allowNull: true,
                    defaultValue: null
                },
                totalAmount: {
                    type: DataTypes.DECIMAL(12, 2),
                    allowNull: true,
                },
                lastReminderSentAt:
                {
                    type: DataTypes.DATE,
                    allowNull: true,
                    defaultValue: null,
                },
                isRenewalReminderSent:
                {
                    type: DataTypes.BOOLEAN,
                    allowNull: false,
                    defaultValue: false,
                },
                isDeleted: {
                    type: DataTypes.BOOLEAN,
                    allowNull: false,
                    defaultValue: false,
                },
                createdAt: {
                    type: DataTypes.DATE,
                    allowNull: false,
                },
                updatedAt: {
                    type: DataTypes.DATE,
                    allowNull: false,
                }
            },
            {
                sequelize,
                freezeTableName: true,
                tableName: "itAssetsManagement",
                timestamps: true
            }
        );
        return ItAssetsManagement;
    }
}
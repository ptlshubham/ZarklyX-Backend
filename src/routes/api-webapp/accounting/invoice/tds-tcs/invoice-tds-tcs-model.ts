import {
    CreationOptional,
    DataTypes,
    InferCreationAttributes,
    InferAttributes,
    Model,
    Sequelize,
} from "sequelize";

export class InvoiceTdsTcs extends Model<
    InferAttributes<InvoiceTdsTcs>,
    InferCreationAttributes<InvoiceTdsTcs>
> {
    declare id: CreationOptional<string>;      // PK
    declare companyId: string; // Foreign key to Company table
    declare invoiceId: string // Foreign key to Invoice table
    declare taxPercentage: number;
    declare type: string;
    declare taxName: string;
    declare applicableOn: CreationOptional<string>; // "taxable" or "total"
    declare taxAmount: CreationOptional<number>; // Calculated TDS/TCS amount
    declare createdAt: CreationOptional<Date>;
    declare updatedAt: CreationOptional<Date>;

    static initModel(sequelize: Sequelize): typeof InvoiceTdsTcs {
        InvoiceTdsTcs.init(
            {
                id: {
                    type: DataTypes.UUID,
                    defaultValue: DataTypes.UUIDV4,
                    primaryKey: true,
                },
                companyId: {
                    type: DataTypes.UUID,
                    allowNull: false,
                    references: {
                        model: 'company',
                        key: 'id',
                    },
                },
                invoiceId: {
                    type: DataTypes.UUID,
                    allowNull: false,
                    references: {
                        model: 'invoice',
                        key: 'id',
                    },
                },
                taxPercentage: {
                    type: DataTypes.DECIMAL(5, 2),
                    allowNull: true,
                    comment: 'Tax percentage (e.g., 18 for 18%)',
                },
                type: {
                    type: DataTypes.STRING(100),
                    allowNull: false,
                },
                taxName: {
                    type: DataTypes.STRING(100),
                    allowNull: false,
                },
                applicableOn: {
                    type: DataTypes.STRING(50),
                    allowNull: false,
                    defaultValue: 'total',
                    comment: 'Calculation base: "taxable" (subtotal) or "total" (total before TDS/TCS)',
                },
                taxAmount: {
                    type: DataTypes.DECIMAL(18, 2),
                    allowNull: true,
                    comment: 'Calculated TDS/TCS amount',
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
                modelName: "invoice_tds_tcs",
                tableName: "invoice_tds_tcs",
                timestamps: true,
            }
        );
        return InvoiceTdsTcs;
    }

}

import {
    CreationOptional,
    DataTypes,
    InferCreationAttributes,
    InferAttributes,
    Model,
    Sequelize,
} from "sequelize";

export class QuoteTdsTcs extends Model<
    InferAttributes<QuoteTdsTcs>,
    InferCreationAttributes<QuoteTdsTcs>
> {
    declare id: CreationOptional<string>;      // PK
    declare companyId: string; // Foreign key to Company table
    declare quoteId: string // Foreign key to Quote table
    declare taxPercentage: number;
    declare type: string;
    declare taxName: string;
    declare applicableOn: CreationOptional<string>; // "taxable" or "total"
    declare taxAmount: CreationOptional<number>; // Calculated TDS/TCS amount
    declare isActive: boolean;
    declare isDeleted: boolean;
    declare createdAt: CreationOptional<Date>;
    declare updatedAt: CreationOptional<Date>;

    static initModel(sequelize: Sequelize): typeof QuoteTdsTcs {
        QuoteTdsTcs.init(
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
                quoteId: {
                    type: DataTypes.UUID,
                    allowNull: false,
                    references: {
                        model: 'quote',
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
                isActive: {
                    type: DataTypes.BOOLEAN,
                    allowNull: true,
                    defaultValue: true,
                },
                isDeleted: {
                    type: DataTypes.BOOLEAN,
                    allowNull: true,
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
                modelName: "quote_tds_tcs",
                tableName: "quote_tds_tcs",
                timestamps: true,
            }
        );
        return QuoteTdsTcs;
    }

}

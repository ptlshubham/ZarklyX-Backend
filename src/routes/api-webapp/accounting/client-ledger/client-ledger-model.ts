import {
    CreationOptional,
    DataTypes,
    InferCreationAttributes,
    InferAttributes,
    Model,
    Sequelize,
} from "sequelize";

export type ReferenceType =
    | "opening_balance"
    | "invoice"
    | "payment"
    | "credit_note"
    | "debit_note";

export class ClientLedger extends Model<
    InferAttributes<ClientLedger>,
    InferCreationAttributes<ClientLedger>
> {
    declare id: CreationOptional<string>;
    declare clientId: string; // Foreign key to Client table
    declare companyId: string; // Foreign key to Company table
    declare referenceType: ReferenceType; // Type of transaction
    declare referenceId: string | null; // UUID of the source document (invoice, payment, etc.)
    declare documentNumber: string | null; // Invoice number, payment number, etc.
    declare transactionDate: Date; // Date of the transaction
    declare description: string; // Description of the transaction
    declare debit: number; // Amount client owes (invoice, debit note)
    declare credit: number; // Amount client paid or credited (payment, credit note)
    declare createdAt: CreationOptional<Date>;
    declare updatedAt: CreationOptional<Date>;

    static initModel(sequelize: Sequelize): typeof ClientLedger {
        ClientLedger.init(
            {
                id: {
                    type: DataTypes.UUID,
                    defaultValue: DataTypes.UUIDV4,
                    primaryKey: true,
                },
                clientId: {
                    type: DataTypes.UUID,
                    allowNull: false,
                },
                companyId: {
                    type: DataTypes.UUID,
                    allowNull: false,
                },
                referenceType: {
                    type: DataTypes.ENUM(
                        "opening_balance",
                        "invoice",
                        "payment",
                        "credit_note",
                        "debit_note"
                    ),
                    allowNull: false,
                },
                referenceId: {
                    type: DataTypes.UUID,
                    allowNull: true,
                },
                documentNumber: {
                    type: DataTypes.STRING(100),
                    allowNull: true,
                },
                transactionDate: {
                    type: DataTypes.DATE,
                    allowNull: false,
                },
                description: {
                    type: DataTypes.TEXT,
                    allowNull: false,
                },
                debit: {
                    type: DataTypes.DECIMAL(18, 2),
                    defaultValue: 0,
                    allowNull: false,
                },
                credit: {
                    type: DataTypes.DECIMAL(18, 2),
                    defaultValue: 0,
                    allowNull: false,
                },
                createdAt: {
                    type: DataTypes.DATE,
                    defaultValue: DataTypes.NOW,
                },
                updatedAt: {
                    type: DataTypes.DATE,
                    defaultValue: DataTypes.NOW,
                },
            },
            {
                sequelize,
                tableName: "client_ledger",
                timestamps: true,
                indexes: [
                    {
                        name: "idx_client_ledger_client_date",
                        fields: ["clientId", "transactionDate"],
                    },
                    {
                        name: "idx_client_ledger_reference",
                        fields: ["referenceType", "referenceId"],
                    },
                    {
                        name: "idx_client_ledger_company",
                        fields: ["companyId"],
                    },
                ],
            }
        );

        return ClientLedger;
    }
}

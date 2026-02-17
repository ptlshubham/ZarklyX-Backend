import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  Sequelize,
} from "sequelize";

export type documentType =
  | "Invoice"
  | "Quote"
  | "PurchaseOrder"
  | "PurchaseBill"
  | "CreditNote"
  | "DebitNote"
  | "Payment"
  | "Expense";

export class AccountingDocument extends Model<
  InferAttributes<AccountingDocument>,
  InferCreationAttributes<AccountingDocument>
> {
  declare id: CreationOptional<string>;
  declare companyId: string;
  declare documentType: documentType;
  declare documentId: string;
  declare documentNo: string;
  declare fileName: string;
  declare filePath: string;
  declare fileUrl: string;
  declare fileSize: number | null;
  declare storageType: "LOCAL" | "S3";
  declare uploadedAt: CreationOptional<Date>;
  declare isActive: boolean;
  declare isDeleted: boolean;

  static initModel(sequelize: Sequelize): typeof AccountingDocument {
    AccountingDocument.init(
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
        documentType: {
          type: DataTypes.ENUM(
            "Invoice",
            "Quote",
            "PurchaseOrder",
            "PurchaseBill",
            "CreditNote",
            "DebitNote",
            "Payment",
            "Expense"
          ),
          allowNull: false,
        },
        documentId: {
          type: DataTypes.UUID,
          allowNull: false,
        },
        documentNo: {
          type: DataTypes.STRING(100),
          allowNull: false,
        },
        fileName: {
          type: DataTypes.STRING(255),
          allowNull: false,
        },
        filePath: {
          type: DataTypes.STRING(500),
          allowNull: false,
        },
        fileUrl: {
            type: DataTypes.STRING(500),
            allowNull: false,
        },
        fileSize: {
          type: DataTypes.BIGINT,
          allowNull: true,
        },
        storageType: {
          type: DataTypes.ENUM("LOCAL", "S3"),
          defaultValue: "LOCAL",
        },
        uploadedAt: {
          type: DataTypes.DATE,
          defaultValue: DataTypes.NOW,
        },
        isActive: {
          type: DataTypes.BOOLEAN,
          defaultValue: true,
        },
        isDeleted: {
          type: DataTypes.BOOLEAN,
          defaultValue: false,
        },
      },
      {
        sequelize,
        tableName: "accounting_documents",
        modelName: "AccountingDocument",
        timestamps: false,
        indexes: [
          { fields: ["companyId"] },
          { fields: ["documentType", "documentId"] },
        ],
      }
    );

    return AccountingDocument;
  }
}

import {
  CreationOptional,
  DataTypes,
  InferCreationAttributes,
  InferAttributes,
  Model,
  Sequelize,
} from "sequelize";

export type DocumentType = "Invoice" | "PurchaseBill" | "PurchaseOrder" | "Advance Payment Received" | "Advance Payment Made";

export class PaymentsDocuments extends Model<
  InferAttributes<PaymentsDocuments>,
  InferCreationAttributes<PaymentsDocuments>
> {
  declare id: CreationOptional<string>;
  declare paymentId: string;
  declare documentId: string;
  declare documentType: DocumentType;
  declare paymentValue: number;
  declare isActive: boolean;
  declare isDeleted: boolean;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  static initModel(sequelize: Sequelize): typeof PaymentsDocuments {
    PaymentsDocuments.init(
      {
        id: {
          type: DataTypes.UUID,
          defaultValue: DataTypes.UUIDV4,
          primaryKey: true,
        },
        paymentId: {
          type: DataTypes.UUID,
          allowNull: false,
        },
        documentId: {
          type: DataTypes.UUID,
          allowNull: false,
        },
        documentType: {
          type: DataTypes.ENUM("Invoice", "PurchaseBill", "PurchaseOrder", "Advance Payment Received", "Advance Payment Made"),
          allowNull: false,
        },
        paymentValue: {
          type: DataTypes.DECIMAL(18,2),
          allowNull: false,
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
          defaultValue: DataTypes.NOW,
        },
        updatedAt: {
          type: DataTypes.DATE,
          defaultValue: DataTypes.NOW,
        },
      },
      {
        sequelize,
        tableName: "PaymentsDocuments",
        timestamps: true,
      }
    );
    return PaymentsDocuments;
  }
}

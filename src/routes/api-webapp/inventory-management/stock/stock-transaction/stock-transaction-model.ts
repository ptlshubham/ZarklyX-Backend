import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  Sequelize,
} from "sequelize";

export class StockTransaction extends Model<
  InferAttributes<StockTransaction>,
  InferCreationAttributes<StockTransaction>
> {
  declare id: CreationOptional<string>;
  declare companyId: string;
  declare transactionDate: Date;
  declare transactionType: "INWARD" | "OUTWARD" | "ADJUSTMENT";
  declare warehouseId: string;
  declare itemId: string;
  declare quantity: number;
  declare rate: number;
  declare amount: number;
  declare vendorId: string | null;
  declare batchNumber: string | null;
  declare expiryDate: Date | null;
  declare referenceNumber: string | null;
  declare notes: string | null;
  declare reason: string | null;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  static initModel(sequelize: Sequelize): typeof StockTransaction {
    StockTransaction.init(
      {
        id: {
          type: DataTypes.UUID,
          primaryKey: true,
          defaultValue: DataTypes.UUIDV4,
        },
        companyId: {
          type: DataTypes.UUID,
          allowNull: false,
        },
        transactionDate: {
          type: DataTypes.DATE,
          allowNull: false,
        },
        transactionType: {
          type: DataTypes.ENUM("INWARD", "OUTWARD", "ADJUSTMENT"),
          allowNull: false,
        },
        warehouseId: {
          type: DataTypes.UUID,
          allowNull: false,
        },
        itemId: {
          type: DataTypes.UUID,
          allowNull: false,
        },
        quantity: {
          type: DataTypes.INTEGER,
          allowNull: false,
        },
        rate: {
          type: DataTypes.DECIMAL(10, 2),
          allowNull: false,
          defaultValue: 0,
        },
        amount: {
          type: DataTypes.DECIMAL(12, 2),
          allowNull: false,
          defaultValue: 0,
        },
        vendorId: {
          type: DataTypes.UUID,
          allowNull: true,
        },
        batchNumber: {
          type: DataTypes.STRING,
          allowNull: true,
        },
        expiryDate: {
          type: DataTypes.DATE,
          allowNull: true,
        },
        referenceNumber: {
          type: DataTypes.STRING,
          allowNull: true,
        },
        notes: {
          type: DataTypes.TEXT,
          allowNull: true,
        },
        reason: {
          type: DataTypes.TEXT,
          allowNull: true,
        },
        createdAt: {
          type: DataTypes.DATE,
          allowNull: false,
        },
        updatedAt: {
          type: DataTypes.DATE,
          allowNull: false,
        },
      },
      {
        sequelize,
        tableName: "stock_transaction",
        modelName: "StockTransaction",
        timestamps: true,
        indexes: [
          {
            fields: ["companyId", "warehouseId", "itemId"],
            name: "idx_stock_tx_company_wh_item",
          },
          {
            fields: ["companyId", "transactionType"],
            name: "idx_stock_tx_company_type",
          },
        ]

      }
    );

    return StockTransaction;
  }
}

export const initStockTransactionModel = (sequelize: Sequelize) => StockTransaction.initModel(sequelize);
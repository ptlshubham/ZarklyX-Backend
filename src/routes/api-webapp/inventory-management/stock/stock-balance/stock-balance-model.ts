import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  Sequelize,
} from "sequelize";

export class StockBalance extends Model<
  InferAttributes<StockBalance>,
  InferCreationAttributes<StockBalance>
> {
  declare id: CreationOptional<string>;
  declare companyId: string;
  declare warehouseId: string;
  declare itemId: string;
  declare quantity: number;
  declare updatedAt: CreationOptional<Date>;

  static initModel(sequelize: Sequelize): typeof StockBalance {
    StockBalance.init(
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
          defaultValue: 0,
        },
        updatedAt: {
          type: DataTypes.DATE,
          allowNull: false,
          defaultValue: DataTypes.NOW,
        },
      },
      {
        sequelize,
        tableName: "stock_balance",
        modelName: "StockBalance",
        timestamps: true,
        updatedAt: true,
        createdAt: false,
        indexes: [
          {
            unique: true,
            fields: ["companyId", "warehouseId", "itemId"],
            name: "uniq_stock_balance",
          },
        ],
      }
    );

    return StockBalance;
  }
}

export const initStockBalanceModel = (sequelize: Sequelize) => StockBalance.initModel(sequelize);
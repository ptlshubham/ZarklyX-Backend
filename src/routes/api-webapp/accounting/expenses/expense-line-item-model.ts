import {
    CreationOptional,
    DataTypes,
    InferCreationAttributes,
    InferAttributes,
    Model,
    Sequelize,
} from "sequelize";

export class ExpenseLineItem extends Model<
    InferAttributes<ExpenseLineItem>,
    InferCreationAttributes<ExpenseLineItem>
> {
    declare id: CreationOptional<string>;
    declare expenseId: string; // Foreign key to Expenses table
    declare expenseItemId: string;  // Foreign key to Expense-Item table
    declare companyId: string;
    declare expenseName: string;
    declare unitId: string;
    declare quantity: number;
    declare unitPrice: number;
    declare tax: number | null;
    declare taxAmount: number | null;
    declare taxable: number | null;
    declare totalAmount: number;
    declare isActive: boolean;
    declare isDeleted: boolean;
    declare createdAt: CreationOptional<Date>;
    declare updatedAt: CreationOptional<Date>;

    static initModel(sequelize: Sequelize): typeof ExpenseLineItem {
        ExpenseLineItem.init(
        {
            id: {
                type: DataTypes.UUID,
                defaultValue: DataTypes.UUIDV4,
                primaryKey: true,
            },
            expenseId: {
                type: DataTypes.UUID,
                allowNull: false,
                references: {
                    model: "expenses",
                    key: "id",
                },
                onDelete: "CASCADE",
            },
            expenseItemId: {
                type: DataTypes.UUID,
                allowNull: false,
                references: {
                    model: "expense_item",
                    key: "id",
                },
            },
            companyId: {
                type: DataTypes.UUID,
                references:{
                    model: "company",
                    key: "id",
                },
                onDelete: "CASCADE",
                allowNull: false,
            },
            expenseName: {
                type: DataTypes.STRING(255),
                allowNull: false,
            },
            unitId: {
                type: DataTypes.STRING,
                references: {
                    model: "unit",
                    key: "id",
                },
                onDelete: "CASCADE",
                allowNull: false,
            },
            quantity: {
                type: DataTypes.DECIMAL(10, 2),
                allowNull: false,
            },
            unitPrice: {
                type: DataTypes.DECIMAL(10, 2),
                allowNull: false,
            },
            taxable: {
                type: DataTypes.DECIMAL(12, 2),
                allowNull: true,
                comment: 'Taxable amount after discount but before tax',
            },
            tax: {
                type: DataTypes.DECIMAL(5, 2),
                allowNull: true,
            },
            taxAmount: {
                type: DataTypes.DECIMAL(10, 2),
                allowNull: true,
            },
            totalAmount: {
                type: DataTypes.DECIMAL(12, 2),
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
        modelName: "ExpenseLineItem",
        tableName: "expense_line_item",
        timestamps: true,
        indexes: [
          { fields: ["expenseId"] },
          { fields: ["expenseItemId"] },
          {
            fields: ["expenseId", "expenseItemId"],
            unique: true,
          },
        ],
      }
    );

    return ExpenseLineItem;
  }
}

import {
    CreationOptional,
    DataTypes,
    InferCreationAttributes,
    InferAttributes,
    Model,
    Sequelize,
} from "sequelize";

export class ExpenseItem extends Model<
    InferAttributes<ExpenseItem>,
    InferCreationAttributes<ExpenseItem>
> {
    declare id: CreationOptional<string>;
    declare companyId: string; // Foreign key to Company table
    declare expenseName: string;
    declare isActive: boolean;
    declare isDeleted: boolean;
    declare createdAt: CreationOptional<Date>;
    declare updatedAt: CreationOptional<Date>;

    static initModel(sequelize: Sequelize): typeof ExpenseItem {
        ExpenseItem.init(
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
                expenseName: {
                    type: DataTypes.STRING(255),
                    allowNull: false,
                    comment: 'Item name snapshot from Item table',
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
                modelName: "expense_item",
                tableName: "expense_item",
                timestamps: true,
                indexes: [
                    {
                        fields: ['id'],
                    },
                ],
            }
        );
        return ExpenseItem;
    }
}

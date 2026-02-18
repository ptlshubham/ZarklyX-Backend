import {
    CreationOptional,
    DataTypes,
    InferAttributes,
    InferCreationAttributes,
    Model,
    Sequelize,
} from "sequelize";

export class Todo extends Model<
    InferAttributes<Todo>,
    InferCreationAttributes<Todo>
> {
    declare id: CreationOptional<string>;

    declare userId: string;
    declare companyId: string | null;

    declare title: string;
    declare description: string | null;
    declare category: string | null;

    declare todoDate: string;
    declare isCompleted: CreationOptional<boolean>;

    declare createdAt: CreationOptional<Date>;
    declare updatedAt: CreationOptional<Date>;

    static initModel(sequelize: Sequelize): typeof Todo {
        Todo.init(
            {
                id: {
                    type: DataTypes.UUID,
                    defaultValue: DataTypes.UUIDV4,
                    primaryKey: true,
                },

                userId: {
                    type: DataTypes.UUID,
                    allowNull: false,
                },

                companyId: {
                    type: DataTypes.UUID,
                    allowNull: true,
                },

                title: {
                    type: DataTypes.STRING(255),
                    allowNull: false,
                },

                description: {
                    type: DataTypes.TEXT,
                    allowNull: true,
                },

                category: {
                    type: DataTypes.STRING(100),
                    allowNull: true,
                },

                todoDate: {
                    type: DataTypes.DATEONLY,
                    allowNull: false,
                },

                isCompleted: {
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
                tableName: "todo",
                modelName: "todo",
                timestamps: true,

                indexes: [
                    {
                        fields: ["userId", "todoDate"],
                        name: "idx_todo_user_date",
                    },
                    {
                        fields: ["companyId"],
                        name: "idx_todo_company",
                    },
                ],
            }
        );

        return Todo;
    }
}

export const initTodoModel = (sequelize: Sequelize) =>
    Todo.initModel(sequelize);

import {
    CreationOptional,
    DataTypes,
    InferAttributes,
    InferCreationAttributes,
    Model,
    Sequelize,
} from "sequelize";

export class ChangeAssignment extends Model<
    InferAttributes<ChangeAssignment>,
    InferCreationAttributes<ChangeAssignment>
> {
    declare id: CreationOptional<string>;
    declare changeId: string;
    declare employeeId: string;
    declare status: "Pending" | "In Progress" | "Completed";
    declare isActive: boolean;
    declare isDeleted: boolean;
    declare createdAt: CreationOptional<Date>;
    declare updatedAt: CreationOptional<Date>;

    static initModel(sequelize: Sequelize): typeof ChangeAssignment {
        ChangeAssignment.init(
            {
                id: {
                    type: DataTypes.UUID,
                    defaultValue: DataTypes.UUIDV4,
                    primaryKey: true,
                },
                changeId: {
                    type: DataTypes.UUID,
                    allowNull: false,
                    references: {
                        model: "ticket_changes",
                        key: "id",
                    },
                },
                employeeId: {
                    type: DataTypes.UUID,
                    allowNull: false,
                    references: {
                        model: "employee",
                        key: "id",
                    },
                },
                status: {
                    type: DataTypes.ENUM("Pending", "In Progress", "Completed"),
                    allowNull: false,
                    defaultValue: "Pending",
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
                modelName: "ChangeAssignment",
                tableName: "change_assignment",
                timestamps: true,
            }
        );
        return ChangeAssignment;
    }
}

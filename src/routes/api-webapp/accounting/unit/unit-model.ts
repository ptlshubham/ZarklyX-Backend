import {
    CreationOptional,
    DataTypes,
    InferCreationAttributes,
    InferAttributes,
    Model,
    Sequelize,
} from "sequelize";

export class Unit extends Model<
    InferAttributes<Unit>,
    InferCreationAttributes<Unit>
> {
    declare id: CreationOptional<string>;      // PK
    declare companyId: string;
    declare unitName: string;
    declare unitCode: string;
    declare isActive: boolean;
    declare isDeleted: boolean;
    declare createdAt: CreationOptional<Date>;
    declare updatedAt: CreationOptional<Date>;

    static initModel(sequelize: Sequelize): typeof Unit {
        Unit.init(
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
                unitName: {
                    type: DataTypes.STRING(100),
                    allowNull: false,
                },
                unitCode: {
                    type: DataTypes.STRING(100),
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
                modelName: "unit",
                tableName: "unit",
                timestamps: true,
                indexes: [
                    {
                        fields: ["companyId", "unitName"],
                        unique: true,
                    },
                    {
                        fields: ["companyId", "unitCode"],
                        unique: true,
                    },
                ],
            }
        );
        return Unit;
    }

}

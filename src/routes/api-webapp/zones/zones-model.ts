import {
    CreationOptional,
    DataTypes,
    InferCreationAttributes,
    InferAttributes,
    Model,
    Sequelize,
} from "sequelize";
export class Zones extends Model<
    InferAttributes<Zones>,
    InferCreationAttributes<Zones>
> {
    declare id: CreationOptional<number>;
    declare name: string;
    declare isactive: boolean;
    declare createdAt: CreationOptional<Date>;
    declare updatedAt: CreationOptional<Date>;

    static initModel(sequelize: Sequelize): typeof Zones {
        Zones.init(
            {
                id: {
                    type: DataTypes.INTEGER,
                    primaryKey: true,
                    autoIncrement: true,
                    allowNull: false,
                },
                name: {
                    type: DataTypes.STRING(255),
                    allowNull: false,
                },
                isactive: {
                    type: DataTypes.BOOLEAN,
                    defaultValue: true,
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
                tableName: "zones",
                freezeTableName: true,
                timestamps: true,
            }
        );

        return Zones;
    }
}

export const initZonesModel = (sequelize: Sequelize) =>
    Zones.initModel(sequelize);



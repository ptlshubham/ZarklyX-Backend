import {
    CreationOptional,
    DataTypes,
    InferCreationAttributes,
    InferAttributes,
    Model,
    Sequelize,
} from "sequelize";

export class ItemCategory extends Model<
    InferAttributes<ItemCategory>,
    InferCreationAttributes<ItemCategory>
> {
    declare id: CreationOptional<string>;      // PK
    declare companyId: string;
    declare categoryName: string;
    declare categoryType: string;
    declare isActive: boolean;
    declare isDeleted: boolean;
    declare createdAt: CreationOptional<Date>;
    declare updatedAt: CreationOptional<Date>;

    static initModel(sequelize: Sequelize): typeof ItemCategory {
        ItemCategory.init(
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
                categoryName: {
                    type: DataTypes.STRING(100),
                    allowNull: false,
                },
                categoryType: {
                    type: DataTypes.ENUM("Product", "Service"),
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
                tableName: "itemCategory",
                timestamps: true,
                indexes: [
                    {
                        fields: ["companyId", "categoryName"],
                        unique: true,
                    },
                ],
            }
        );
        return ItemCategory;
    }

}

import {
    CreationOptional,
    DataTypes,
    InferCreationAttributes,
    InferAttributes,
    Model,
    Sequelize,
} from "sequelize";

export class ItAssetsAttachments extends Model<
    InferAttributes<ItAssetsAttachments>,
    InferCreationAttributes<ItAssetsAttachments>
> {
    declare id: CreationOptional<string>; // UUID
    declare itAssetId: string | null;
    declare attachmentPath: string;
    declare createdAt: CreationOptional<Date>;
    declare updatedAt: CreationOptional<Date>;

    static initModel(sequelize: Sequelize): typeof ItAssetsAttachments {
        ItAssetsAttachments.init(
            {
                id: {
                    type: DataTypes.UUID,
                    defaultValue: DataTypes.UUIDV4,
                    primaryKey: true,
                    allowNull: false,
                    unique: true,
                },
                itAssetId: {
                    type: DataTypes.UUID,
                    allowNull: false,
                    references: {
                        model: "itAssetsManagement",
                        key: "id",
                    },
                    onDelete: "CASCADE",
                },
                attachmentPath:{
                    type:DataTypes.STRING(255),
                    allowNull:false,
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
                freezeTableName: true,
                tableName: "itAssetsAttachments",
                timestamps: true
            }
        );
        return ItAssetsAttachments;
    }
}
import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  Sequelize,
} from "sequelize";

export class InfluencerCategory extends Model<
  InferAttributes<InfluencerCategory>,
  InferCreationAttributes<InfluencerCategory>
> {
  declare id: CreationOptional<string>;
  declare name: string;
  declare isActive: boolean;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  static initModel(sequelize: Sequelize): typeof InfluencerCategory {
    InfluencerCategory.init(
      {
        id: {
          type: DataTypes.UUID,
          primaryKey: true,
          allowNull: false,
          unique: true,
          defaultValue: DataTypes.UUIDV4,
        },
        name: {
          type: DataTypes.STRING(255),
          allowNull: false,
          unique: {
            name: "category_name",
            msg: "Category name must be unique",
          },
        },
        isActive: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
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
        modelName: "influencer_category",
        tableName: "influencer_category",
        timestamps: true,
      }
    );

    return InfluencerCategory;
  }
}

export const initCategoryModel = (sequelize: Sequelize) =>
  InfluencerCategory.initModel(sequelize);

import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  Sequelize,
} from "sequelize";

export class InfluencerCategoryMapping extends Model<
  InferAttributes<InfluencerCategoryMapping>,
  InferCreationAttributes<InfluencerCategoryMapping>
> {
  declare categoryId: string;
  declare influencerId: string;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  static initModel(sequelize: Sequelize): typeof InfluencerCategoryMapping {
    InfluencerCategoryMapping.init(
      {
        categoryId: {
          type: DataTypes.UUID,
          primaryKey: true,
          allowNull: false,
          references: {
            model: "influencer_category",
            key: "id",
          },
          onDelete: "CASCADE",
          onUpdate: "CASCADE",
        },
        influencerId: {
          type: DataTypes.UUID,
          primaryKey: true,
          allowNull: false,
          references: {
            model: "influencer",
            key: "id",
          },
          onDelete: "CASCADE",
          onUpdate: "CASCADE",
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
        modelName: "InfluencerCategoryMapping",
        tableName: "influencer_category_mapping",
        timestamps: true,
      }
    );

    return InfluencerCategoryMapping;
  }
}

export const initInfluencerCategoryMappingModel = (sequelize: Sequelize) =>
  InfluencerCategoryMapping.initModel(sequelize);

import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  Sequelize,
} from "sequelize";

export class InfluencerIndustryMapping extends Model<
  InferAttributes<InfluencerIndustryMapping>,
  InferCreationAttributes<InfluencerIndustryMapping>
> {
  declare industryId: string;
  declare influencerId: string;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  static initModel(sequelize: Sequelize): typeof InfluencerIndustryMapping {
    InfluencerIndustryMapping.init(
      {
        industryId: {
          type: DataTypes.UUID,
          primaryKey: true,
          allowNull: false,
          references: {
            model: "influencer_industry",
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
        modelName: "InfluencerIndustryMapping",
        tableName: "influencer_industry_mapping",
        timestamps: true,
      }
    );

    return InfluencerIndustryMapping;
  }
}

export const initInfluencerIndustryMappingModel = (sequelize: Sequelize) =>
  InfluencerIndustryMapping.initModel(sequelize);

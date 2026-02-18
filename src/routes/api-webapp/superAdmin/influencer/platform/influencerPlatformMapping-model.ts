import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  Sequelize,
} from "sequelize";

export class InfluencerPlatformMapping extends Model<
  InferAttributes<InfluencerPlatformMapping>,
  InferCreationAttributes<InfluencerPlatformMapping>
> {
  declare platformId: string;
  declare influencerId: string;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  static initModel(sequelize: Sequelize): typeof InfluencerPlatformMapping {
    InfluencerPlatformMapping.init(
      {
        platformId: {
          type: DataTypes.UUID,
          primaryKey: true,
          allowNull: false,
          references: {
            model: "influencer_platform",
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
        modelName: "InfluencerPlatformMapping",
        tableName: "influencer_platform_mapping",
        timestamps: true,
      }
    );

    return InfluencerPlatformMapping;
  }
}

export const initInfluencerPlatformMappingModel = (sequelize: Sequelize) =>
  InfluencerPlatformMapping.initModel(sequelize);

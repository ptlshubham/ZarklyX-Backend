import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  Sequelize,
} from "sequelize";

export class InfluencerIndustry extends Model<
  InferAttributes<InfluencerIndustry>,
  InferCreationAttributes<InfluencerIndustry>
> {
  declare id: CreationOptional<string>;
  declare name: string;
  declare isActive: CreationOptional<boolean>;
  declare isDeleted:CreationOptional<boolean>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  static initModel(sequelize: Sequelize): typeof InfluencerIndustry {
    InfluencerIndustry.init(
      {
        id: {
          type: DataTypes.UUID,
          defaultValue: DataTypes.UUIDV4,
          primaryKey: true,
          allowNull: false,
          unique: true,
        },
        name: {
          type: DataTypes.STRING(255),
          allowNull: false,
          unique: {
            name: "unique_influencer_Industry_name",
            msg: "Influencer Industry name must be unique",
          },
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
        modelName: "influencer_Industry",
        tableName: "influencer_Industry",
        timestamps: true,
      }
    );

    return InfluencerIndustry;
  }
}

export const initInfluencerIndustryModel = (sequelize: Sequelize) =>
  InfluencerIndustry.initModel(sequelize);

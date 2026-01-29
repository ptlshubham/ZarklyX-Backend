import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  Sequelize,
} from "sequelize";

export class seo extends Model<
  InferAttributes<seo>,
  InferCreationAttributes<seo>
> {
  declare id: CreationOptional<string>;
  declare url: string;
  declare isDeleted:CreationOptional<boolean>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  static initModel(sequelize: Sequelize): typeof seo {
    seo.init(
      {
        id: {
          type: DataTypes.UUID,
          defaultValue: DataTypes.UUIDV4,
          primaryKey: true,
          allowNull: false,
          unique: true,
        },
        url: {
          type: DataTypes.STRING(255),
          allowNull: false,
          unique: {
            name: "unique_influencer_category_name",
            msg: "Influencer category name must be unique",
          },
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
        modelName: "seo",
        tableName: "seo",
        timestamps: true,
      }
    );

    return seo;
  }
}

export const initseoModel = (sequelize: Sequelize) =>
  seo.initModel(sequelize);

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
  declare analysisType: string; // Type of analysis: lighthouse, keyword-ranking, responsive, etc.
  declare analysisData: CreationOptional<string>; // JSON string of analysis results
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
          type: DataTypes.STRING(500),
          allowNull: false,
        },
        analysisType: {
          type: DataTypes.STRING(50),
          allowNull: false,
          comment: "Type of SEO analysis: lighthouse, keyword-ranking, responsive, etc."
        },
        analysisData: {
          type: DataTypes.TEXT('long'), // Store JSON data
          allowNull: true,
          comment: "JSON string containing analysis results"
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

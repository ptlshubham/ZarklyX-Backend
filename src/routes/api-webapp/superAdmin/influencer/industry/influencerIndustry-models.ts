import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  Sequelize,
} from "sequelize";

export class Industry extends Model<
  InferAttributes<Industry>,
  InferCreationAttributes<Industry>
> {
  declare id: CreationOptional<string>;
  declare name: string;
  declare isActive: boolean;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  static initModel(sequelize: Sequelize): typeof Industry {
    Industry.init(
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
            name: "industry_name",
            msg: "Industry name must be unique",
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
        modelName: "influencer_industry",
        tableName: "influencer_industry",
        timestamps: true,
      }
    );

    return Industry;
  }
}

export const initCategoryModel = (sequelize: Sequelize) =>
  Industry.initModel(sequelize);

import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  Sequelize,
} from "sequelize";

export class PostMediaFiles extends Model<
  InferAttributes<PostMediaFiles>,
  InferCreationAttributes<PostMediaFiles>
> {
  declare id: CreationOptional<string>;
  declare urls: Array<{ url: string; type: any }>;;
  declare refCount: number;
  declare status: string;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  static initModel(sequelize: Sequelize): typeof PostMediaFiles {
    PostMediaFiles.init(
      {
        id: {
          type: DataTypes.UUID,
          defaultValue: DataTypes.UUIDV4,
          primaryKey: true,
          allowNull: false,
        },

        urls: {
          type: DataTypes.JSON,
          allowNull: false,
          defaultValue: [],
        },

        refCount: {
          type: DataTypes.INTEGER,
          allowNull: false,
          defaultValue: 0,
        },

        status: {
          type: DataTypes.STRING,
          allowNull: false,
          defaultValue: "active",
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
        modelName: "PostMediaFiles",
        tableName: "post_media_files",
        timestamps: true,
        indexes: [
          {
            fields: ["status"],
          },
          {
            fields: ["createdAt"],
          },
        ],
      }
    );

    return PostMediaFiles;
  }
}

export const initPostMediaFilesModel = (sequelize: Sequelize) =>
  PostMediaFiles.initModel(sequelize);

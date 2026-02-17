import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  Sequelize,
} from "sequelize";
import { PostDetails } from "./post-details.model";

export class PostSchedule extends Model<
  InferAttributes<PostSchedule>,
  InferCreationAttributes<PostSchedule>
> {
  declare id: CreationOptional<string>;
  declare postDetailId: string;
  declare runAt: Date;
  declare status: "pending" | "processing" | "done" | "failed";
  declare lockedAt: Date | null;
  declare workerId: string | null;
  declare attempts: number;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare postDetail?: PostDetails;

  static initModel(sequelize: Sequelize): typeof PostSchedule {
    PostSchedule.init(
      {
        id: {
          type: DataTypes.UUID,
          defaultValue: DataTypes.UUIDV4,
          primaryKey: true,
          allowNull: false,
        },

        postDetailId: {
          type: DataTypes.UUID,
          allowNull: false,
          unique: true,
        },

        runAt: {
          type: DataTypes.DATE,
          allowNull: false,
        },

        status: {
          type: DataTypes.ENUM("pending", "processing", "done", "failed"),
          allowNull: false,
          defaultValue: "pending",
        },

        lockedAt: {
          type: DataTypes.DATE,
          allowNull: true,
        },

        workerId: {
          type: DataTypes.STRING(255),
          allowNull: true,
        },

        attempts: {
          type: DataTypes.INTEGER,
          allowNull: false,
          defaultValue: 0,
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
        modelName: "PostSchedule",
        tableName: "post_schedule",
        timestamps: true,
        indexes: [
          {
            fields: ["status", "runAt"],
            name: "idx_status_run_at",
          },
          {
            fields: ["status", "lockedAt"],
            name: "idx_processing_locked_at",
          },
          {
            fields: ["workerId"],
          },
        ],
      }
    );

    return PostSchedule;
  }
}

export const initPostScheduleModel = (sequelize: Sequelize) =>
  PostSchedule.initModel(sequelize);

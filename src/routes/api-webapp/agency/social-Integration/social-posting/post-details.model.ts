import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  Sequelize,
} from "sequelize";
import { MetaSocialAccount } from "../meta-social-account.model";

export class PostDetails extends Model<
  InferAttributes<PostDetails>,
  InferCreationAttributes<PostDetails>
> {
  declare id: CreationOptional<string>;
  declare companyId: string;
  declare createdBy: string | null; // UUID of the user who created the post
  declare socialAccountId: string;
  declare platform: "facebook" | "instagram" | "linkedin";
  declare postType: "feed" | "story" | "feed_story" | "reel" | "carousel" | "article";
  declare caption: string | null;
  declare firstComment: string | null;
  declare taggedPeople: Array<string>;
  declare media: CreationOptional<Array<{ url: string; type: any }>>;
  declare mediaUrlId: string | null;
  declare status: "pending" | "processing" | "published" | "failed" | "cancelled";
  declare externalPostId: string | null;
  declare errorMessage: string | null;
  declare attempts: number;
  declare isImmediatelyPublished: CreationOptional<boolean>;
  declare scheduledAt: Date | null; // Scheduled date/time for the post
  declare publishedAt: Date | null; // Actual publication date/time (null if not published yet)
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  declare socialAccount?: MetaSocialAccount;

  static initModel(sequelize: Sequelize): typeof PostDetails {
    PostDetails.init(
      {
        id: {
          type: DataTypes.UUID,
          defaultValue: DataTypes.UUIDV4,
          primaryKey: true,
          allowNull: false,
        },

        companyId: {
          type: DataTypes.UUID,
          allowNull: false,
        },

        createdBy: {
          type: DataTypes.UUID,
          allowNull: true,
        },

        socialAccountId: {
          type: DataTypes.UUID,
          allowNull: false,
        },

        platform: {
          type: DataTypes.ENUM("facebook", "instagram", "linkedin"),
          allowNull: false,
        },

        postType: {
          type: DataTypes.ENUM("feed", "story", "feed_story", "reel", "carousel", "article"),
          allowNull: false,
          defaultValue: "feed",
        },

        caption: {
          type: DataTypes.TEXT,
          allowNull: true,
        },

        firstComment: {
          type: DataTypes.TEXT,
          allowNull: true,
        },

        taggedPeople: {
          field: "tagPeople",
          type: DataTypes.JSON,
          allowNull: true,
          defaultValue: [],
        },

        media: {
          type: DataTypes.JSON,
          allowNull: true,
          defaultValue: null,
        },

        mediaUrlId : {
          type: DataTypes.UUID,
          allowNull: true,
        },

        status: {
          type: DataTypes.ENUM("pending", "processing", "published", "failed", "cancelled"),
          allowNull: false,
          defaultValue: "pending",
        },

        externalPostId: {
          type: DataTypes.STRING(500),
          allowNull: true,
        },

        errorMessage: {
          type: DataTypes.TEXT,
          allowNull: true,
        },

        attempts: {
          type: DataTypes.INTEGER,
          allowNull: false,
          defaultValue: 0,
        },

        isImmediatelyPublished: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: false,
        },

        scheduledAt: {
          type: DataTypes.DATE,
          allowNull: true,
          comment: "Scheduled date/time for the post",
        },

        publishedAt: {
          type: DataTypes.DATE,
          allowNull: true,
          comment: "Actual publication date/time (null if not yet published)",
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
        modelName: "PostDetails",
        tableName: "post_details",
        timestamps: true,
        indexes: [
          {
            fields: ["status"],
          },
          {
            fields: ["companyId"],
          },
          {
            fields: ["socialAccountId"],
          },
          {
            fields: ["platform"],
          },
          {
            fields: ["createdAt"],
          },
          {
            fields: ["scheduledAt"],
            name: "idx_scheduled_at",
          },
          {
            fields: ["publishedAt"],
            name: "idx_published_at",
          },
        ],
      }
    );

    return PostDetails;
  }
}

export const initPostDetailsModel = (sequelize: Sequelize) =>
  PostDetails.initModel(sequelize);

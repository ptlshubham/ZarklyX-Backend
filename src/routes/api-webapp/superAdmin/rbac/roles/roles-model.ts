import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  Sequelize,
} from "sequelize";

export class ZarklyXRole extends Model<
  InferAttributes<ZarklyXRole>,
  InferCreationAttributes<ZarklyXRole>
> {
  declare id: CreationOptional<string>;
  declare name: string;
  declare description: string | null;
  declare baseRoleId: string | null;
  declare level: number | null;
  declare priority: number;
  declare isSystemRole: boolean;
  declare isActive: boolean;
  declare isDeleted: boolean;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  static initModel(sequelize: Sequelize): typeof ZarklyXRole {
    ZarklyXRole.init(
      {
        id: {
          type: DataTypes.UUID,
          defaultValue: DataTypes.UUIDV4,
          primaryKey: true,
          allowNull: false,
        },
        name: {
          type: DataTypes.STRING(255),
          allowNull: false,
          unique: true,
        },
        description: {
          type: DataTypes.TEXT,
          allowNull: true,
        },
        baseRoleId: {
          type: DataTypes.UUID,
          allowNull: true,
          references: {
            model: "zarklyX_roles",
            key: "id",
          },
          comment: "Points to the default role this custom role extends from (NULL for base roles)",
        },
        level: {
          type: DataTypes.INTEGER,
          allowNull: true,
          comment: "Hierarchy level within role group (1=Top-Level, 2=Middle, 3=First-Line, 4=Team Leader/Senior, etc.)",
        },
        priority: {
          type: DataTypes.INTEGER,
          allowNull: false,
          defaultValue: 50,
          comment: "Lower value = higher authority. SuperAdmin=0, PlatformAdmin=10, Support=20",
        },
        isSystemRole: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: false,
          comment: "System roles cannot be deleted",
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
        modelName: "ZarklyXRole",
        tableName: "zarklyX_roles",
        timestamps: true,
        indexes: [
          {
            unique: true,
            fields: ["name"],
            name: "idx_zarklyX_roles_name",
          },
          {
            fields: ["priority"],
            name: "idx_zarklyX_roles_priority",
          },
        ],
      }
    );

    return ZarklyXRole;
  }
}

export const initZarklyXRoleModel = (sequelize: Sequelize) =>
  ZarklyXRole.initModel(sequelize);

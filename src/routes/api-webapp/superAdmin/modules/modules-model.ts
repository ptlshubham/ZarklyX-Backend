import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  Sequelize,
} from "sequelize";

export class Modules extends Model<
  InferAttributes<Modules>,
  InferCreationAttributes<Modules>
> {
  declare id: CreationOptional<string>;
  declare name: string;
  declare description: string;
  declare parentModuleId: string | null;
  declare price: number; // Price when purchased as addon module
  declare isFreeForAll: boolean; // Free for all companies regardless of subscription
  declare isActive: boolean;
  declare isDeleted: boolean;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  // Associations for hierarchical structure
  declare children?: Modules[];
  declare parent?: Modules;

  static initModel(sequelize: Sequelize): typeof Modules {
    Modules.init(
      {
        id: {
          type: DataTypes.UUID,
          defaultValue: DataTypes.UUIDV4,
          primaryKey: true,
          unique: true,
        },
        name: {
          type: DataTypes.STRING,
          allowNull: false,
        },
        description: {
          type: DataTypes.STRING,
          allowNull: false,
        },
        parentModuleId: {
          type: DataTypes.UUID,
          allowNull: true, // NULL = root module
          references: {
            model: 'modules',
            key: 'id',
          },
        },
        price: {
          type: DataTypes.DECIMAL(10, 2),
          allowNull: false,
          defaultValue: 0.00,
        },
        isFreeForAll: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: false,
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
        modelName: "modules",
        tableName: "modules",
        timestamps: true,
        indexes: [
          {
            // Composite unique constraint: same name allowed under different parents
            unique: true,
            fields: ["name", "parentModuleId"],
            name: "idx_modules_name_parent_unique",
          },
          {
            fields: ["parentModuleId"],
            name: "idx_modules_parent_id",
          },
          {
            fields: ["parentModuleId", "isActive", "isDeleted"],
            name: "idx_modules_parent_active_deleted",
          },
          {
            fields: ["isFreeForAll"],
            name: "idx_modules_isFreeForAll",
          },
          {
            fields: ["isActive", "isDeleted"],
            name: "idx_modules_active_deleted",
          },
        ],
      }
    );

    return Modules;
  }
}

export const initModulesModel = (sequelize: Sequelize) =>
  Modules.initModel(sequelize);

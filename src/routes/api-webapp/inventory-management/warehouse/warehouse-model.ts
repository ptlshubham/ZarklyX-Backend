import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  Sequelize,
} from "sequelize";

export class Warehouse extends Model<
  InferAttributes<Warehouse>,
  InferCreationAttributes<Warehouse>
> {
  declare id: CreationOptional<string>;
  declare companyId: string;
  declare name: string;
  declare code: string | null;
  declare address: string | null;
  declare isActive: CreationOptional<boolean>;
  declare isDeleted: CreationOptional<boolean>;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  static initModel(sequelize: Sequelize): typeof Warehouse {
    Warehouse.init(
      {
        id: {
          type: DataTypes.UUID,
          primaryKey: true,
          defaultValue: DataTypes.UUIDV4,
          allowNull: false,
        },

        companyId: {
          type: DataTypes.UUID,
          allowNull: false,
          references: {
            model: "company",
            key: "id",
          },
          onDelete: "CASCADE",
        },

        name: {
          type: DataTypes.STRING(255),
          allowNull: false,
        },

        code: {
          type: DataTypes.STRING(100),
          allowNull: true,
        },

        address: {
          type: DataTypes.TEXT,
          allowNull: true,
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
        tableName: "warehouse",
        modelName: "warehouse",
        timestamps: true,

        indexes: [
          {
            unique: true,
            fields: ["companyId", "name", "isDeleted"],
            name: "uniq_warehouse_company_name_active",
          },
          {
            unique: true,
            fields: ["companyId", "code", "isDeleted"],
            name: "uniq_warehouse_company_code_active",
          },
        ],
      }
    );

    return Warehouse;
  }
}

export const initInventoryCategoryModel = (sequelize: Sequelize) =>
  Warehouse.initModel(sequelize);

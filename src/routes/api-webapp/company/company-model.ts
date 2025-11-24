import {
  CreationOptional,
  DataTypes,
  InferCreationAttributes,
  InferAttributes,
  Model,
  Sequelize,
} from "sequelize";

export class Company extends Model<
  InferAttributes<Company>,
  InferCreationAttributes<Company>
> {
  declare id: CreationOptional<number>;
  declare name: string;
  declare description: string | null;
  declare accountType: string | null;
  declare businessArea: string | null;
  declare industryType: string | null;
  declare website: string | null;
  declare email: string | null;
  declare contact: string | null;
  declare logo: string | null;
  declare timezone: string | null;
  declare country: string | null;
  declare state: string | null;
  declare city: string | null;
  declare address: string | null;
  declare zipcode: string | null;
  declare registrationNumber: string | null;
  declare no_of_clients: number | null;
  declare selectedModules: string | null;
  declare isActive: boolean;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  static initModel(sequelize: Sequelize): typeof Company {
    Company.init(
      {
        id: {
          type: DataTypes.INTEGER,
          primaryKey: true,
          autoIncrement: true,
          allowNull: false,
          unique: true,
        },
        name: {
          type: DataTypes.STRING(255),
          allowNull: false,
          unique: {
            name: "company_name",
            msg: "Company name must be unique",
          },
        },
        description: {
          type: DataTypes.TEXT,
          allowNull: true,
        },
        accountType: {
          type: DataTypes.TEXT,
          allowNull: true,
        },
        businessArea: {
          type: DataTypes.STRING(255),
          allowNull: true,
        },
        industryType: {
          type: DataTypes.STRING(255),
          allowNull: true,
        },
        email: {
          type: DataTypes.STRING(255),
          allowNull: true,
        },
        contact: {
          type: DataTypes.STRING(20),
          allowNull: true,
        },
        address: {
          type: DataTypes.STRING(255),
          allowNull: true,
        },
        city: {
          type: DataTypes.STRING(100),
          allowNull: true,
        },
        state: {
          type: DataTypes.STRING(100),
          allowNull: true,
        },
        zipcode: {
          type: DataTypes.STRING(10),
          allowNull: true,
        },
        country: {
          type: DataTypes.STRING(100),
          allowNull: true,
        },
        website: {
          type: DataTypes.STRING(255),
          allowNull: true,
        },
        logo: {
          type: DataTypes.STRING(500),
          allowNull: true,
        },
        timezone: {
          type: DataTypes.STRING(500),
          allowNull: true,
        },
        registrationNumber: {
          type: DataTypes.STRING(100),
          allowNull: true,
        },
        selectedModules: {
          type: DataTypes.STRING(500),
          allowNull: true,
        },
        no_of_clients: {
          type: DataTypes.INTEGER,
          allowNull: true,
        },
        isActive: {
          type: DataTypes.BOOLEAN,
          defaultValue: true,
          allowNull: false,
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
        modelName: "company",
        tableName: "company",
        timestamps: true,
      }
    );

    return Company;
  }
}

// ✅ yeh line zaroor add karo
export const initCompanyModel = (sequelize: Sequelize) =>
  Company.initModel(sequelize);

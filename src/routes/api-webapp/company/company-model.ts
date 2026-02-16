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
  declare id: CreationOptional<string>;
  declare name: string;
  declare description: string | null;
  declare accountType: string | null;
  declare businessArea: string | null;
  declare website: string | null;
  declare email: string | null;
  declare contact: string | null;
  declare isdCode: string | null;
  declare isoCode: string | null;
  declare logo: string | null;
  declare companyLogoLight: string | null;
  declare companyLogoDark: string | null;
  declare faviconLight: string | null;
  declare faviconDark: string | null;
  declare employeeLoginBanner: string | null;
  declare clientLoginBanner: string | null;
  declare clientSignupBanner: string | null;
  declare timezone: string | null;
  declare country: string | null;
  declare state: string | null;
  declare city: string | null;
  declare address: string | null;
  declare zipcode: string | null;
  declare registrationNumber: string | null;
  declare no_of_clients: number | null;
  declare selectedModules: string | null;
  declare bankName: string | null;
  declare branchName: string | null;
  declare adCode: string | null;
  declare upiId: string | null;
  declare accountNumber: string | null;
  declare ifscCode: string | null;
  declare swiftCode: string | null;
  declare accountHolderName: string | null;
  declare tin: string | null;
  declare lst: string | null;
  declare pan: string | null;
  declare fssaiNo: string | null;
  declare dlNo: string | null;
  declare cst: string | null;
  declare tan: string | null;
  declare currency: string | null;
  declare gstin: string | null;
  declare serviceTaxNumber: string | null;
  declare taxationType: string | null;
  declare taxInclusiveRate: boolean;
  declare isActive: boolean;
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  static initModel(sequelize: Sequelize): typeof Company {
    Company.init(
      {
        id: {
          type: DataTypes.UUID,
          primaryKey: true,
          defaultValue: DataTypes.UUIDV4,
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
        email: {
          type: DataTypes.STRING(255),
          allowNull: true,
        },
        contact: {
          type: DataTypes.STRING(20),
          allowNull: true,
        },
        isdCode: {
          type: DataTypes.STRING(10),
          allowNull: true,
        },
        isoCode: {
          type: DataTypes.STRING(10),
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
          type: DataTypes.TEXT,
          allowNull: true,
        },
        companyLogoLight: {
          type: DataTypes.TEXT,
          allowNull: true,
        },
        companyLogoDark: {
          type: DataTypes.TEXT,
          allowNull: true,
        },
        faviconLight: {
          type: DataTypes.TEXT,
          allowNull: true,
        },
        faviconDark: {
          type: DataTypes.TEXT,
          allowNull: true,
        },
        employeeLoginBanner: {
          type: DataTypes.TEXT,
          allowNull: true,
        },
        clientLoginBanner: {
          type: DataTypes.TEXT,
          allowNull: true,
        },
        clientSignupBanner: {
          type: DataTypes.TEXT,
          allowNull: true,
        },
        timezone: {
          type: DataTypes.STRING(100),
          allowNull: true,
        },
        registrationNumber: {
          type: DataTypes.STRING(100),
          allowNull: true,
        },
        selectedModules: {
          type: DataTypes.TEXT,
          allowNull: true,
        },
        no_of_clients: {
          type: DataTypes.INTEGER,
          allowNull: true,
        },
        bankName: {
          type: DataTypes.STRING(100),
          allowNull: true,
        },
        branchName: {
          type: DataTypes.STRING(100),
          allowNull: true,
        },
        adCode: {
          type: DataTypes.STRING(50),
          allowNull: true,
        },
        upiId: {
          type: DataTypes.STRING(100),
          allowNull: true,
        },
        accountNumber: {
          type: DataTypes.STRING(50),
          allowNull: true,
        },
        ifscCode: {
          type: DataTypes.STRING(50),
          allowNull: true,
        },
        swiftCode: {
          type: DataTypes.STRING(50),
          allowNull: true,
        },
        accountHolderName: {
          type: DataTypes.STRING(100),
          allowNull: true,
        },
        tin: {
          type: DataTypes.STRING(50),
          allowNull: true,
        },
        lst: {
          type: DataTypes.STRING(50),
          allowNull: true,
        },
        pan: {
          type: DataTypes.STRING(50),
          allowNull: true,
        },
        fssaiNo: {
          type: DataTypes.STRING(50),
          allowNull: true,
        },
        dlNo: {
          type: DataTypes.STRING(50),
          allowNull: true,
        },
        cst: {
          type: DataTypes.STRING(50),
          allowNull: true,
        },
        tan: {
          type: DataTypes.STRING(50),
          allowNull: true,
        },
        currency: {
          type: DataTypes.STRING(10),
          allowNull: true,
        },
        gstin: {
          type: DataTypes.STRING(50),
          allowNull: true,
        },
        serviceTaxNumber: {
          type: DataTypes.STRING(50),
          allowNull: true,
        },
        taxationType: {
          type: DataTypes.ENUM("GST", "VAT", "SALES TAX", "EXCISE", "CUSTOMS"),
          allowNull: true,
        },
        taxInclusiveRate: {
          type: DataTypes.BOOLEAN,
          defaultValue: false,
          allowNull: false,
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

export const initCompanyModel = (sequelize: Sequelize) =>
  Company.initModel(sequelize);

import {
  CreationOptional,
  DataTypes,
  InferAttributes,
  InferCreationAttributes,
  Model,
  Sequelize,
} from "sequelize";
import { checkPassword, hashPassword } from "../../../../../services/password-service";

export class Clients extends Model<
  InferAttributes<Clients>,
  InferCreationAttributes<Clients>
> {
  declare id: CreationOptional<number>;
  //   declare icon: string | null;
  // Basic business info
  declare ownerName: string;
  declare businessName: string;
  declare businessBase: string;
  declare businessType: string | null;
  declare businessWebsite: string | null;
  declare businessEmail: string | null;
  declare businessContact: string | null;

  // Login / contact info
  declare email: string;
  declare contact: string;
  declare countryCode: string | null;

  // Address info
  declare country: string;
  declare state: string;
  declare city: string;
  declare postcode: string;
  declare address: string;

  // Auth
  declare password: string;

  // Flags
  declare isVip: boolean;
  declare BusinessSubCategory: string[] | null;
  declare isActive: boolean;
  declare isDeleted: boolean;
  declare isEmailVerified: boolean;
  declare isRegistering: boolean;
  declare registrationStep: number;
  declare isMobileVerified: boolean;

  // Timestamps
  declare createdAt: CreationOptional<Date>;
  declare updatedAt: CreationOptional<Date>;

  // validate password
  validatePassword(this: Clients, userPass: string) {
    return checkPassword(userPass, this.password);
  }

  static initModel(sequelize: Sequelize): typeof Clients {
    Clients.init(
      {
        id: {
          type: DataTypes.INTEGER,
          primaryKey: true,
          autoIncrement: true,
          allowNull: false,
          unique: true,
        },
        businessName: {
          type: DataTypes.STRING(255),
          allowNull: false,
          unique: {
            name: "Clients_name",
            msg: "Clients name must be unique",
          },
        },
        ownerName: {
          type: DataTypes.STRING(255),
          allowNull: false,
        },
        businessBase: {
          type: DataTypes.STRING(255),
          allowNull: false,
        },
        businessType: {
          type: DataTypes.STRING(255),
          allowNull: true,
        },
        businessWebsite: {
          type: DataTypes.STRING(255),
          allowNull: true,
        },
        businessEmail: {
          type: DataTypes.STRING(255),
          allowNull: true,
        },
        businessContact: {
          type: DataTypes.STRING(20),
          allowNull: true,
        },
        email: {
          type: DataTypes.STRING(255),
          allowNull: false,
          unique: {
            name: "email",
            msg: "Email must be unique",
          },
          validate: {
            isEmail: {
              msg: "Invalid email format",
            },
          },
        },
        contact: {
          type: DataTypes.STRING(15),
          allowNull: false,
          unique: {
            name: "contact",
            msg: "Contact number must be unique",
          },
          validate: {
            notEmpty: {
              msg: "Contact number cannot be empty",
            },
          },
        },
        countryCode: {
          type: DataTypes.STRING(10),
          allowNull: true,
          defaultValue: null,
        },
        country: {
          type: DataTypes.STRING(100),
          allowNull: false,
        },
        state: {
          type: DataTypes.STRING(100),
          allowNull: false,
        },
        city: {
          type: DataTypes.STRING(100),
          allowNull: false,
        },
        postcode: {
          type: DataTypes.STRING(20),
          allowNull: false,
        },
        address: {
          type: DataTypes.TEXT,
          allowNull: false,
        },
        password: {
          type: DataTypes.STRING(255),
          allowNull: false,
          set(this: Clients, value: string) {
            if (!value) return;
            const hash = hashPassword(value);
            this.setDataValue("password", hash);
          },
        },
        isVip: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: false,
        },
        BusinessSubCategory: {
          type: DataTypes.JSON,
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
        }, isEmailVerified: {
          type: DataTypes.BOOLEAN,
          defaultValue: false,
        },
        isRegistering: {
          type: DataTypes.BOOLEAN,
          defaultValue: false,
          allowNull: false,
        },
        registrationStep: {
          type: DataTypes.INTEGER,
          defaultValue: 0,
          allowNull: false,
        },
        isMobileVerified: {
          type: DataTypes.BOOLEAN,
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
        modelName: "clients",
        tableName: "clients",
        timestamps: true,
      }
    );

    return Clients;
  }
}

export const initClientsModel = (sequelize: Sequelize) =>
  Clients.initModel(sequelize);

import {
    CreationOptional,
    DataTypes,
    InferAttributes,
    InferCreationAttributes,
    Model,
    Sequelize,
} from "sequelize";
import { checkPassword, hashPassword } from "../../../../services/password-service";

export class Clients extends Model<
    InferAttributes<Clients>,
    InferCreationAttributes<Clients>
> {
    declare id: CreationOptional<number>;
    //   declare icon: string | null;
    // Basic business info
    // declare ownerName: string;
    declare userId: string | null; // UUID FK to User
    declare companyId: string | null; // UUID FK to Company
    declare userName: string | null;
    declare clientfirstName: string;
    declare clientLastName: string;
    declare businessName: string;
    declare businessBase: string;
    declare businessTypeId: number | null;
    declare businessSubCategory: number[] | null;
    declare businessWebsite: string | null;
    declare businessEmail: string | null;
    declare businessContact: string | null;
    declare businessExecutive: string | null;   
    declare isoBusinessCode: string | null;
    declare isdBusinessCode: string | null;
    declare businessDescription: string | null;
    // Login / contact info
    declare email: string;
    declare contact: string;
    declare countryCode: string | null;
    declare isoCode: string | null
    declare isdCode: string | null
    // Address info
    declare country: string | null;
    declare state: string | null;
    declare city: string | null;
    declare postcode: string | null;
    declare address: string;
    // Auth
    declare password: string | null;
    // Account details
    declare accounteHolderName: string | null;
    declare accountNumber: string | null;
    declare bankName: string | null;
    declare branchName: string | null;
    declare ifscCode: string | null;
    declare swiftCode: string | null;
    declare accountType: string | null;
    declare currency: string | null;
    declare taxVatId: string | null;

    // Flags
    declare isVip: boolean;
    declare isActive: boolean;
    declare isDeleted: boolean;
    declare isStatus: boolean;
    declare isApprove: boolean;
    declare isCredential: boolean;
    declare profileStatus: boolean;
    declare logo: string | null;
    declare payment: string | null;
    declare isEmailVerified: boolean;
    declare isRegistering: boolean;
    declare registrationStep: number;
    declare isMobileVerified: boolean;
    declare isFirstLogin: boolean;
    
    // Two-factor authentication
    declare twofactorEnabled: boolean;
    declare twofactorSecret: string | null;
    declare twofactorVerified: boolean;
    declare twofactorBackupCodes: string[] | null;

    // Timestamps
    declare createdAt: CreationOptional<Date>;
    declare updatedAt: CreationOptional<Date>;

    // validate password
    // validatePassword(this: Clients, userPass: string) {
    //     return checkPassword(userPass, this.password);
    // }
    // validate password
    validatePassword(this: Clients, userPass: string) {
        if (!this.password) return false;
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
                userId: {
                    type: DataTypes.UUID,
                    allowNull: true,

                },
                companyId: {
                    type: DataTypes.UUID,
                    allowNull: true,

                },
                userName: {
                    type: DataTypes.STRING(255),
                    allowNull: true,
                    defaultValue: null,
                },
                // Basic business info
                businessName: {
                    type: DataTypes.STRING(255),
                    allowNull: false,
                    // unique: {
                    //     name: "Clients_name",
                    //     msg: "Clients name must be unique",
                    // },
                },
                clientfirstName: {
                    type: DataTypes.STRING(255),
                    allowNull: false,
                },
                clientLastName: {
                    type: DataTypes.STRING(255),
                    allowNull: false,
                },
                businessBase: {
                    type: DataTypes.STRING(255),
                    allowNull: false,
                },
                businessTypeId: {
                    type: DataTypes.INTEGER,
                    allowNull: true,
                },
                businessSubCategory: {
                    type: DataTypes.JSON,
                    allowNull: true,
                    defaultValue: null,   // e.g. [1,2,5] (subcategory ids)
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
                businessExecutive: {
                    type: DataTypes.STRING(255),    
                    allowNull: true,
                },
                isoBusinessCode: {
                    type: DataTypes.STRING(255),
                    allowNull: true,
                },
                isdBusinessCode: {
                    type: DataTypes.STRING(255),
                    allowNull: true,
                },
                businessDescription: {
                    type: DataTypes.TEXT,
                    allowNull: true,
                },

                // Login / contact info
                email: {
                    type: DataTypes.STRING(255),
                    allowNull: false,
                    // unique: {
                    //     name: "email",
                    //     msg: "Email must be unique",
                    // },
                    // validate: {
                    //     isEmail: {
                    //         msg: "Invalid email format",
                    //     },
                    // },
                },
                contact: {
                    type: DataTypes.STRING(15),
                    allowNull: false,
                    // unique: {
                    //     name: "contact",
                    //     msg: "Contact number must be unique",
                    // },
                    // validate: {
                    //     notEmpty: {
                    //         msg: "Contact number cannot be empty",
                    //     },
                    // },
                },
                countryCode: {
                    type: DataTypes.STRING(10),
                    allowNull: true,
                    defaultValue: null,
                },
                isoCode: {
                    type: DataTypes.STRING(255)
                },
                isdCode: {
                    type: DataTypes.STRING(255)
                },

                // Address
                country: {
                    type: DataTypes.STRING(100),
                    allowNull: true,
                },
                state: {
                    type: DataTypes.STRING(100),
                    allowNull: true,
                },
                city: {
                    type: DataTypes.STRING(100),
                    allowNull: true,
                },
                postcode: {
                    type: DataTypes.STRING(20),
                    allowNull: true,
                },
                address: {
                    type: DataTypes.TEXT,
                    allowNull: true,
                },

                // Auth
                password: {
                    type: DataTypes.STRING(255),
                    allowNull: true,
                    defaultValue: null,
                    set(this: Clients, value: string | null) {
                        if (!value) {
                            this.setDataValue("password", null);
                            return;
                        }
                        const hash = hashPassword(value);
                        this.setDataValue("password", hash);
                    },
                },

                // Bank / account details
                accounteHolderName: {
                    type: DataTypes.STRING(255),
                    allowNull: true,
                    defaultValue: null,
                },
                accountNumber: {
                    type: DataTypes.STRING(50),
                    allowNull: true,
                    defaultValue: null,
                },
                bankName: {
                    type: DataTypes.STRING(255),
                    allowNull: true,
                    defaultValue: null,
                },
                branchName: {
                    type: DataTypes.STRING(255),
                    allowNull: true,
                    defaultValue: null,
                },
                ifscCode: {
                    type: DataTypes.STRING(50),
                    allowNull: true,
                    defaultValue: null,
                },
                swiftCode: {
                    type: DataTypes.STRING(50),
                    allowNull: true,
                    defaultValue: null,
                },
                accountType: {
                    type: DataTypes.STRING(50),
                    allowNull: true,
                    defaultValue: null,
                },
                currency: {
                    type: DataTypes.STRING(10),
                    allowNull: true,
                    defaultValue: null,
                },
                taxVatId: {
                    type: DataTypes.STRING(100),
                    allowNull: true,
                    defaultValue: null,
                },

                // Flags / extra info
                isVip: {
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
                isStatus: {
                    type: DataTypes.BOOLEAN,
                    allowNull: false,
                    defaultValue: true,
                },
                isApprove: {
                    type: DataTypes.BOOLEAN,
                    allowNull: false,
                    defaultValue: false,
                },
                isCredential: {
                    type: DataTypes.BOOLEAN,
                    allowNull: false,
                    defaultValue: false,
                },
                profileStatus: {
                    type: DataTypes.BOOLEAN,
                    allowNull: false,
                    defaultValue: false,
                },
                logo: {
                    type: DataTypes.STRING(255),
                    allowNull: true,
                    defaultValue: null,
                },
                payment: {
                    type: DataTypes.STRING(255),
                    allowNull: true,
                    defaultValue: null,
                },
                isEmailVerified: {
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
                isFirstLogin: {
                    type: DataTypes.BOOLEAN,
                    allowNull: false,
                    defaultValue: true,
                },
                
                // Two-factor authentication
                twofactorEnabled: {
                    type: DataTypes.BOOLEAN,
                    allowNull: false,
                    defaultValue: false,
                },
                twofactorSecret: {
                    type: DataTypes.STRING(255),
                    allowNull: true,
                    defaultValue: null,
                },
                twofactorVerified: {
                    type: DataTypes.BOOLEAN,
                    allowNull: false,
                    defaultValue: false,
                },
                twofactorBackupCodes: {
                    type: DataTypes.JSON,
                    allowNull: true,
                    defaultValue: null,
                },

                // timestamps
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


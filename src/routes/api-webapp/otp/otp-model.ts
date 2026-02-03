import {
    CreationOptional,
    DataTypes,
    InferCreationAttributes,
    InferAttributes,
    Model,
    Sequelize,
} from "sequelize";
import { hashPassword, checkPassword } from "../../../services/password-service";
import { User } from "../../../routes/api-webapp/authentication/user/user-model";
import {Clients } from "../../../routes/api-webapp/agency/clients/clients-model";

export class Otp extends Model<
    InferAttributes<Otp>,
    InferCreationAttributes<Otp>
> {
    declare id: CreationOptional<number>;
    declare userId: string | null; // UUID FK to User
    declare clientId: string | null; // UUID FK to Clients
    declare email: string | null;
    declare contact: string; // Number → String
    declare otp: string | null; // OTP for email
    declare mbOTP: string | null; // OTP for mobile
    declare loginOTP: string | null;
    declare otpVerify: boolean;
    declare otpExpiresAt: Date | null; // Expiry time for email otp
    declare mbOTPExpiresAt: Date | null; // Expiry time for mobile otp
     declare tempUserData: any | null;
    declare isDeleted: boolean;
    declare deletedAt: CreationOptional<Date>;
    declare isEmailVerified: boolean;
    declare isMobileVerified: boolean;
    declare isActive: boolean;
    declare createdAt: CreationOptional<Date>;
    declare updatedAt: CreationOptional<Date>;


    //validate password
    validatePassword(this: User, userPass: string) {
        return checkPassword(userPass, this.password);
    }

    static initModel(sequelize: Sequelize): typeof Otp {
        Otp.init(
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
                clientId: {
                    type: DataTypes.UUID,
                    allowNull: true,
                 
                },
                // userId: {
                //     type: DataTypes.INTEGER,
                //     allowNull: true,
                // },
                // clientId: {
                //     type: DataTypes.INTEGER,
                //     allowNull: true,
                // },
                contact: {
                    type: DataTypes.STRING(15),
                    allowNull: true,
                    unique: {
                        name: "contact",
                        msg: "Mobile number must be unique",
                    },
                    validate: {
                        notEmpty: {
                            msg: "Mobile number cannot be empty",
                        }
                    }
                },

                // mobile_number: {
                //   type: DataTypes.STRING(15),
                //   allowNull: false,
                //   unique: {
                //     name: "mobile_number",
                //     msg: "Mobile number must be unique",
                //   },
                // },
                email: {
                    type: DataTypes.STRING(255),
                    allowNull: false,
                },

                // role: {
                //   type: DataTypes.ENUM("driver", "passenger"),
                //   allowNull: false,
                // },

                otp: {
                    type: DataTypes.STRING,
                    allowNull: true
                },
                mbOTP: {
                    type: DataTypes.STRING,
                    allowNull: true
                },
                loginOTP: {
                    type: DataTypes.STRING,
                    allowNull: true
                },
                otpVerify: {
                    type: DataTypes.BOOLEAN,
                    allowNull: true,
                    defaultValue: false
                },
                otpExpiresAt: {
                    type: DataTypes.DATE,
                    allowNull: true,
                },
                mbOTPExpiresAt: {
                    type: DataTypes.DATE,
                    allowNull: true,
                },

                tempUserData: {
                    type: DataTypes.JSON,
                    allowNull: true,
                },
                isDeleted: {
                    type: DataTypes.BOOLEAN,
                    defaultValue: false,
                },
                deletedAt: {
                    type: DataTypes.DATE,
                    allowNull: true,
                },
                isEmailVerified: {
                    type: DataTypes.BOOLEAN,
                    defaultValue: false,
                },
                isMobileVerified: {
                    type: DataTypes.BOOLEAN,
                    defaultValue: false,
                },
                isActive: {
                    type: DataTypes.BOOLEAN,
                    defaultValue: true, // 
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
                modelName: "otp",
                tableName: "otp",
                timestamps: true
            }
        );

        return Otp;
    }
}

export const initOtpModel = (sequelize: Sequelize) => Otp.initModel(sequelize);
// export default User;

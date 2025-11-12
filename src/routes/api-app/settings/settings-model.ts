import {
    CreationOptional,
    DataTypes,
    InferCreationAttributes,
    InferAttributes,
    Model,
    Sequelize,
} from "sequelize";
// import { hashPassword, checkPassword } from "../../../services/password-service";



export class Settings extends Model<
    InferAttributes<Settings>,
    InferCreationAttributes<Settings>
> {
    declare id: CreationOptional<number>;
    declare name: string;
    //   declare email: string | null;
    //   declare mobile_number: string; // Number → String
    //   declare gender: string | null;
    //   declare dob: Date | null;
    //   declare loginType: "email" | "google" | "facebook";
    //   declare role: "driver" | "passenger"; // ENUM Fixed
    //   declare password: string; // only for email login
    //   declare deviceId: string;
    //   declare facebookId?: string;
    //   declare googleId?: string;
    //   declare fcmToken: string | null;
    //   declare otp: string | null;
    //   declare mbOTP: string | null;
    //   declare loginOTP: string | null;
    //   declare otpVerify: boolean;
    //   declare otpExpiresAt: Date | null;
    //   declare mbOTPExpiresAt: Date | null;
    //   declare profile_completed: boolean;
    // declare bankName: string;
    // declare bankAccountName: string;
    // declare bankAccountNumber: string;
    // declare bankIFSCCode: string;
    // declare panNo: string;
    // declare panCardImg: string;
    // declare aadharNo: string;
    declare aadharFrontImg: string;
    declare aadharBackImg: string;
    declare drivingLicenseFrontImg: string;
    declare drivingLicenseBackImg: string;
    declare dlNumber: string;
    declare addressProofId: number;
    declare addressProofImg: string;
    declare passportPhoto: string;

    declare isDeleted: boolean;
    declare deletedAt: CreationOptional<Date>;
    declare isEmailVerified: boolean;
    declare isMobileVerified: boolean;
    declare isActive: boolean;
    declare createdAt: CreationOptional<Date>;
    declare updatedAt: CreationOptional<Date>;

    //validate password
    //   validatePassword(this: Settings, userPass: string) {
    //     return checkPassword(userPass, this.password);
    //   }
    static initModel(sequelize: Sequelize): typeof Settings {
        Settings.init(
            {
                id: {
                    type: DataTypes.INTEGER,
                    primaryKey: true,
                    autoIncrement: true,
                    allowNull: true,
                    unique: true,
                },
                name: {
                    type: DataTypes.STRING(255),
                    allowNull: true,
                },
                // bankName: {
                //     type: DataTypes.STRING,
                //     allowNull: true,
                // },
                // bankAccountName: {
                //     type: DataTypes.STRING,
                //     allowNull: true,
                // },
                // bankAccountNumber: {
                //     type: DataTypes.STRING,
                //     allowNull: true,
                // },
                // bankIFSCCode: {
                //     type: DataTypes.STRING,
                //     allowNull: true,
                // },
                // panNo: {
                //     type: DataTypes.STRING,
                //     allowNull: true,
                // },
                // panCardImg: {
                //     type: DataTypes.STRING,
                //     allowNull: true,
                // },
                // aadharNo: {
                //     type: DataTypes.STRING,
                //     allowNull: true,
                // },
                aadharFrontImg: {
                    type: DataTypes.STRING,
                    allowNull: true,
                },
                aadharBackImg: {
                    type: DataTypes.STRING,
                    allowNull: true,
                },
                drivingLicenseFrontImg: {
                 type: DataTypes.STRING,
                allowNull: true,
            },
                drivingLicenseBackImg: {
                    type:DataTypes.STRING,
                    allowNull: true,
                },
                dlNumber: {
                    type: DataTypes.STRING,
                    allowNull: true,
                },
                addressProofId: {
                    type: DataTypes.INTEGER,
                    allowNull: true,
                },
                addressProofImg: {
                    type: DataTypes.STRING,
                    allowNull: true,
                },
                passportPhoto: {
                    type: DataTypes.STRING,
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
                    allowNull: true,
                    defaultValue: DataTypes.NOW,
                },
                updatedAt: {
                    type: DataTypes.DATE,
                    allowNull: true,
                    defaultValue: DataTypes.NOW,
                },
            },
            {
                sequelize,
                freezeTableName: true,
                tableName: "settings",
                timestamps: true
            }
        );

        return Settings;
    }
}

export const initSettingsModel = (sequelize: Sequelize) => Settings.initModel(sequelize);
// export default User;

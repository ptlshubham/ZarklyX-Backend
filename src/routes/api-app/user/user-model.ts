import {
  CreationOptional,
  DataTypes,
  InferCreationAttributes,
  InferAttributes,
  Model,
  Sequelize,
} from "sequelize";
import { hashPassword, checkPassword } from "../../../services/password-service";

export class User extends Model<
  InferAttributes<User>,
  InferCreationAttributes<User>
> {
  declare id: CreationOptional<number>;
  declare name: string;
  declare email: string | null;
  declare mobile_number: string; // Number → String
  declare gender: string | null;
  declare dob: Date | null;
  declare countryCode: string;
  declare loginType: "email" | "google" | "facebook";
  // declare role: "driver" | "passenger"; // ENUM Fixed
  declare password: string; // only for email login
  declare deviceId: string;
  declare facebookId?: string;
  declare googleId?: string;
  declare fcmToken: string | null;
  declare otp: string | null;
  declare mbOTP: string | null;
  declare loginOTP: string | null;
  declare otpVerify: boolean;
  declare otpExpiresAt: Date | null;
  declare mbOTPExpiresAt: Date | null;
  declare profile_completed: boolean;
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
  static initModel(sequelize: Sequelize): typeof User {
    User.init(
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
        },
        mobile_number: {
          type: DataTypes.STRING(15),
          allowNull: true,
          unique: {
            name: "mobile_number",
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
          unique: {
            name: "email",
            msg: "Email must be unique",
          },
        },
        gender: {
          type: DataTypes.STRING,
          allowNull: true,
        },
        dob: {
          type: DataTypes.DATEONLY,
          allowNull: true,
        },
         countryCode: {
                    type: DataTypes.STRING,
                    allowNull: false,
                },
        loginType: {
          type: DataTypes.ENUM("email", "google", "facebook"),
          allowNull: false,
          defaultValue: "email",
        },
        // role: {
        //   type: DataTypes.ENUM("driver", "passenger"),
        //   allowNull: false,
        // },
        password: {
          type: DataTypes.STRING(255),
          set(this: User, value: string) {
            if (!value) return;
            let hash = null;
            hash = hashPassword(value);
            this.setDataValue("password", hash);
          },
          allowNull: true,
        },
        deviceId: {
          type: DataTypes.STRING,
          allowNull: true
        },
        facebookId: {
          type: DataTypes.STRING,
          allowNull: true,
          // unique: true,
          comment: "Facebook account ID (used for Facebook login)",
        },
        googleId: {
          type: DataTypes.STRING,
          allowNull: true,
        },
        fcmToken: {
          type: DataTypes.TEXT,
          allowNull: true,
        },
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
        profile_completed: {
          type: DataTypes.BOOLEAN,
          defaultValue: false,
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
        freezeTableName: true,
        tableName: "user",
        timestamps: true
      }
    );

    return User;
  }
}

export const initUserModel = (sequelize: Sequelize) => User.initModel(sequelize);
// export default User;

import {
    CreationOptional,
    DataTypes,
    InferCreationAttributes,
    InferAttributes,
    Model,
    Sequelize,
} from "sequelize";
import { checkPassword, hashPassword } from "../../../../services/password-service";

export class User extends Model<
    InferAttributes<User>,
    InferCreationAttributes<User>
> {
    declare id: CreationOptional<string>; // UUID
    declare referId: string;
    declare companyId: string | null;
    declare firstName: string;
    declare lastName: string;
    declare email: string | null;
    declare contact: string; // Number → String
    declare userType: string | null;
    declare secretCode: string | null;
    declare isThemeDark: boolean;
    declare password: string;
    declare countryCode: string | null;
    // categories is stored as a single category ID string
    declare categories: string | null;

    // Two-factor authentication
    declare twofactorEnabled: boolean;
    declare twofactorSecret: string | null;
    declare twofactorVerified: boolean;
    declare twofactorBackupCodes: string[] | null;

    // Temporary 2FA setup fields
    declare temp2FACode: string | null;
    declare temp2FACodeExpiry: Date | null;
    declare temp2FASecret: string | null;
    declare temp2FASecretExpiry: Date | null;

    declare isDeleted: boolean;
    declare deletedAt: CreationOptional<Date | null>;
    declare isEmailVerified: boolean;
    declare isRegistering: boolean;
    declare registrationStep: number;
    declare isMobileVerified: boolean;
    declare isActive: boolean;
    declare googleId: string | null;
    declare appleId: string | null;
    declare authProvider: string;
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
                    type: DataTypes.UUID,
                    defaultValue: DataTypes.UUIDV4,
                    primaryKey: true,
                    allowNull: false,
                    unique: true,
                },
                companyId: {
                    type: DataTypes.UUID,
                    allowNull: true,
                    defaultValue: null,
                },
                referId: {
                    type: DataTypes.STRING,
                    allowNull: true
                },
                firstName: {
                    type: DataTypes.STRING,
                    allowNull: true,
                },
                lastName: {
                    type: DataTypes.STRING,
                    allowNull: true,
                },
                contact: {
                    type: DataTypes.STRING(15),
                    allowNull: true,
                    validate: {
                        notEmpty: {
                            msg: "Contact number cannot be empty",
                        }
                    }
                },
                email: {
                    type: DataTypes.STRING(255),
                    allowNull: false,
                },
                userType: {
                    type: DataTypes.ENUM("agency", "freelancer", "client", "employee"),
                    allowNull: true,
                    defaultValue: null,
                },
                secretCode: {
                    type: DataTypes.STRING,
                    allowNull: true,
                },
                isThemeDark: {
                    type: DataTypes.BOOLEAN,
                    allowNull: true,
                    defaultValue: false,
                },
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
                countryCode: {
                    type: DataTypes.STRING(10),
                    allowNull: true,
                    defaultValue: null,
                },

                categories: {
                    type: DataTypes.STRING(255),
                    allowNull: true,
                    defaultValue: null,
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
                // Temporary 2FA setup fields
                temp2FACode: {
                    type: DataTypes.STRING(6),
                    allowNull: true,
                    defaultValue: null,
                },
                temp2FACodeExpiry: {
                    type: DataTypes.DATE,
                    allowNull: true,
                    defaultValue: null,
                },
                temp2FASecret: {
                    type: DataTypes.STRING(255),
                    allowNull: true,
                    defaultValue: null,
                },
                temp2FASecretExpiry: {
                    type: DataTypes.DATE,
                    allowNull: true,
                    defaultValue: null,
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
                isActive: {
                    type: DataTypes.BOOLEAN,
                    defaultValue: true, // 
                },
                googleId: {
                    type: DataTypes.STRING,
                    allowNull: true,
                    // Removed unique constraint to stay within MySQL 64-key limit
                },
                appleId: {
                    type: DataTypes.STRING,
                    allowNull: true,
                    // Removed unique constraint to stay within MySQL 64-key limit
                },
                authProvider: {
                    type: DataTypes.ENUM("email", "google", "apple"),
                    allowNull: false,
                    defaultValue: "email",
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

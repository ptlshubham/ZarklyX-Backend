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
    // declare categories: "food" | "healthCare" | "NGos";
    // categories is stored as JSON; it can be a single category id (string),
    // an array of category ids, or null.
    declare categories: string | string[] | null;
    declare isDeleted: boolean;
    declare deletedAt: CreationOptional<Date | null>;
    // declare deletedAt: CreationOptional<Date>;
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
                    unique: {
                        name: "contact",
                        msg: "Contact number must be unique",
                    },
                    validate: {
                        notEmpty: {
                            msg: "Contact number cannot be empty",
                        }
                    }
                },
                email: {
                    type: DataTypes.STRING(255),
                    allowNull: false,
                    unique: {
                        name: "email",
                        msg: "Email must be unique",
                    },
                },
                userType: {
                    type: DataTypes.ENUM("organization", "freelancer"),
                    allowNull: true,
                    defaultValue: null,
                },
                secretCode: {
                    type: DataTypes.STRING,
                    allowNull: true,
                    unique: {
                        name: "secretCode",
                        msg: "secret Code must be unique",
                    }
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
                    // 👈 NEW FIELD
                    type: DataTypes.STRING(10),
                    allowNull: true,
                    defaultValue: null,
                },

                categories: {
                    type: DataTypes.JSON,
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
                    unique: true,
                },
                appleId: {
                    type: DataTypes.STRING,
                    allowNull: true,
                    unique: true,
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

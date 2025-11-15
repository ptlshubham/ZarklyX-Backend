import {
    CreationOptional,
    DataTypes,
    InferCreationAttributes,
    InferAttributes,
    Model,
    Sequelize,
} from "sequelize";

export class User extends Model<
    InferAttributes<User>,
    InferCreationAttributes<User>
> {
    declare id: CreationOptional<number>;
    declare referId: string;
    declare firstName: string;
    declare lastName: string;
    declare email: string | null;
    declare contact: string; // Number → String
    declare userType: "organization" | "freelancer";
    declare secretCode: string | null;
    declare isthemedark: boolean;
    declare categories: string[] | null; 
    declare isDeleted: boolean;
    declare deletedAt: CreationOptional<Date>;
    declare isEmailVerified: boolean;
    declare isMobileVerified: boolean;
    declare isActive: boolean;
    declare createdAt: CreationOptional<Date>;
    declare updatedAt: CreationOptional<Date>;

 
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

                // contact: {
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

                userType: {
                    type: DataTypes.ENUM("organization", "freelancer"),
                    allowNull: false,
                },
                secretCode: {
                    type: DataTypes.STRING,
                    allowNull: true,
                    unique: {
                        name: "secretCode",
                        msg: "secret Code must be unique",
                    }
                },
                isthemedark: {
                        type: DataTypes.BOOLEAN,
                        allowNull: true,
                        defaultValue: false,
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

import {
    CreationOptional,
    DataTypes,
    InferCreationAttributes,
    InferAttributes,
    Model,
    Sequelize,
} from "sequelize";
import { hashPassword, checkPassword } from "../../../services/password-service";
export class Influencer extends Model<
    InferAttributes<Influencer>,
    InferCreationAttributes<Influencer>
> {
    declare id: CreationOptional<string>;
    declare firstName: string | null;
    declare lastName: string | null;
    declare contact: string | null;
    declare role: string | null;
    declare email: string | null;
    declare password: string | null; // Added password field to the Influencer model
    declare authProvider: string | null; // Added authProvider field to Influencer model
    declare gender: string | null;
    declare dob: Date | null;
    declare country: string | null;
    declare state: string | null;
    declare city: string | null;
    declare pincode: string | null;
    declare address: string | null;
    declare bio: string | null;
    declare profile_image: string | null;
    declare profile_cover: string | null;
    declare isfirstlogin: boolean;
    declare createddate: CreationOptional<Date>;
    declare updateddate: Date | null;
    declare isActive: boolean; // Added isActive field to the Influencer model
    declare isDeleted: boolean; // Added isDeleted field to the Influencer model
    declare otpSecret: string | null; // Added otpSecret field to the Influencer model
    declare twoFactorSecret: string | null; // Added twoFactorSecret field to the Influencer model

    //validate password
    validatePassword(this: Influencer, userPass: string) {
        if (!this.password) {
            throw new Error("Password not set for this influencer");
        }
        return checkPassword(userPass, this.password);
    }
    static initModel(sequelize: Sequelize): typeof Influencer {
        Influencer.init(
            {
                id: {
                    type: DataTypes.UUID,
                    primaryKey: true,
                    allowNull: false,
                    defaultValue: DataTypes.UUIDV4,
                },
                firstName: {
                    type: DataTypes.STRING,
                    allowNull: false,
                },
                lastName: {
                    type: DataTypes.STRING,
                    allowNull: false,
                },
                contact: {
                    type: DataTypes.STRING(15),
                    allowNull: false,
                },
                role: {
                    type: DataTypes.STRING,
                    allowNull: true,
                },
                email: {
                    type: DataTypes.STRING,
                    allowNull: true,
                },
                gender: {
                    type: DataTypes.STRING,
                    allowNull: true,
                },
                dob: {
                    type: DataTypes.DATE,
                    allowNull: true,
                },
                country: {
                    type: DataTypes.STRING,
                    allowNull: true,
                },
                state: {
                    type: DataTypes.STRING,
                    allowNull: true,
                },
                city: {
                    type: DataTypes.STRING,
                    allowNull: true,
                },
                pincode: {
                    type: DataTypes.STRING,
                    allowNull: true,
                },
                address: {
                    type: DataTypes.STRING,
                    allowNull: true,
                },
                category: {
                    type: DataTypes.STRING,
                    allowNull: true,
                },
                platform: {
                    type: DataTypes.STRING,
                    allowNull: true,
                },
                bio: {
                    type: DataTypes.STRING,
                    allowNull: true,
                },
                profile_image: {
                    type: DataTypes.STRING,
                    allowNull: true,
                },
                profile_cover: {
                    type: DataTypes.STRING,
                    allowNull: true,
                },
                isfirstlogin: {
                    type: DataTypes.BOOLEAN,
                    allowNull: true,
                },
                createddate: {
                    type: DataTypes.DATE,
                    allowNull: false,
                    defaultValue: DataTypes.NOW,
                },
                updateddate: {
                    type: DataTypes.DATE,
                    allowNull: true,
                },
                password: {
                    type: DataTypes.STRING,
                    allowNull: true,
                }, // Updated the Sequelize model definition
                authProvider: {
                    type: DataTypes.STRING,
                    allowNull: true,
                }, // Added authProvider field to Influencer model
                isActive: {
                    type: DataTypes.BOOLEAN,
                    allowNull: false,
                    defaultValue: true,
                }, // Added isActive field to the Influencer model
                isDeleted: {
                    type: DataTypes.BOOLEAN,
                    allowNull: false,
                    defaultValue: false,
                }, // Added isDeleted field to the Influencer model
                otpSecret: {
                    type: DataTypes.STRING,
                    allowNull: true,
                }, // Added otpSecret field to the Influencer model
                twoFactorSecret: {
                    type: DataTypes.STRING,
                    allowNull: true,
                }, // Added twoFactorSecret field to the Influencer model
            },
            {
                sequelize,
                modelName: "Influencer",
                tableName: "influencer",
                timestamps: true,
            }
        );

        return Influencer;
    }
}

export const initInfluencerModel = (sequelize: Sequelize) => Influencer.initModel(sequelize);


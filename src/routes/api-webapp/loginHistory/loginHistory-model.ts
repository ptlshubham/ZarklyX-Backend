import {
    CreationOptional,
    DataTypes,
    InferCreationAttributes,
    InferAttributes,
    Model,
    Sequelize,
} from "sequelize";

export class LoginHistory extends Model<
    InferAttributes<LoginHistory>,
    InferCreationAttributes<LoginHistory>
> {
    declare id: CreationOptional<string>;
    declare userId: string;
    declare sessionId: string | null;
    declare tokenId: string | null;
    declare loginTime: CreationOptional<Date>;
    declare logoutTime: Date | null;
    declare ipAddress: string | null;
    declare device: string | null;
    declare browser: string | null;
    declare os: string | null;
    declare userAgent: string | null;
    declare location: string | null;
    declare loginType: "GOOGLE" | "APPLE" | "OTP" | "PASSWORD";
    declare status: "SUCCESS" | "FAILED";
    declare failReason: string | null;
    declare createdAt: CreationOptional<Date>;

    static initModel(sequelize: Sequelize): typeof LoginHistory {
        LoginHistory.init(
            {
                id: {
                    type: DataTypes.UUID,
                    defaultValue: DataTypes.UUIDV4,
                    primaryKey: true,
                    allowNull: false,
                },
                userId: {
                    type: DataTypes.UUID,
                    allowNull: false,
                },
                sessionId: {
                    type: DataTypes.STRING(100),
                    allowNull: true,
                },
                tokenId: {
                    type: DataTypes.STRING(255),
                    allowNull: true,
                },
                loginTime: {
                    type: DataTypes.DATE,
                    defaultValue: DataTypes.NOW,
                },
                logoutTime: {
                    type: DataTypes.DATE,
                    allowNull: true,
                },
                ipAddress: {
                    type: DataTypes.STRING(45),
                    allowNull: true,
                },
                device: {
                    type: DataTypes.STRING(255),
                    allowNull: true,
                },
                browser: {
                    type: DataTypes.STRING(100),
                    allowNull: true,
                },
                os: {
                    type: DataTypes.STRING(100),
                    allowNull: true,
                },
                userAgent: {
                    type: DataTypes.TEXT,
                    allowNull: true,
                },
                location: {
                    type: DataTypes.STRING(255),
                    allowNull: true,
                },
                loginType: {
                    type: DataTypes.ENUM("GOOGLE", "APPLE", "OTP", "PASSWORD"),
                    allowNull: false,
                },
                status: {
                    type: DataTypes.ENUM("SUCCESS", "FAILED"),
                    allowNull: false,
                },
                failReason: {
                    type: DataTypes.STRING(255),
                    allowNull: true,
                },
                createdAt: {
                    type: DataTypes.DATE,
                    defaultValue: DataTypes.NOW,
                },
            },
            {
                sequelize,
                tableName: "login_history",
                timestamps: false,
                indexes: [
                    { fields: ["userId", "loginTime"] },
                    { fields: ["loginType"] },
                    { fields: ["status"] },
                    { fields: ["sessionId"] },
                ],
            }
        );

        return LoginHistory;
    }

    static associate(models: any) {
        LoginHistory.belongsTo(models.User, {
            foreignKey: "userId",
            as: "user",
        });
    }
}

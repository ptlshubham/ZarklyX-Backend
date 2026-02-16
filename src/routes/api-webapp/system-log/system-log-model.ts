import {
    CreationOptional,
    DataTypes,
    InferAttributes,
    InferCreationAttributes,
    Model,
    Sequelize,
} from "sequelize";

export class SystemLog extends Model<
    InferAttributes<SystemLog>,
    InferCreationAttributes<SystemLog>
> {
    declare id: CreationOptional<string>;

    declare companyId: string;
    declare userId: string;

    declare module: string;
    declare operation: string;
    declare action: string;

    declare status: "SUCCESS" | "FAILED";

    declare requestMethod: string;
    declare requestPath: string;

    declare ipAddress: string | null;
    declare userAgent: string | null;

    declare metadata: object | null;
    declare errorMessage: string | null;
    
    declare createdAt: CreationOptional<Date>;
    
    static initModel(sequelize: Sequelize): typeof SystemLog {
        SystemLog.init(
            {
                id: {
                    type: DataTypes.UUID,
                    primaryKey: true,
                    defaultValue: DataTypes.UUIDV4,
                },
                companyId: {
                    type: DataTypes.UUID,
                    allowNull: false,
                },
                userId: {
                    type: DataTypes.UUID,
                    allowNull: false,
                },
                module: {
                    type: DataTypes.STRING(50),
                    allowNull: false,
                },
                operation: {
                    type: DataTypes.STRING(50),
                    allowNull: false,
                },
                action: {
                    type: DataTypes.STRING(255),
                    allowNull: false,
                },
                status: {
                    type: DataTypes.ENUM("SUCCESS", "FAILED"),
                    allowNull: false,
                },
                requestMethod: {
                    type: DataTypes.STRING(10),
                    allowNull: false,
                },
                requestPath: {
                    type: DataTypes.STRING(255),
                    allowNull: false,
                },
                ipAddress: {
                    type: DataTypes.STRING(50),
                    allowNull: true,
                },
                userAgent: {
                    type: DataTypes.TEXT,
                    allowNull: true,
                },
                metadata: {
                    type: DataTypes.JSON,
                    allowNull: true,
                },
                errorMessage: {
                    type: DataTypes.TEXT,
                    allowNull: true,
                },
                createdAt: {
                    type: DataTypes.DATE,
                    allowNull: false,
                    defaultValue: DataTypes.NOW,
                },
            },
            {
                sequelize,
                tableName: "system_logs",
                modelName: "system_logs",
                timestamps: false,
                indexes: [
                    {
                        fields: ["companyId"],
                        name: "idx_system_logs_company",
                    },
                    {
                        fields: ["userId"],
                        name: "idx_system_logs_user",
                    },
                ],
            }
        );

        return SystemLog;
    }
}

export const initSystemLogModel = (sequelize: Sequelize) => SystemLog.initModel(sequelize);
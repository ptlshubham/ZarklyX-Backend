import {
    CreationOptional,
    DataTypes,
    InferAttributes,
    InferCreationAttributes,
    Model,
    Sequelize,
} from "sequelize";

export class EmployeeDocument extends Model<
    InferAttributes<EmployeeDocument>,
    InferCreationAttributes<EmployeeDocument>
> {
    declare id: CreationOptional<string>; // UUID
    declare employeeId: string; // FK to Employee
    declare companyId: string; // FK to Company
    declare documentPath: string; // Path to the document file
    declare createdAt: CreationOptional<Date>;
    declare updatedAt: CreationOptional<Date>;

    static initModel(sequelize: Sequelize): typeof EmployeeDocument {
        EmployeeDocument.init(
            {
                id: {
                    type: DataTypes.UUID,
                    defaultValue: DataTypes.UUIDV4,
                    primaryKey: true,
                    allowNull: false,
                    unique: true,
                },
                employeeId: {
                    type: DataTypes.UUID,
                    allowNull: false,
                    references: {
                        model: "employee",
                        key: "id",
                    },
                },
                companyId: {
                    type: DataTypes.UUID,
                    allowNull: false,
                    references: {
                        model: "company",
                        key: "id",
                    },
                },
                documentPath: {
                    type: DataTypes.STRING(500),
                    allowNull: false,
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
                tableName: "employee_document",
                timestamps: true,
                indexes: [
                    {
                        fields: ["employeeId"],
                        name: "idx_employee_document_employeeId",
                    },
                    {
                        fields: ["companyId"],
                        name: "idx_employee_document_companyId",
                    },
                ],
            }
        );

        return EmployeeDocument;
    }
}

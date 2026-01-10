import {
    CreationOptional,
    DataTypes,
    InferAttributes,
    InferCreationAttributes,
    Model,
    Sequelize,
} from "sequelize";

export class PayrollTransaction extends Model<
    InferAttributes<PayrollTransaction>,
    InferCreationAttributes<PayrollTransaction>
> {
    // Primary
    declare id: CreationOptional<string>;

    // Relations
    declare companyId: string;
    declare employeeId: string;

    // Payroll Period
    declare salaryMonth: string; // YYYY-MM
    declare valueDate: Date;

    // Attendance Summary
    declare totalWorkingDays: number;
    declare extraDays: number | null;
    declare extraDayAmount: number | null;
    declare extraHours: number | null;
    declare extraHourAmount: number | null;
    declare halfLeaveCount: number | null;
    declare halfLeaveAmount: number | null;
    declare fullLeaveCount: number | null;
    declare fullLeaveAmount: number | null;
    declare lateCount: number | null;
    declare lateChargeAmount: number | null;

    // Earnings
    declare basicSalary: number;
    declare bonus: number | null;
    declare incentive: number | null;
    declare otherAllowance: number | null;
    declare grossSalary: number;

    // Deductions
    declare providentFundAmount: number | null;
    declare uniformCharge: number | null;
    declare advanceDeduction: number | null;
    declare otherDeductionAmount: number | null;
    declare otherDeductionReason: string | null;
    declare totalDeduction: number;
    declare netPay: number;

    // Status
    declare status: "pending" | "approved" | "paid";

    // Soft Delete
    declare isDeleted: CreationOptional<boolean>;

    // Timestamps
    declare createdAt: CreationOptional<Date>;
    declare updatedAt: CreationOptional<Date>;

    static initModel(sequelize: Sequelize): typeof PayrollTransaction {
        PayrollTransaction.init(
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
                    allowNull: false,
                    references: {
                        model: "company",
                        key: "id",
                    },
                },
                employeeId: {
                    type: DataTypes.UUID,
                    allowNull: false,
                    references: {
                        model: "employee",
                        key: "id",
                    },
                },
                salaryMonth: {
                    type: DataTypes.STRING(7), // YYYY-MM
                    allowNull: false,
                },
                valueDate: {
                    type: DataTypes.DATE,
                    allowNull: false,
                },
                totalWorkingDays: {
                    type: DataTypes.INTEGER,
                    allowNull: false,
                },
                extraDays: {
                    type: DataTypes.INTEGER,
                    allowNull: true,
                },
                extraDayAmount: {
                    type: DataTypes.DECIMAL(12, 2),
                    allowNull: true,
                },
                extraHours: {
                    type: DataTypes.DECIMAL(5, 2),
                    allowNull: true,
                },
                extraHourAmount: {
                    type: DataTypes.DECIMAL(12, 2),
                    allowNull: true,
                },
                halfLeaveCount: {
                    type: DataTypes.INTEGER,
                    allowNull: true,
                },
                halfLeaveAmount: {
                    type: DataTypes.DECIMAL(12, 2),
                    allowNull: true,
                },
                fullLeaveCount: {
                    type: DataTypes.INTEGER,
                    allowNull: true,
                },
                fullLeaveAmount: {
                    type: DataTypes.DECIMAL(12, 2),
                    allowNull: true,
                },
                lateCount: {
                    type: DataTypes.INTEGER,
                    allowNull: true,
                },
                lateChargeAmount: {
                    type: DataTypes.DECIMAL(12, 2),
                    allowNull: true,
                },
                basicSalary: {
                    type: DataTypes.DECIMAL(12, 2),
                    allowNull: false,
                },
                bonus: {
                    type: DataTypes.DECIMAL(12, 2),
                    allowNull: true,
                },
                incentive: {
                    type: DataTypes.DECIMAL(12, 2),
                    allowNull: true,
                },
                otherAllowance: {
                    type: DataTypes.DECIMAL(12, 2),
                    allowNull: true,
                },
                grossSalary: {
                    type: DataTypes.DECIMAL(12, 2),
                    allowNull: false,
                },
                providentFundAmount: {
                    type: DataTypes.DECIMAL(12, 2),
                    allowNull: true,
                },
                uniformCharge: {
                    type: DataTypes.DECIMAL(12, 2),
                    allowNull: true,
                },
                advanceDeduction: {
                    type: DataTypes.DECIMAL(12, 2),
                    allowNull: true,
                },
                otherDeductionAmount: {
                    type: DataTypes.DECIMAL(12, 2),
                    allowNull: true,
                },
                otherDeductionReason: {
                    type: DataTypes.STRING(255),
                    allowNull: true,
                },
                totalDeduction: {
                    type: DataTypes.DECIMAL(12, 2),
                    allowNull: false,
                },
                netPay: {
                    type: DataTypes.DECIMAL(12, 2),
                    allowNull: false,
                },
                status: {
                    type: DataTypes.ENUM("pending", "approved", "paid"),
                    defaultValue: "pending",
                    allowNull: false,
                },
                isDeleted: {
                    type: DataTypes.BOOLEAN,
                    defaultValue: false,
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
                tableName: "employee_payroll",
                freezeTableName: true,
                timestamps: true,
                indexes: [
                    {
                        unique: true,
                        fields: ["companyId", "employeeId", "salaryMonth"],
                        name: "unique_employee_payroll_month",
                    },
                    {
                        fields: ["companyId"],
                        name: "idx_payroll_company",
                    },
                    {
                        fields: ["employeeId"],
                        name: "idx_payroll_employee",
                    },
                    {
                        fields: ["salaryMonth"],
                        name: "idx_payroll_salary_month",
                    },
                ],
            }
        );

        return PayrollTransaction;
    }
}

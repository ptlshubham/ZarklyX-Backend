import {
    CreationOptional,
    DataTypes,
    InferAttributes,
    InferCreationAttributes,
    Model,
    Sequelize,
} from "sequelize";

export class Employee extends Model<
    InferAttributes<Employee>,
    InferCreationAttributes<Employee>
> {
    // Basic Identification
    declare id: CreationOptional<string>; // UUID
    declare userId: string; // FK to User table - stores basic entry (firstName, lastName, email, contact)
    declare companyId: string; // FK to Company
    declare employeeId: string; // Unique Employee ID
    declare departmentId: number | null;
    declare reportingManagerId: string | null; // FK to another Employee

    // ✅ 1. PERSONAL INFORMATION (STORED IN USER TABLE)
    // firstName, lastName, email, contact, countryCode are in USER table
    // Only employee-specific personal info stored here:
    declare dateOfBirth: Date | null;
    declare gender: string | null; // "Male", "Female", "Other"
    declare nationality: string | null;
    declare maritalStatus: string | null; // "Single", "Married", "Divorced", "Widowed"
    declare bloodGroup: string | null; // "O+", "O-", "A+", "A-", "B+", "B-", "AB+", "AB-"
    declare emergencyContactName: string | null;
    declare emergencyContactNumber: string | null;
    declare emergencyContactRelationship: string | null;
    declare permanentAddress: string | null;
    declare currentAddress: string | null;
    declare isoCode: string | null; // ISO country code
    declare isdCode: string | null; // ISD country code

    // ✅ 2. EMPLOYMENT DETAILS
    declare designation: string | null; // Job Title
    declare dateOfJoining: Date | null;
    declare employmentType: string | null; // "Full-time", "Part-time", "Contract", "Intern", "Consultant"
    declare workLocation: string | null;
    declare employeeStatus: string | null; // "Active", "Terminated", "On Leave", "Resigned"

    // ✅ 3. IDENTITY VERIFICATION
    declare aadharNumber: string | null;
    declare panNumber: string | null;
    declare passportNumber: string | null;
    declare drivingLicenseNumber: string | null;
    declare voterIdNumber: string | null;
    declare aadharDocumentPath: string | null;
    declare panDocumentPath: string | null;

    // ✅ 4. BANKING & PAYROLL DETAILS
    declare bankAccountHolderName: string | null;
    declare bankName: string | null;
    declare bankBranchName: string | null;
    declare bankAccountNumber: string | null;
    declare ifscCode: string | null;
    declare salary: number | null; // CTC
    declare basicSalary: number | null;
    declare hra: number | null; // House Rent Allowance
    declare allowances: number | null;
    declare pfNumber: string | null;
    declare esicNumber: string | null;
    declare uanNumber: string | null;
    declare paymentMode: string | null; // "Bank Transfer", "UPI", "Cash", "Check", "Wire Transfer", "NetBanking", "Card", "NEFT", "RTGS"

    // ✅ 5. WORK & EXPERIENCE DETAILS
    declare previousCompanyName: string | null;
    declare totalExperienceYears: number | null;
    declare lastCtc: number | null;
    declare skills: string[] | null; // JSON array
    declare resumeFilePath: string | null;
    declare certificatesFilePath: string[] | null; // JSON array of paths

    // ✅ 6. HR & COMPLIANCE DETAILS
    declare probationPeriod: number | null; // in days/months
    declare confirmationDate: Date | null;
    declare workShift: string | null; // "General", "Day", "Night", "Shift", "Flexible", "Remote", "Hybrid", "Other"
    declare attendanceType: string | null; // "Biometric", "Manual", "Online", "Offline", "App-based", "Other"
    declare leavePolicyAssigned: string | null;
    declare ndaStatus: boolean | null;
    declare offerLetterPath: string | null;
    declare appointmentLetterPath: string | null;

    // ✅ 7. SYSTEM & ACCESS DETAILS
    declare officialEmailId: string | null;
    declare emailPasswordDelivered: boolean | null;
    declare systemLaptopAssigned: boolean | null;
    declare assetId: string | null;
    declare crmAccessGiven: boolean | null;
    declare hrmsAccessGiven: boolean | null;
    declare driveAccessGiven: boolean | null;
    declare adminToolsAccess: boolean | null;
    declare accessCardIssued: boolean | null;

    // ✅ 8. OPTIONAL BUT USEFUL
    declare profilePhoto: string | null;
    declare tshirtUniformSize: string | null;
    declare workFromHomeEligibility: boolean | null;
    declare linkedInProfile: string | null;
    declare healthIssues: string | null; // Voluntary info

    // Status & Tracking
    declare isActive: boolean;
    declare isDeleted: boolean;
    declare profileStatus: string | null; // "Incomplete", "Complete", "Pending Approval"
    declare registrationStep: number;

    // Timestamps
    declare createdAt: CreationOptional<Date>;
    declare updatedAt: CreationOptional<Date>;

    static initModel(sequelize: Sequelize): typeof Employee {
        Employee.init(
            {
                id: {
                    type: DataTypes.UUID,
                    defaultValue: DataTypes.UUIDV4,
                    primaryKey: true,
                    allowNull: false,
                    unique: true,
                },
                userId: {
                    type: DataTypes.UUID,
                    allowNull: false,
                    references: {
                        model: "user",
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
                employeeId: {
                    type: DataTypes.STRING(50),
                    allowNull: false,
                },
                departmentId: {
                    type: DataTypes.STRING,
                    allowNull: true,
                },
                reportingManagerId: {
                    type: DataTypes.UUID,
                    allowNull: true,
                },
                // Personal Information (firstName, lastName from User table)
                dateOfBirth: {
                    type: DataTypes.DATE,
                    allowNull: true,
                },
                gender: {
                    type: DataTypes.ENUM("Male", "Female", "Other"),
                    allowNull: true,
                },
                nationality: {
                    type: DataTypes.STRING(100),
                    allowNull: true,
                },
                maritalStatus: {
                    type: DataTypes.ENUM("Single", "Married", "Divorced", "Widowed"),
                    allowNull: true,
                },
                bloodGroup: {
                    type: DataTypes.ENUM(
                        "O+", "O-", "A+", "A-", "B+", "B-", "AB+", "AB-"
                    ),
                    allowNull: true,
                },
                emergencyContactName: {
                    type: DataTypes.STRING(255),
                    allowNull: true,
                },
                emergencyContactNumber: {
                    type: DataTypes.STRING(15),
                    allowNull: true,
                },
                emergencyContactRelationship: {
                    type: DataTypes.STRING(50),
                    allowNull: true,
                },
                permanentAddress: {
                    type: DataTypes.TEXT,
                    allowNull: true,
                },
                currentAddress: {
                    type: DataTypes.TEXT,
                    allowNull: true,
                },
                isoCode: {
                    type: DataTypes.STRING(10),
                    allowNull: true,
                },
                isdCode: {
                    type: DataTypes.STRING(10),
                    allowNull: true,
                },
                // Employment Details
                designation: {
                    type: DataTypes.STRING(100),
                    allowNull: true,
                },
                dateOfJoining: {
                    type: DataTypes.DATE,
                    allowNull: true,
                },
                employmentType: {
                    type: DataTypes.ENUM("Full-time", "Part-time", "Contract", "Intern", "Consultant"),
                    allowNull: true,
                },
                workLocation: {
                    type: DataTypes.STRING(255),
                    allowNull: true,
                },
                employeeStatus: {
                    type: DataTypes.ENUM("Active", "Terminated", "On Leave", "Resigned"),
                    defaultValue: "Active",
                    allowNull: true,
                },
                // Identity Verification
                aadharNumber: {
                    type: DataTypes.STRING(12),
                    allowNull: true,
                    unique: {
                        name: "unique_aadhar_globally",
                        msg: "Aadhar number must be unique",
                    },
                },
                panNumber: {
                    type: DataTypes.STRING(10),
                    allowNull: true,
                    unique: {
                        name: "unique_pan_globally",
                        msg: "PAN must be unique",
                    },
                },
                passportNumber: {
                    type: DataTypes.STRING(20),
                    allowNull: true,
                },
                drivingLicenseNumber: {
                    type: DataTypes.STRING(20),
                    allowNull: true,
                },
                voterIdNumber: {
                    type: DataTypes.STRING(20),
                    allowNull: true,
                },
                aadharDocumentPath: {
                    type: DataTypes.STRING(500),
                    allowNull: true,
                },
                panDocumentPath: {
                    type: DataTypes.STRING(500),
                    allowNull: true,
                },
                // Banking & Payroll
                bankAccountHolderName: {
                    type: DataTypes.STRING(255),
                    allowNull: true,
                },
                bankName: {
                    type: DataTypes.STRING(255),
                    allowNull: true,
                },
                bankBranchName: {
                    type: DataTypes.STRING(255),
                    allowNull: true,
                },
                bankAccountNumber: {
                    type: DataTypes.STRING(20),
                    allowNull: true,
                },
                ifscCode: {
                    type: DataTypes.STRING(11),
                    allowNull: true,
                },
                salary: {
                    type: DataTypes.DECIMAL(12, 2),
                    allowNull: true,
                },
                basicSalary: {
                    type: DataTypes.DECIMAL(12, 2),
                    allowNull: true,
                },
                hra: {
                    type: DataTypes.DECIMAL(12, 2),
                    allowNull: true,
                },
                allowances: {
                    type: DataTypes.DECIMAL(12, 2),
                    allowNull: true,
                },
                pfNumber: {
                    type: DataTypes.STRING(20),
                    allowNull: true,
                },
                esicNumber: {
                    type: DataTypes.STRING(20),
                    allowNull: true,
                },
                uanNumber: {
                    type: DataTypes.STRING(20),
                    allowNull: true,
                },
                paymentMode: {
                    type: DataTypes.ENUM("Bank Transfer", "UPI", "Cash", "Wire Transfer", "NetBanking", "Card", "NEFT", "RTGS", "Other", "Cheque"),
                    allowNull: true,
                },
                // Work & Experience
                previousCompanyName: {
                    type: DataTypes.STRING(255),
                    allowNull: true,
                },
                totalExperienceYears: {
                    type: DataTypes.DECIMAL(5, 2),
                    allowNull: true,
                },
                lastCtc: {
                    type: DataTypes.DECIMAL(12, 2),
                    allowNull: true,
                },
                skills: {
                    type: DataTypes.JSON,
                    allowNull: true,
                    defaultValue: null,
                },
                resumeFilePath: {
                    type: DataTypes.STRING(500),
                    allowNull: true,
                },
                certificatesFilePath: {
                    type: DataTypes.JSON,
                    allowNull: true,
                    defaultValue: null,
                },
                // HR & Compliance
                probationPeriod: {
                    type: DataTypes.INTEGER,
                    allowNull: true,
                },
                confirmationDate: {
                    type: DataTypes.DATE,
                    allowNull: true,
                },
                workShift: {
                    type: DataTypes.ENUM("General", "Day", "Night", "Shift", "Flexible", "Remote", "Hybrid", "Other"),
                    allowNull: true,
                },
                attendanceType: {
                    type: DataTypes.ENUM("Biometric", "Manual", "Online", "Offline", "App-based", "Other"),
                    allowNull: true,
                },
                leavePolicyAssigned: {
                    type: DataTypes.STRING(100),
                    allowNull: true,
                },
                ndaStatus: {
                    type: DataTypes.BOOLEAN,
                    defaultValue: false,
                    allowNull: true,
                },
                offerLetterPath: {
                    type: DataTypes.STRING(500),
                    allowNull: true,
                },
                appointmentLetterPath: {
                    type: DataTypes.STRING(500),
                    allowNull: true,
                },
                // System & Access
                officialEmailId: {
                    type: DataTypes.STRING(255),
                    allowNull: true,
                },
                emailPasswordDelivered: {
                    type: DataTypes.BOOLEAN,
                    defaultValue: false,
                    allowNull: true,
                },
                systemLaptopAssigned: {
                    type: DataTypes.BOOLEAN,
                    defaultValue: false,
                    allowNull: true,
                },
                assetId: {
                    type: DataTypes.STRING(50),
                    allowNull: true,
                },
                crmAccessGiven: {
                    type: DataTypes.BOOLEAN,
                    defaultValue: false,
                    allowNull: true,
                },
                hrmsAccessGiven: {
                    type: DataTypes.BOOLEAN,
                    defaultValue: false,
                    allowNull: true,
                },
                driveAccessGiven: {
                    type: DataTypes.BOOLEAN,
                    defaultValue: false,
                    allowNull: true,
                },
                adminToolsAccess: {
                    type: DataTypes.BOOLEAN,
                    defaultValue: false,
                    allowNull: true,
                },
                accessCardIssued: {
                    type: DataTypes.BOOLEAN,
                    defaultValue: false,
                    allowNull: true,
                },
                // Optional Info
                profilePhoto: {
                    type: DataTypes.STRING(500),
                    allowNull: true,
                },
                tshirtUniformSize: {
                    type: DataTypes.ENUM("XS", "S", "M", "L", "XL", "XXL", "3XL", "4XL", "5XL", "10XL"),
                    allowNull: true,
                },
                workFromHomeEligibility: {
                    type: DataTypes.BOOLEAN,
                    defaultValue: false,
                    allowNull: true,
                },
                linkedInProfile: {
                    type: DataTypes.STRING(500),
                    allowNull: true,
                },
                healthIssues: {
                    type: DataTypes.TEXT,
                    allowNull: true,
                },
                // Status
                isActive: {
                    type: DataTypes.BOOLEAN,
                    defaultValue: true,
                },
                isDeleted: {
                    type: DataTypes.BOOLEAN,
                    defaultValue: false,
                },
                profileStatus: {
                    type: DataTypes.ENUM("Incomplete", "Complete", "Pending Approval"),
                    defaultValue: "Incomplete",
                    allowNull: true,
                },
                registrationStep: {
                    type: DataTypes.INTEGER,
                    defaultValue: 0,
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
                tableName: "employee",
                timestamps: true,
                indexes: [
                    {
                        unique: true,
                        fields: ["employeeId", "companyId"],
                        name: "unique_employee_per_company",
                    },
                    {
                        fields: ["userId"],
                        name: "idx_employee_userId",
                    },
                    {
                        fields: ["companyId"],
                        name: "idx_employee_companyId",
                    },
                    {
                        fields: ["employeeStatus"],
                        name: "idx_employee_status",
                    },
                ],
            }
        );

        return Employee;
    }
}

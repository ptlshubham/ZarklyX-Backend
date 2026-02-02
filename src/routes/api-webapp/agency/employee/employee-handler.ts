import { User } from "../../../../db/core/init-control-db";
import { Employee } from "../../../../routes/api-webapp/agency/employee/employee-model";
import { EmployeeDocument } from "../../../../routes/api-webapp/agency/employee/employee-documents.model";
import { Op, Transaction } from "sequelize";
const { MakeQuery } = require("../../../../services/model-service");

// Define the employee payload interface
export interface EmployeePayload {
    userId: string;
    companyId: string;
    employeeId: string;
    departmentId?: number | null;
    reportingManagerId?: string | null;
    // Personal Information (stored in User table - do NOT duplicate here)
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
    dateOfBirth?: Date | null;
    gender?: string | null;
    nationality?: string | null;
    maritalStatus?: string | null;
    bloodGroup?: string | null;
    emergencyContactName?: string | null;
    emergencyContactNumber?: string | null;
    emergencyContactIsdCode?: string | null;
    emergencyContactIsoCode?: string | null;
    emergencyContactRelationship?: string | null;
    permanentAddress?: string | null;
    currentAddress?: string | null;
    isoCode?: string | null;
    isdCode?: string | null;
    // Employment Details
    designation?: string | null;
    dateOfJoining?: Date | null;
    employmentType?: string | null;
    workLocation?: string | null;
    employeeStatus?: string | null;
    // Identity Verification
    aadharNumber?: string | null;
    panNumber?: string | null;
    passportNumber?: string | null;
    drivingLicenseNumber?: string | null;
    voterIdNumber?: string | null;
    // Document files are stored in EmployeeDocument model, not here
    // Banking & Payroll
    bankAccountHolderName?: string | null;
    bankName?: string | null;
    bankBranchName?: string | null;
    bankAccountNumber?: string | null;
    ifscCode?: string | null;
    salary?: number | null;
    basicSalary?: number | null;
    hra?: number | null;
    allowances?: number | null;
    pfNumber?: string | null;
    esicNumber?: string | null;
    uanNumber?: string | null;
    paymentMode?: string | null;
    // Work & Experience
    previousCompanyName?: string | null;
    totalExperienceYears?: number | null;
    lastCtc?: number | null;
    skills?: string[] | null;
    resumeFilePath?: string | null;
    certificatesFilePath?: string[] | null;
    // HR & Compliance
    probationPeriod?: number | null;
    confirmationDate?: Date | null;
    workShift?: string | null;
    attendanceType?: string | null;
    leavePolicyAssigned?: string | null;
    ndaStatus?: boolean | null;
    offerLetterPath?: string | null;
    appointmentLetterPath?: string | null;
    // System & Access
    officialEmailId?: string | null;
    emailPasswordDelivered?: boolean | null;
    systemLaptopAssigned?: boolean | null;
    assetId?: string | null;
    crmAccessGiven?: boolean | null;
    hrmsAccessGiven?: boolean | null;
    driveAccessGiven?: boolean | null;
    adminToolsAccess?: boolean | null;
    accessCardIssued?: boolean | null;
    // Optional
    profilePhoto?: string | null;
    tshirtUniformSize?: string | null;
    workFromHomeEligibility?: boolean | null;
    linkedInProfile?: string | null;
    healthIssues?: string | null;
    // Status
    isActive?: boolean;
    isDeleted?: boolean;
    profileStatus?: string | null;
    registrationStep?: number;
    [key: string]: any;
}

// Add new employee
export const addEmployee = async (body: EmployeePayload, t: Transaction) => {
    return Employee.create(body as any, { transaction: t });
};

// Get all employees with filters and pagination
export const getAllEmployees = (query: any) => {
    const {
        // limit: rawLimit,
        // offset: rawOffset,
        modelOption,
        orderBy,
        attributes,
        forExcel,
    } = MakeQuery({
        query,
        Model: Employee,
    });

    // const limit = Number(rawLimit) || 10;
    // const offset = Number(rawOffset) || 0;

    let modalParam: any = {
        where: {
            ...modelOption,
            [Op.not]: {
                isDeleted: 1,
            }
        },
        attributes: attributes || [
            'id',
            'firstName',
            'lastName',
            'companyId',
            'referId',
            'isActive',
            'createdAt',
        ],
        order: orderBy,
        raw: false,
        include: [
            {
                model: User,
                as: 'user',
                attributes: {
                    exclude: [
                        'password',
                        'secretCode',
                        'googleId',
                        'appleId',
                        'authProvider',
                        'deletedAt',
                    ],
                },
                required: false,
            },
            {
                model: Employee,
                as: 'reportingManager',
                attributes: [['id', 'managerId']],
                required: false,
                include: [
                    {
                        model: User,
                        as: 'user',
                        attributes: ['firstName', 'lastName'],
                        required: false,
                    },
                ],
            },
        ],
    };

    if (query.companyId) {
        if (!Array.isArray(modalParam.where)) {
            modalParam.where = [modalParam.where];
        }
        modalParam.where.push({ companyId: query.companyId });
    }

    if (query.userId) {
        modalParam.include[0].where = {
            id: query.userId,
        };
    }

    // if (!forExcel) {
    //     modalParam.limit = limit;
    //     modalParam.offset = offset;
    // }

    return Employee.findAndCountAll(modalParam);
};

// Get employee by ID
export const getEmployeeById = async (id: string) => {
    return await Employee.findOne({
        where: { id },
    });
};

// Get employee by employeeId
export const getEmployeeByEmployeeId = async (employeeId: string, companyId: string) => {
    return await Employee.findOne({
        where: {
            employeeId,
            companyId,
            isDeleted: false,
        },
        raw: true,
    });
};

// Get employee by email (search across all employees, as email is in User table)
export const getEmployeeByEmail = async (email: string, companyId: string) => {
    return await Employee.findOne({
        where: {
            companyId,
            isDeleted: false,
        },
        include: [
            {
                association: "user", // requires association setup
                where: { email },
                attributes: [],
            },
        ],
        raw: true,
    });
};

// Get employee by contact (search across all employees, as contact is in User table)
export const getEmployeeByContact = async (contactNumber: string, companyId: string) => {
    return await Employee.findOne({
        where: {
            companyId,
            isDeleted: false,
        },
        include: [
            {
                association: "user",
                where: { contact: contactNumber },
                attributes: [],
            },
        ],
        raw: true,
    });
};

// Get employees by department
export const getEmployeesByDepartment = async (departmentId: number, companyId: string) => {
    return await Employee.findAll({
        where: {
            departmentId,
            companyId,
            isDeleted: false,
            isActive: true,
        },
        raw: true,
    });
};

// Get employees by reporting manager
export const getEmployeesByReportingManager = async (
    reportingManagerId: string,
    companyId: string
) => {
    return await Employee.findAll({
        where: {
            reportingManagerId,
            companyId,
            isDeleted: false,
            isActive: true,
        },
        raw: true,
    });
};

// Get employees by status
export const getEmployeesByStatus = async (
    status: string,
    companyId: string,
    limit?: number,
    offset?: number
) => {
    const options: any = {
        where: {
            employeeStatus: status,
            companyId,
            isDeleted: false,
        },
    };

    if (limit && offset !== undefined) {
        options.limit = limit;
        options.offset = offset;
    }

    return await Employee.findAndCountAll(options);
};

// Update employee details
export const updateEmployee = async (id: string, body: EmployeePayload, t?: Transaction) => {
    const options: any = { where: { id } };
    if (t) {
        options.transaction = t;
    }
    return await Employee.update(body, options);
};

// Soft delete employee
export const deleteEmployee = async (id: string, t?: Transaction) => {
    const options: any = { where: { id } };
    if (t) {
        options.transaction = t;
    }
    return await Employee.update(
        {
            isActive: false,
            isDeleted: true,
            employeeStatus: "Terminated",
        },
        options
    );
};

// Hard delete employee (use with caution)
export const hardDeleteEmployee = async (id: string, t?: Transaction) => {
    const options: any = { where: { id } };
    if (t) {
        options.transaction = t;
    }
    return await Employee.destroy(options);
};

// Check if employee ID exists
export const checkEmployeeIdExists = async (employeeId: string, companyId: string) => {
    return await Employee.findOne({
        where: {
            employeeId,
            companyId,
            isDeleted: false,
        },
    });
};

// Check if aadhar exists (globally)
export const checkAadharExists = async (aadharNumber: string, excludeId?: string) => {
    const where: any = {
        aadharNumber,
        isDeleted: false,
    };

    if (excludeId) {
        where.id = { [Op.ne]: excludeId };
    }

    return await Employee.findOne({ where });
};

// Check if PAN exists (globally)
export const checkPanExists = async (panNumber: string, excludeId?: string) => {
    const where: any = {
        panNumber,
        isDeleted: false,
    };

    if (excludeId) {
        where.id = { [Op.ne]: excludeId };
    }

    return await Employee.findOne({ where });
};

// Bulk update employee status
export const bulkUpdateEmployeeStatus = async (
    employeeIds: string[],
    status: string,
    companyId: string,
    t?: Transaction
) => {
    const options: any = {
        where: {
            id: { [Op.in]: employeeIds },
            companyId,
        },
    };

    if (t) {
        options.transaction = t;
    }

    return await Employee.update(
        { employeeStatus: status },
        options
    );
};

// Get employees with active status
export const getActiveEmployees = async (companyId: string) => {
    return await Employee.findAll({
        where: {
            companyId,
            isActive: true,
            isDeleted: false,
            employeeStatus: "Active",
        },
        attributes: ["id", "firstName", "lastName", "designation", "email", "contactNumber"],
        raw: true,
    });
};

// Count employees by department
export const countEmployeesByDepartment = async (companyId: string) => {
    return await Employee.findAll({
        attributes: [
            "departmentId",
            [require("sequelize").fn("COUNT", require("sequelize").col("id")), "count"],
        ],
        where: {
            companyId,
            isDeleted: false,
            isActive: true,
        },
        group: ["departmentId"],
        raw: true,
    });
};

// Count employees by status
export const countEmployeesByStatus = async (companyId: string) => {
    return await Employee.findAll({
        attributes: [
            "employeeStatus",
            [require("sequelize").fn("COUNT", require("sequelize").col("id")), "count"],
        ],
        where: {
            companyId,
            isDeleted: false,
        },
        group: ["employeeStatus"],
        raw: true,
    });
};

// Get employees by employment type
export const getEmployeesByEmploymentType = async (
    employmentType: string,
    companyId: string
) => {
    return await Employee.findAll({
        where: {
            employmentType,
            companyId,
            isDeleted: false,
            isActive: true,
        },
        raw: true,
    });
};

// ======================== EMPLOYEE DOCUMENT FUNCTIONS ========================

// Add employee document
export const addEmployeeDocument = async (
    employeeId: string,
    companyId: string,
    documentPath: string,
    t?: Transaction
) => {
    const options: any = {};
    if (t) {
        options.transaction = t;
    }

    // Create new document entry
    return await EmployeeDocument.create(
        {
            employeeId,
            companyId,
            documentPath,
        },
        options
    );
};

// Get all documents for an employee
export const getEmployeeDocuments = async (employeeId: string, companyId: string) => {
    return await EmployeeDocument.findAll({
        where: {
            employeeId,
            companyId,
        },
        raw: true,
        order: [["createdAt", "DESC"]],
    });
};

// Get document by ID
export const getEmployeeDocumentById = async (documentId: string) => {
    return await EmployeeDocument.findOne({
        where: { id: documentId },
    });
};

// Delete employee document
export const removeEmployeeDocument = async (
    documentId: string,
    t?: Transaction
) => {
    const options: any = { where: { id: documentId } };
    if (t) {
        options.transaction = t;
    }
    return await EmployeeDocument.destroy(options);
};

// Get all documents by company
export const getCompanyDocuments = async (companyId: string) => {
    return await EmployeeDocument.findAll({
        where: {
            companyId,
        },
        raw: true,
        order: [["createdAt", "DESC"]],
    });
};

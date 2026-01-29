import express from "express";
import { Request, Response } from "express";
import dbInstance from "../../../../db/core/control-db";
import { tokenMiddleWare } from "../../../../services/jwtToken-service";
import {
    addEmployee,
    getEmployeeById,
    getEmployeeByEmployeeId,
    getEmployeeByEmail,
    getEmployeesByDepartment,
    getEmployeesByReportingManager,
    getEmployeesByStatus,
    updateEmployee,
    deleteEmployee,
    checkEmployeeIdExists,
    checkAadharExists,
    checkPanExists,
    bulkUpdateEmployeeStatus,
    getActiveEmployees,
    countEmployeesByDepartment,
    countEmployeesByStatus,
    getEmployeesByEmploymentType,
    getAllEmployees,
    EmployeePayload,
} from "../../../../routes/api-webapp/agency/employee/employee-handler";
import { User } from "../../../../routes/api-webapp/authentication/user/user-model";
import { Company } from "../../../../routes/api-webapp/company/company-model";
import { authMiddleware } from "../../../../middleware/auth.middleware";
import { cloneRoleToCompany } from "../../../../routes/api-webapp/roles/role-handler";
import { employeeFileUpload } from "../../../../middleware/employeeFileUpload";
import { errorResponse, unauthorized } from "../../../../utils/responseHandler";
import { employeeProfilePhotoUpload } from "../../../../services/multer";
import fs from "fs";
import path from "path";
import configs from "../../../../config/config";
import environment from "../../../../../environment";


const router = express.Router();

// ===== EMPLOYEE CREATION & REGISTRATION =====

/**
 * POST /employee/register
 * Create a new employee
 * Step 1: Create/Update user entry with basic details
 * Step 2: Create employee entry linked to user
 * Required: firstName, lastName, email, contactNumber, companyId, employeeId
 */
router.post("/register", authMiddleware, employeeFileUpload.fields([
    { name: "profilePhoto", maxCount: 1 },
    { name: "resumeFile", maxCount: 1 },
    { name: "aadharDocument", maxCount: 1 },
    { name: "panDocument", maxCount: 1 },
]), async (req: Request, res: Response): Promise<void> => {
    const t = await dbInstance.transaction();
    try {
        const files = req.files as Record<string, Express.Multer.File[]>;

        Object.entries({
            profilePhoto: "profilePhoto",
            resumeFile: "resumeFilePath",
            aadharDocument: "aadharDocumentPath",
            panDocument: "panDocumentPath",
        }).forEach(([multerKey, bodyKey]) => {
            delete req.body[multerKey];

            if (files?.[multerKey]?.[0]?.path) {
                req.body[bodyKey] = files[multerKey][0].path;
            }
        });

        const {
            // User basic details (REQUIRED)
            firstName,
            lastName,
            email,
            contactNumber,
            isdCode,
            isoCode,
            password,
            // Employee details
            employeeId,
            designation,
            dateOfJoining,
            employmentType,
            departmentId,
            reportingManagerId,
            // Emergency contact details
            emergencyContactNumber,
            emergencyContactIsdCode,
            emergencyContactIsoCode,
            // Role assignment (optional)
            platformRoleId,
            roleName,
            roleDescription,
            permissionIds,
            // Optional fields
            ...restData
        } = req.body;

        // ✅ Helper function to extract numeric part from contact number
        const extractNumericContactNumber = (contact: string | null | undefined): string | null => {
            if (!contact) return null;
            return String(contact).replace(/\D/g, '').slice(-10) || null; // Get last 10 digits
        };

        // ✅ Helper function to ensure country code has + prefix
        const ensureCountryCodePrefix = (code: string | null | undefined): string | null => {
            if (!code) return null;
            const trimmed = String(code).trim();
            return trimmed.startsWith('+') ? trimmed : `+${trimmed}`;
        };

        // ✅ Sanitize primary contact number and country codes
        const sanitizedContactNumber = extractNumericContactNumber(contactNumber);
        const sanitizedIsdCode = ensureCountryCodePrefix(isdCode);
        const sanitizedIsoCode = isoCode && String(isoCode).trim() !== '' && String(isoCode) !== 'undefined'
            ? String(isoCode).trim().toUpperCase()
            : null;

        // ✅ Sanitize emergency contact number and country codes
        const sanitizedEmergencyContactNumber = extractNumericContactNumber(emergencyContactNumber);
        const sanitizedEmergencyIsdCode = ensureCountryCodePrefix(emergencyContactIsdCode);
        const sanitizedEmergencyIsoCode = emergencyContactIsoCode && String(emergencyContactIsoCode).trim() !== '' && String(emergencyContactIsoCode) !== 'undefined'
            ? String(emergencyContactIsoCode).trim().toUpperCase()
            : null;

        const companyId = req.user?.companyId;

        if (req.user?.userType != 'agency') {
            await t.rollback();
            res.status(403).json({
                success: false,
                message: "Only accessible for agency",
            });
            return;
        }

        // ✅ Validate required user fields
        if (!firstName || !lastName || !email || !sanitizedContactNumber || !companyId || !employeeId) {
            await t.rollback();
            res.status(400).json({
                success: false,
                message: "Required fields missing: firstName, lastName, email, contactNumber (numeric), companyId, employeeId",
            });
            return;
        }

        // ✅ Verify Company exists
        const parentCompany = await Company.findByPk(companyId, { transaction: t });
        if (!parentCompany) {
            await t.rollback();
            res.status(404).json({
                success: false,
                message: "Company not found",
            });
            return;
        }

        // ✅ STEP 1: Create or get User entry with basic details
        let user = await User.findOne({
            where: { email },
            transaction: t,
        });

        if (user) {
            // User already exists - update with new details if needed
            if (user.userType != 'employee') {
                await t.rollback();
                res.status(400).json({
                    success: false,
                    message: 'User already exists with different type',
                });
                return;
            }
            await user.update(
                {
                    firstName,
                    lastName,
                    contact: sanitizedContactNumber,
                    isdCode: sanitizedIsdCode,
                    isoCode: sanitizedIsoCode,
                    isActive: true,
                    companyId: companyId,
                    isEmailVerified: true,
                },
                { transaction: t }
            );
        } else {
            // Create new user
            user = await User.create(
                {
                    firstName,
                    lastName,
                    email,
                    companyId: companyId,
                    contact: sanitizedContactNumber,
                    isdCode: sanitizedIsdCode,
                    isoCode: sanitizedIsoCode,
                    password: password || null,
                    userType: "employee",
                    isActive: true,
                    isDeleted: false,
                    isEmailVerified: false,
                    isMobileVerified: false,
                    isRegistering: false,
                    registrationStep: 0,
                    isThemeDark: false,
                    authProvider: "email",
                } as any,
                { transaction: t }
            );
        }

        // ✅ Check for duplicate employee ID in this company
        const existingEmployeeId = await checkEmployeeIdExists(employeeId, companyId);
        if (existingEmployeeId) {
            await t.rollback();
            res.status(409).json({
                success: false,
                message: "Employee ID already exists in this company",
            });
            return;
        }

        // ✅ Verify Reporting Manager if provided
        if (reportingManagerId) {
            const reportingManager = await getEmployeeById(reportingManagerId);
            if (!reportingManager || reportingManager.companyId !== companyId) {
                await t.rollback();
                res.status(404).json({
                    success: false,
                    message: "Reporting Manager not found or not in same company",
                });
                return;
            }
        }

        // ✅ Check for duplicate Aadhar if provided (GLOBAL - not per company)
        if (restData.aadharNumber) {
            const existingAadhar = await checkAadharExists(restData.aadharNumber);
            if (existingAadhar) {
                await t.rollback();
                res.status(409).json({
                    success: false,
                    message: "Aadhar number already registered in another employee record",
                });
                return;
            }
        }

        // ✅ Check for duplicate PAN if provided (GLOBAL - not per company)
        if (restData.panNumber) {
            const existingPan = await checkPanExists(restData.panNumber);
            if (existingPan) {
                await t.rollback();
                res.status(409).json({
                    success: false,
                    message: "PAN already registered in another employee record",
                });
                return;
            }
        }

        // ✅ STEP 2: Create employee entry linked to user
        const employee = await addEmployee(
            {
                userId: user.id,
                companyId,
                employeeId,
                designation: designation || null,
                dateOfJoining: dateOfJoining || null,
                employmentType: employmentType || null,
                departmentId: departmentId || null,
                reportingManagerId: reportingManagerId || null,
                employeeStatus: "Active",
                isActive: true,
                isDeleted: false,
                profileStatus: "Incomplete",
                registrationStep: 1,
                // Primary contact details
                contactNumber: sanitizedContactNumber,
                isdCode: sanitizedIsdCode,
                isoCode: sanitizedIsoCode,
                // Emergency contact details
                emergencyContactNumber: sanitizedEmergencyContactNumber,
                emergencyContactIsdCode: sanitizedEmergencyIsdCode,
                emergencyContactIsoCode: sanitizedEmergencyIsoCode,
                ...Object.fromEntries(
                    Object.entries(restData).map(([key, value]) => [
                        key,
                        value === "" ? null : value,
                    ])
                ),
            } as EmployeePayload,
            t
        );

        // ✅ STEP 3: Clone role and assign to user (if platformRoleId provided)
        let customRole = null;
        if (platformRoleId) {
            // Validate permissionIds if provided
            if (permissionIds !== undefined && !Array.isArray(permissionIds)) {
                await t.rollback();
                res.status(400).json({
                    success: false,
                    message: "permissionIds must be an array"
                });
                return;
            }

            try {
                // Clone the platform role to create a custom role for this employee
                customRole = await cloneRoleToCompany(
                    platformRoleId,
                    companyId,
                    roleName, // Optional: custom name for the role
                    roleDescription, // Optional: custom description
                    permissionIds, // Optional: specific permissions to assign
                    t
                );

                // Assign the custom role to the user by updating their roleId
                await user.update(
                    { roleId: customRole.id },
                    { transaction: t }
                );
            } catch (roleError: any) {
                await t.rollback();
                res.status(400).json({
                    success: false,
                    message: roleError.message || "Failed to assign role",
                });
                return;
            }
        }

        await t.commit();

        res.status(201).json({
            success: true,
            message: "Employee registered successfully.",
            data: {
                user: {
                    id: user.id,
                    firstName: user.firstName,
                    lastName: user.lastName,
                    email: user.email,
                    contact: user.contact,
                    isdCode: user.isdCode,
                    isoCode: user.isoCode,
                },
                employee,
                role: customRole ? {
                    id: customRole.id,
                    name: customRole.name,
                    description: customRole.description,
                } : null,
            },
        });
    } catch (err) {
        await t.rollback();
        console.error("[employee/register] ERROR:", err);
        res.status(500).json({
            success: false,
            message: "Server error",
            error: process.env.NODE_ENV === "development" ? err : undefined,
        });
    }
});

// ===== EMPLOYEE RETRIEVAL & FILTERING =====

/**
 * GET /employee/list
 * Get all employees with pagination and filters
 */
router.get("/list", tokenMiddleWare, async (req: Request, res: Response): Promise<void> => {
    try {
        // const { companyId } = req.query;
        const user = (req as any).user;

        if (!user || !user.companyId) {
            res.status(401).json({
                success: false,
                message: "Unauthorized: companyId missing",
            });
            return;
        }
        const { companyId } = user;

        if (!companyId) {
            res.status(400).json({
                success: false,
                message: "companyId is required",
            });
            return;
        }

        const result = await getAllEmployees({
            ...req.query,
            companyId,
        });

        res.status(200).json({
            success: true,
            message: "Employees retrieved successfully",
            data: result.rows,
            total: result.count,
            limit: req.query.limit || 10,
            offset: req.query.offset || 0,
        });
    } catch (err) {
        console.error("[employee/list] ERROR:", err);
        res.status(500).json({
            success: false,
            message: "Server error",
            error: process.env.NODE_ENV === "development" ? err : undefined,
        });
    }
});

/**
 * GET /employee/id/:id
 * Get employee by ID
 */
router.get("/id/:id", tokenMiddleWare, async (req: Request, res: Response): Promise<void> => {
    try {
        let id = req.params.id;
        if (Array.isArray(id)) id = id[0];

        const employee = await getEmployeeById(id);

        if (!employee || employee.isDeleted) {
            res.status(404).json({
                success: false,
                message: "Employee not found",
            });
            return;
        }

        res.status(200).json({
            success: true,
            message: "Employee retrieved successfully",
            data: employee,
        });
    } catch (err) {
        console.error("[employee/id] ERROR:", err);
        res.status(500).json({
            success: false,
            message: "Server error",
        });
    }
});

/**
 * GET /employee/employeeId/:employeeId
 * Get employee by Employee ID
 */
router.get("/employeeId/:employeeId", tokenMiddleWare, async (req: Request, res: Response): Promise<void> => {
    try {
        let { employeeId } = req.params;
        if (Array.isArray(employeeId)) employeeId = employeeId[0];
        const { companyId } = req.query;

        if (!companyId) {
            res.status(400).json({
                success: false,
                message: "companyId is required",
            });
            return;
        }

        const employee = await getEmployeeByEmployeeId(employeeId, companyId as string);

        if (!employee) {
            res.status(404).json({
                success: false,
                message: "Employee not found",
            });
            return;
        }

        res.status(200).json({
            success: true,
            message: "Employee retrieved successfully",
            data: employee,
        });
    } catch (err) {
        console.error("[employee/employeeId] ERROR:", err);
        res.status(500).json({
            success: false,
            message: "Server error",
        });
    }
});

/**
 * GET /employee/email/:email
 * Get employee by email
 */
router.get("/email/:email", tokenMiddleWare, async (req: Request, res: Response): Promise<void> => {
    try {
        let { email } = req.params;
        if (Array.isArray(email)) email = email[0];
        const { companyId } = req.query;

        if (!companyId) {
            res.status(400).json({
                success: false,
                message: "companyId is required",
            });
            return;
        }

        const employee = await getEmployeeByEmail(email, companyId as string);

        if (!employee) {
            res.status(404).json({
                success: false,
                message: "Employee not found",
            });
            return;
        }

        res.status(200).json({
            success: true,
            message: "Employee retrieved successfully",
            data: employee,
        });
    } catch (err) {
        console.error("[employee/email] ERROR:", err);
        res.status(500).json({
            success: false,
            message: "Server error",
        });
    }
});

/**
 * GET /employee/by-department/:departmentId
 * Get employees by department
 */
router.get("/by-department/:departmentId", tokenMiddleWare, async (req: Request, res: Response): Promise<void> => {
    try {
        let { departmentId } = req.params;
        if (Array.isArray(departmentId)) departmentId = departmentId[0];
        const { companyId } = req.query;

        if (!companyId) {
            res.status(400).json({
                success: false,
                message: "companyId is required",
            });
            return;
        }

        const employees = await getEmployeesByDepartment(parseInt(departmentId), companyId as string);

        res.status(200).json({
            success: true,
            message: "Employees retrieved successfully",
            data: employees,
            total: employees.length,
        });
    } catch (err) {
        console.error("[employee/by-department] ERROR:", err);
        res.status(500).json({
            success: false,
            message: "Server error",
        });
    }
});

/**
 * GET /employee/by-reporting-manager/:managerId
 * Get employees by reporting manager
 */
router.get(
    "/by-reporting-manager/:managerId",
    tokenMiddleWare,
    async (req: Request, res: Response): Promise<void> => {
        try {
            let { managerId } = req.params;
            if (Array.isArray(managerId)) managerId = managerId[0];
            const { companyId } = req.query;

            if (!companyId) {
                res.status(400).json({
                    success: false,
                    message: "companyId is required",
                });
                return;
            }

            const employees = await getEmployeesByReportingManager(managerId, companyId as string);

            res.status(200).json({
                success: true,
                message: "Employees retrieved successfully",
                data: employees,
                total: employees.length,
            });
        } catch (err) {
            console.error("[employee/by-reporting-manager] ERROR:", err);
            res.status(500).json({
                success: false,
                message: "Server error",
            });
        }
    }
);

/**
 * GET /employee/by-status/:status
 * Get employees by status
 */
router.get("/by-status/:status", tokenMiddleWare, async (req: Request, res: Response): Promise<void> => {
    try {
        let { status } = req.params;
        if (Array.isArray(status)) status = status[0];
        const { companyId, limit, offset } = req.query;

        if (!companyId) {
            res.status(400).json({
                success: false,
                message: "companyId is required",
            });
            return;
        }

        const result = await getEmployeesByStatus(
            status,
            companyId as string,
            limit ? parseInt(limit as string) : undefined,
            offset ? parseInt(offset as string) : undefined
        );

        res.status(200).json({
            success: true,
            message: "Employees retrieved successfully",
            data: result.rows,
            total: result.count,
        });
    } catch (err) {
        console.error("[employee/by-status] ERROR:", err);
        res.status(500).json({
            success: false,
            message: "Server error",
        });
    }
});

/**
 * GET /employee/active-list
 * Get active employees
 */
router.get("/active-list", tokenMiddleWare, async (req: Request, res: Response): Promise<void> => {
    try {
        const { companyId } = req.query;

        if (!companyId) {
            res.status(400).json({
                success: false,
                message: "companyId is required",
            });
            return;
        }

        const employees = await getActiveEmployees(companyId as string);

        res.status(200).json({
            success: true,
            message: "Active employees retrieved successfully",
            data: employees,
            total: employees.length,
        });
    } catch (err) {
        console.error("[employee/active-list] ERROR:", err);
        res.status(500).json({
            success: false,
            message: "Server error",
        });
    }
});

// ===== EMPLOYEE UPDATES =====

/**
 * PUT /employee/update/:id
 * Update employee details
 * Supports file uploads and contact number sanitization like register endpoint
 */
router.put("/update/:id", tokenMiddleWare, employeeFileUpload.fields([
    { name: "profilePhoto", maxCount: 1 },
    { name: "resumeFile", maxCount: 1 },
    { name: "aadharDocument", maxCount: 1 },
    { name: "panDocument", maxCount: 1 },
]), async (req: Request, res: Response): Promise<void> => {
    const t = await dbInstance.transaction();

    try {
        let id = req.params.id;
        if (Array.isArray(id)) id = id[0];

        // ✅ Handle file uploads
        const files = req.files as Record<string, Express.Multer.File[]>;

        Object.entries({
            profilePhoto: "profilePhoto",
            resumeFile: "resumeFilePath",
            aadharDocument: "aadharDocumentPath",
            panDocument: "panDocumentPath",
        }).forEach(([multerKey, bodyKey]) => {
            delete req.body[multerKey];

            if (files?.[multerKey]?.[0]?.path) {
                req.body[bodyKey] = files[multerKey][0].path;
            }
        });

        const updateData = req.body;

        const copmany = (req as any).user;

        if (!copmany || !copmany.companyId) {
            await t.rollback();
            res.status(401).json({
                success: false,
                message: "Unauthorized: companyId missing",
            });
            return;
        }
        const { companyId } = copmany;

        // ✅ Verify employee exists
        const employee = await getEmployeeById(id);

        if (!employee || employee.isDeleted) {
            await t.rollback();
            res.status(404).json({
                success: false,
                message: "Employee not found",
            });
            return;
        }

        // ✅ Verify company ownership
        if (employee.companyId !== companyId) {
            await t.rollback();
            res.status(403).json({
                success: false,
                message: "Employee does not belong to this company",
            });
            return;
        }

        // ✅ Delete old profile photo if new one is being uploaded
        if (updateData.profilePhoto && employee.profilePhoto) {
            try {
                const oldPhotoPath = path.join(process.cwd(), 'src', 'public', employee.profilePhoto.replace(/^\//, ''));
                if (fs.existsSync(oldPhotoPath)) {
                    fs.unlinkSync(oldPhotoPath);
                }
            } catch (err) {
                console.error("[employee/update] Error deleting old profile photo:", err);
            }
        }

        // ✅ Helper function to extract numeric part from contact number
        const extractNumericContactNumber = (contact: string | null | undefined): string | null => {
            if (!contact) return null;
            return String(contact).replace(/\D/g, '').slice(-10) || null; // Get last 10 digits
        };

        // ✅ Helper function to ensure country code has + prefix
        const ensureCountryCodePrefix = (code: string | null | undefined): string | null => {
            if (!code) return null;
            const trimmed = String(code).trim();
            return trimmed.startsWith('+') ? trimmed : `+${trimmed}`;
        };

        // ✅ Sanitize primary contact number and country codes if provided
        if (updateData.contactNumber) {
            updateData.contactNumber = extractNumericContactNumber(updateData.contactNumber);
        }
        if (updateData.isdCode) {
            updateData.isdCode = ensureCountryCodePrefix(updateData.isdCode);
        }
        if (updateData.isoCode) {
            updateData.isoCode = updateData.isoCode && String(updateData.isoCode).trim() !== '' && String(updateData.isoCode) !== 'undefined'
                ? String(updateData.isoCode).trim().toUpperCase()
                : null;
        }

        // ✅ Sanitize emergency contact number and country codes if provided
        if (updateData.emergencyContactNumber) {
            updateData.emergencyContactNumber = extractNumericContactNumber(updateData.emergencyContactNumber);
        }
        if (updateData.emergencyContactIsdCode) {
            updateData.emergencyContactIsdCode = ensureCountryCodePrefix(updateData.emergencyContactIsdCode);
        }
        if (updateData.emergencyContactIsoCode) {
            updateData.emergencyContactIsoCode = updateData.emergencyContactIsoCode && String(updateData.emergencyContactIsoCode).trim() !== '' && String(updateData.emergencyContactIsoCode) !== 'undefined'
                ? String(updateData.emergencyContactIsoCode).trim().toUpperCase()
                : null;
        }

        const { aadharNumber, panNumber } = updateData || {};

        // ✅ Check for duplicate Aadhar if being updated
        if (aadharNumber && aadharNumber !== employee.aadharNumber) {
            let finalId = id;
            if (Array.isArray(finalId)) finalId = finalId[0];
            const existingAadhar = await checkAadharExists(aadharNumber, finalId);
            if (existingAadhar) {
                await t.rollback();
                res.status(409).json({
                    success: false,
                    message: "Aadhar number already registered in another employee record",
                });
                return;
            }
        }

        // ✅ Check for duplicate PAN if being updated
        if (panNumber && panNumber !== employee.panNumber) {
            let finalId2 = id;
            if (Array.isArray(finalId2)) finalId2 = finalId2[0];
            const existingPan = await checkPanExists(panNumber, finalId2);
            if (existingPan) {
                await t.rollback();
                res.status(409).json({
                    success: false,
                    message: "PAN already registered in another employee record",
                });
                return;
            }
        }

        // ✅ Verify Reporting Manager if being updated
        if (updateData.reportingManagerId && updateData.reportingManagerId !== employee.reportingManagerId) {
            const reportingManager = await getEmployeeById(updateData.reportingManagerId);
            if (!reportingManager || reportingManager.companyId !== companyId) {
                await t.rollback();
                res.status(404).json({
                    success: false,
                    message: "Reporting Manager not found or not in same company",
                });
                return;
            }
        }

        // ✅ Update employee with sanitized data
        let updateId = id;
        if (Array.isArray(updateId)) updateId = updateId[0];

        // Convert empty strings to null
        const sanitizedUpdateData = Object.fromEntries(
            Object.entries(updateData).map(([key, value]) => [
                key,
                value === "" ? null : value,
            ])
        ) as EmployeePayload;

        await updateEmployee(updateId, sanitizedUpdateData, t);

        const updatedEmployee = await getEmployeeById(updateId);

        await t.commit();

        res.status(200).json({
            success: true,
            message: "Employee updated successfully",
            data: updatedEmployee,
        });
    } catch (err) {
        await t.rollback();
        console.error("[employee/update] ERROR:", err);
        res.status(500).json({
            success: false,
            message: "Server error",
            error: process.env.NODE_ENV === "development" ? err : undefined,
        });
    }
});

/**
 * PATCH /employee/update-status/:id
 * Update employee status
 */
router.patch("/update-status/:id",
    tokenMiddleWare,
    async (req: Request, res: Response): Promise<void> => {
        const t = await dbInstance.transaction();

        try {
            let id = req.params.id;
            if (Array.isArray(id)) id = id[0];
            const { status, companyId } = req.body;

            if (!status) {
                await t.rollback();
                res.status(400).json({
                    success: false,
                    message: "Status is required",
                });
                return;
            }

            const validStatuses = ["Active", "Terminated", "On Leave", "Resigned"];
            if (!validStatuses.includes(status)) {
                await t.rollback();
                res.status(400).json({
                    success: false,
                    message: `Invalid status. Valid statuses: ${validStatuses.join(", ")}`,
                });
                return;
            }

            const employee = await getEmployeeById(id);

            if (!employee || employee.isDeleted) {
                await t.rollback();
                res.status(404).json({
                    success: false,
                    message: "Employee not found",
                });
                return;
            }

            if (employee.companyId !== companyId) {
                await t.rollback();
                res.status(403).json({
                    success: false,
                    message: "Employee does not belong to this company",
                });
                return;
            }

            await updateEmployee(id, { employeeStatus: status } as EmployeePayload, t);

            const updatedEmployee = await getEmployeeById(id);

            await t.commit();

            res.status(200).json({
                success: true,
                message: "Employee status updated successfully",
                data: updatedEmployee,
            });
        } catch (err) {
            await t.rollback();
            console.error("[employee/update-status] ERROR:", err);
            res.status(500).json({
                success: false,
                message: "Server error",
            });
        }
    }
);

// ===== EMPLOYEE DELETION =====

/**
 * DELETE /employee/delete/:id
 * Soft delete employee
 */
router.delete("/delete/:id", tokenMiddleWare, async (req: Request, res: Response): Promise<void> => {
    const t = await dbInstance.transaction();

    try {
        let id = req.params.id;
        if (Array.isArray(id)) id = id[0];
        const user = (req as any).user;

        if (!user || !user.companyId) {
            res.status(401).json({
                success: false,
                message: "Unauthorized: companyId missing",
            });
            return;
        }
        const { companyId } = user;

        const employee = await getEmployeeById(id);

        if (!employee || employee.isDeleted) {
            await t.rollback();
            res.status(404).json({
                success: false,
                message: "Employee not found",
            });
            return;
        }

        if (employee.companyId !== companyId) {
            await t.rollback();
            res.status(403).json({
                success: false,
                message: "Employee does not belong to this company",
            });
            return;
        }

        await deleteEmployee(id, t);

        await t.commit();

        res.status(200).json({
            success: true,
            message: "Employee deleted successfully",
        });
    } catch (err) {
        await t.rollback();
        console.error("[employee/delete] ERROR:", err);
        res.status(500).json({
            success: false,
            message: "Server error",
        });
    }
});

// ===== ANALYTICS & REPORTING =====

/**
 * GET /employee/analytics/by-department
 * Count employees by department
 */
router.get("/analytics/by-department", tokenMiddleWare, async (req: Request, res: Response): Promise<void> => {
    try {
        const { companyId } = req.query;

        if (!companyId) {
            res.status(400).json({
                success: false,
                message: "companyId is required",
            });
            return;
        }

        const result = await countEmployeesByDepartment(companyId as string);

        res.status(200).json({
            success: true,
            message: "Department analytics retrieved successfully",
            data: result,
        });
    } catch (err) {
        console.error("[employee/analytics/by-department] ERROR:", err);
        res.status(500).json({
            success: false,
            message: "Server error",
        });
    }
});

/**
 * GET /employee/analytics/by-status
 * Count employees by status
 */
router.get("/analytics/by-status", tokenMiddleWare, async (req: Request, res: Response): Promise<void> => {
    try {
        const { companyId } = req.query;

        if (!companyId) {
            res.status(400).json({
                success: false,
                message: "companyId is required",
            });
            return;
        }

        const result = await countEmployeesByStatus(companyId as string);

        res.status(200).json({
            success: true,
            message: "Status analytics retrieved successfully",
            data: result,
        });
    } catch (err) {
        console.error("[employee/analytics/by-status] ERROR:", err);
        res.status(500).json({
            success: false,
            message: "Server error",
        });
    }
});

/**
 * GET /employee/by-employment-type/:type
 * Get employees by employment type
 */
router.get("/by-employment-type/:type",
    tokenMiddleWare,
    async (req: Request, res: Response): Promise<void> => {
        try {
            let { type } = req.params;
            if (Array.isArray(type)) type = type[0];
            const { companyId } = req.query;

            if (!companyId) {
                res.status(400).json({
                    success: false,
                    message: "companyId is required",
                });
                return;
            }

            const employees = await getEmployeesByEmploymentType(type, companyId as string);

            res.status(200).json({
                success: true,
                message: "Employees retrieved successfully",
                data: employees,
                total: employees.length,
            });
        } catch (err) {
            console.error("[employee/by-employment-type] ERROR:", err);
            res.status(500).json({
                success: false,
                message: "Server error",
            });
        }
    }
);

// ===== BULK OPERATIONS =====

/**
 * PATCH /employee/bulk-status-update
 * Bulk update employee status
 */
router.patch("/bulk-status-update", tokenMiddleWare, async (req: Request, res: Response): Promise<void> => {
    const t = await dbInstance.transaction();

    try {
        const { employeeIds, status, companyId } = req.body;

        if (!employeeIds || !Array.isArray(employeeIds) || employeeIds.length === 0) {
            await t.rollback();
            res.status(400).json({
                success: false,
                message: "employeeIds array is required",
            });
            return;
        }

        if (!status) {
            await t.rollback();
            res.status(400).json({
                success: false,
                message: "Status is required",
            });
            return;
        }

        const validStatuses = ["Active", "Terminated", "On Leave", "Resigned"];
        if (!validStatuses.includes(status)) {
            await t.rollback();
            res.status(400).json({
                success: false,
                message: `Invalid status. Valid statuses: ${validStatuses.join(", ")}`,
            });
            return;
        }

        await bulkUpdateEmployeeStatus(employeeIds, status, companyId, t);

        await t.commit();

        res.status(200).json({
            success: true,
            message: `${employeeIds.length} employees status updated successfully`,
        });
    } catch (err) {
        await t.rollback();
        console.error("[employee/bulk-status-update] ERROR:", err);
        res.status(500).json({
            success: false,
            message: "Server error",
        });
    }
});

// ===== PROFILE PHOTO MANAGEMENT =====

/**
 * POST /employee/uploadProfilePhoto/:employeeId
 * Upload employee profile photo
 * Body: Form data with file field containing the image
 */
router.post(
    "/uploadProfilePhoto/:employeeId",
    tokenMiddleWare,
    employeeProfilePhotoUpload.single("file"),
    async (req: Request, res: Response): Promise<void> => {
        const t = await dbInstance.transaction();
        try {
            let { employeeId } = req.params;
            if (Array.isArray(employeeId)) employeeId = employeeId[0];

            const user = (req as any).user;

            if (!user || !user.companyId) {
                await t.rollback();
                res.status(401).json({
                    success: false,
                    message: "Unauthorized: companyId missing",
                });
                return;
            }
            const { companyId } = user;

            if (!req.file) {
                await t.rollback();
                res.status(400).json({
                    success: false,
                    message: "No file uploaded",
                });
                return;
            }

            // ✅ Verify employee exists and belongs to company
            const employee = await getEmployeeById(employeeId);

            if (!employee || employee.isDeleted) {
                await t.rollback();
                res.status(404).json({
                    success: false,
                    message: "Employee not found",
                });
                return;
            }

            if (employee.companyId !== companyId) {
                await t.rollback();
                res.status(403).json({
                    success: false,
                    message: "Employee does not belong to this company",
                });
                return;
            }

            // ✅ Delete old profile photo if exists
            if (employee.profilePhoto) {
                try {
                    const oldPhotoPath = path.join(process.cwd(), `public${employee.profilePhoto}`);
                    if (fs.existsSync(oldPhotoPath)) {
                        fs.unlinkSync(oldPhotoPath);
                    }
                } catch (err) {
                    console.error("[employee/uploadProfilePhoto] Error deleting old photo:", err);
                }
            }

            // ✅ Update employee with new profile photo path
            const photoPath = `/employee/profile/${req.file.filename}`;

            await updateEmployee(employeeId, { profilePhoto: photoPath } as EmployeePayload, t);

            const updatedEmployee = await getEmployeeById(employeeId);

            await t.commit();

            res.status(200).json({
                success: true,
                message: "Profile photo uploaded successfully",
                data: {
                    employeeId: updatedEmployee?.id,
                    profilePhoto: updatedEmployee?.profilePhoto,
                },
            });
        } catch (err) {
            await t.rollback();
            console.error("[employee/uploadProfilePhoto] ERROR:", err);
            res.status(500).json({
                success: false,
                message: "Server error",
                error: process.env.NODE_ENV === "development" ? err : undefined,
            });
        }
    }
);

/**
 * PATCH /employee/removeProfilePhoto/:employeeId
 * Remove employee profile photo
 */
router.patch(
    "/removeProfilePhoto/:employeeId",
    tokenMiddleWare,
    async (req: Request, res: Response): Promise<void> => {
        const t = await dbInstance.transaction();
        try {
            let { employeeId } = req.params;
            if (Array.isArray(employeeId)) employeeId = employeeId[0];

            const user = (req as any).user;

            if (!user || !user.companyId) {
                await t.rollback();
                res.status(401).json({
                    success: false,
                    message: "Unauthorized: companyId missing",
                });
                return;
            }
            const { companyId } = user;

            // ✅ Verify employee exists and belongs to company
            const employee = await getEmployeeById(employeeId);

            if (!employee || employee.isDeleted) {
                await t.rollback();
                res.status(404).json({
                    success: false,
                    message: "Employee not found",
                });
                return;
            }

            if (employee.companyId !== companyId) {
                await t.rollback();
                res.status(403).json({
                    success: false,
                    message: "Employee does not belong to this company",
                });
                return;
            }

            // ✅ Check if profile photo exists
            if (!employee.profilePhoto) {
                await t.rollback();
                res.status(400).json({
                    success: false,
                    message: "Employee has no profile photo to remove",
                });
                return;
            }

            // ✅ Delete profile photo from file system
            try {
                const photoPath = path.join(process.cwd(), 'src', 'public', employee.profilePhoto.replace(/^\//, ''));
                if (fs.existsSync(photoPath)) {
                    fs.unlinkSync(photoPath);
                }
            } catch (err) {
                console.error("[employee/removeProfilePhoto] Error deleting photo file:", err);
            }

            // ✅ Update employee to remove profile photo reference
            await updateEmployee(employeeId, { profilePhoto: null } as EmployeePayload, t);

            await t.commit();

            res.status(200).json({
                success: true,
                message: "Profile photo removed successfully",
            });
        } catch (err) {
            await t.rollback();
            console.error("[employee/removeProfilePhoto] ERROR:", err);
            res.status(500).json({
                success: false,
                message: "Server error",
                error: process.env.NODE_ENV === "development" ? err : undefined,
            });
        }
    }
);


export default router;
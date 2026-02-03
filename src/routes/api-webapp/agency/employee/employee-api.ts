import express from "express";
import { Request, Response } from "express";
import dbInstance from "../../../../db/core/control-db";
import { tokenMiddleWare, generateToken } from "../../../../services/jwtToken-service";
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
    addEmployeeDocument,
    getEmployeeDocuments,
    getEmployeeDocumentById,
    removeEmployeeDocument,
} from "../../../../routes/api-webapp/agency/employee/employee-handler";
import { User } from "../../../../routes/api-webapp/authentication/user/user-model";
import { Company } from "../../../../routes/api-webapp/company/company-model";
import { authMiddleware } from "../../../../middleware/auth.middleware";
import { errorResponse, unauthorized, serverError } from "../../../../utils/responseHandler";
import { employeeProfilePhotoUpload, employeeResumeUpload, employeeDocumentUpload } from "../../../../services/multer";
import fs from "fs";
import path from "path";
import configs from "../../../../config/config";
import environment from "../../../../../environment";
import { Otp } from "../../../../routes/api-webapp/otp/otp-model";
import { Op } from "sequelize";
import * as speakeasy from "speakeasy";
import ErrorLogger from "../../../../db/core/logger/error-logger";


const router = express.Router();

// ===== EMPLOYEE CREATION & REGISTRATION =====

/**
 * POST /employee/register
 * Create a new employee
 * Step 1: Create/Update user entry with basic details
 * Step 2: Create employee entry linked to user
 * Required: firstName, lastName, email, contactNumber, companyId, employeeId
 */
router.post("/register", authMiddleware, async (req: Request, res: Response): Promise<void> => {
    const t = await dbInstance.transaction();
    try {
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
            // Skills
            skills,
            // Optional fields
            ...restData
        } = req.body;

        //  Helper function to extract numeric part from contact number
        const extractNumericContactNumber = (contact: string | null | undefined): string | null => {
            if (!contact) return null;
            return String(contact).replace(/\D/g, '').slice(-10) || null; // Get last 10 digits
        };

        //  Helper function to ensure country code has + prefix
        const ensureCountryCodePrefix = (code: string | null | undefined): string | null => {
            if (!code) return null;
            const trimmed = String(code).trim();
            return trimmed.startsWith('+') ? trimmed : `+${trimmed}`;
        };

        //  Sanitize primary contact number and country codes
        const sanitizedContactNumber = extractNumericContactNumber(contactNumber);
        const sanitizedIsdCode = ensureCountryCodePrefix(isdCode);
        const sanitizedIsoCode = isoCode && String(isoCode).trim() !== '' && String(isoCode) !== 'undefined'
            ? String(isoCode).trim().toUpperCase()
            : null;

        //  Sanitize emergency contact number and country codes
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

        //  Validate required user fields
        if (!firstName || !lastName || !email || !sanitizedContactNumber || !companyId || !employeeId) {
            await t.rollback();
            res.status(400).json({
                success: false,
                message: "Required fields missing: firstName, lastName, email, contactNumber (numeric), companyId, employeeId",
            });
            return;
        }

        //  Verify Company exists
        const parentCompany = await Company.findByPk(companyId, { transaction: t });
        if (!parentCompany) {
            await t.rollback();
            res.status(404).json({
                success: false,
                message: "Company not found",
            });
            return;
        }

        //  STEP 1: Create or get User entry with basic details
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

        //  Check for duplicate employee ID in this company
        const existingEmployeeId = await checkEmployeeIdExists(employeeId, companyId);
        if (existingEmployeeId) {
            await t.rollback();
            res.status(409).json({
                success: false,
                message: "Employee ID already exists in this company",
            });
            return;
        }

        //  Verify Reporting Manager if provided
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

        //  Check for duplicate Aadhar if provided (GLOBAL - not per company)
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

        //  Check for duplicate PAN if provided (GLOBAL - not per company)
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

        //  STEP 2: Create employee entry linked to user
        const employee = await addEmployee(
            {
                userId: user.id,
                companyId,
                employeeId,
                firstName,
                lastName,
                email,
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
                // Skills array - handle stringified JSON and various input formats
                skills: (() => {
                    if (!skills) return [];
                    if (Array.isArray(skills)) return skills;
                    if (typeof skills === 'string') {
                        try {
                            const parsed = JSON.parse(skills);
                            return Array.isArray(parsed) ? parsed : [parsed];
                        } catch {
                            return [skills];
                        }
                    }
                    return [skills];
                })(),
                ...Object.fromEntries(
                    Object.entries(restData).map(([key, value]) => [
                        key,
                        value === "" ? null : value,
                    ])
                ),
            } as EmployeePayload,
            t
        );

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
                employee: {
                    id: employee.id,
                    firstName: employee.firstName,
                    lastName: employee.lastName,
                    email: employee.email,
                    employeeId: employee.employeeId,
                    designation: employee.designation,
                    employeeStatus: employee.employeeStatus,
                },
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
 * Get employee by ID (from employee table only, no user data)
 * Also includes all employee documents
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

        // Get employee documents
        const documents = await getEmployeeDocuments(id, employee.companyId);

        res.status(200).json({
            success: true,
            message: "Employee retrieved successfully",
            data: {
                ...employee.toJSON(),
                documents: documents || [],
            },
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
router.put("/update/:id", tokenMiddleWare, async (req: Request, res: Response): Promise<void> => {
    const t = await dbInstance.transaction();

    try {
        let id = req.params.id;
        if (Array.isArray(id)) id = id[0];

        const updateData = req.body;
        // Extract and process skills array
        const { skills } = updateData;
        if (skills !== undefined) {
            // Handle stringified JSON and various input formats
            updateData.skills = (() => {
                if (!skills) return [];
                if (Array.isArray(skills)) return skills;
                if (typeof skills === 'string') {
                    try {
                        const parsed = JSON.parse(skills);
                        return Array.isArray(parsed) ? parsed : [parsed];
                    } catch {
                        return [skills];
                    }
                }
                return [skills];
            })();
        }
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

        //  Verify employee exists
        const employee = await getEmployeeById(id);

        if (!employee || employee.isDeleted) {
            await t.rollback();
            res.status(404).json({
                success: false,
                message: "Employee not found",
            });
            return;
        }

        //  Verify company ownership
        if (employee.companyId !== companyId) {
            await t.rollback();
            res.status(403).json({
                success: false,
                message: "Employee does not belong to this company",
            });
            return;
        }

        //  Helper function to extract numeric part from contact number
        const extractNumericContactNumber = (contact: string | null | undefined): string | null => {
            if (!contact) return null;
            return String(contact).replace(/\D/g, '').slice(-10) || null; // Get last 10 digits
        };

        //  Helper function to ensure country code has + prefix
        const ensureCountryCodePrefix = (code: string | null | undefined): string | null => {
            if (!code) return null;
            const trimmed = String(code).trim();
            return trimmed.startsWith('+') ? trimmed : `+${trimmed}`;
        };

        //  Sanitize primary contact number and country codes if provided
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

        //  Sanitize emergency contact number and country codes if provided
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

        //  Check for duplicate Aadhar if being updated
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

        //  Check for duplicate PAN if being updated
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

        //  Verify Reporting Manager if being updated
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

        //  Update employee with sanitized data
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

            //  Verify employee exists and belongs to company
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

            //  Delete old profile photo if exists
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

            //  Update employee with new profile photo path
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

            //  Verify employee exists and belongs to company
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

            //  Check if profile photo exists
            if (!employee.profilePhoto) {
                await t.rollback();
                res.status(400).json({
                    success: false,
                    message: "Employee has no profile photo to remove",
                });
                return;
            }

            //  Delete profile photo from file system
            try {
                const photoPath = path.join(process.cwd(), 'src', 'public', employee.profilePhoto.replace(/^\//, ''));
                if (fs.existsSync(photoPath)) {
                    fs.unlinkSync(photoPath);
                }
            } catch (err) {
                console.error("[employee/removeProfilePhoto] Error deleting photo file:", err);
            }

            //  Update employee to remove profile photo reference
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

// ===== RESUME MANAGEMENT =====

/**
 * POST /employee/uploadResume/:employeeId
 * Upload employee resume
 * Body: Form data with file field containing the resume (PDF, DOC, DOCX)
 */
router.post(
    "/uploadResume/:employeeId",
    tokenMiddleWare,
    employeeResumeUpload.single("file"),
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

            // Verify employee exists and belongs to company
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
                    message: "Unauthorized: Employee does not belong to your company",
                });
                return;
            }

            // Delete old resume if exists
            if (employee.resumeFilePath) {
                try {
                    const oldFilePath = path.join(
                        process.cwd(),
                        "src",
                        "public",
                        employee.resumeFilePath.replace(/^\//, "")
                    );
                    if (fs.existsSync(oldFilePath)) {
                        fs.unlinkSync(oldFilePath);
                    }
                } catch (err) {
                    console.error("[employee/uploadResume] Error deleting old resume:", err);
                }
            }

            // Construct the relative path for storage
            const resumePath = `/employee/resume/${req.file.filename}`;

            // Update employee with resume path
            await updateEmployee(employeeId, { resumeFilePath: resumePath } as EmployeePayload, t);

            await t.commit();

            res.status(200).json({
                success: true,
                message: "Resume uploaded successfully",
                data: {
                    employeeId,
                    resumeFilePath: resumePath,
                    filename: req.file.filename,
                },
            });
        } catch (err) {
            await t.rollback();
            console.error("[employee/uploadResume] ERROR:", err);
            ErrorLogger.write({ type: "uploadEmployeeResume error", error: err });
            res.status(500).json({
                success: false,
                message: "Server error",
                error: process.env.NODE_ENV === "development" ? err : undefined,
            });
        }
    }
);

/**
 * PATCH /employee/removeResume/:employeeId
 * Remove employee resume
 */
router.patch(
    "/removeResume/:employeeId",
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

            // Verify employee exists and belongs to company
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
                    message: "Unauthorized: Employee does not belong to your company",
                });
                return;
            }

            // Get current resume path for file deletion
            const currentResumePath = employee.resumeFilePath;

            // Update employee to remove resume reference
            await updateEmployee(employeeId, { resumeFilePath: null } as EmployeePayload, t);

            // Delete file from disk if it exists
            if (currentResumePath) {
                try {
                    const filePath = path.join(
                        process.cwd(),
                        "src",
                        "public",
                        currentResumePath.replace(/^\//, "")
                    );
                    if (fs.existsSync(filePath)) {
                        fs.unlinkSync(filePath);
                    }
                } catch (err) {
                    console.error("[employee/removeResume] Error deleting resume file:", err);
                }
            }

            await t.commit();

            res.status(200).json({
                success: true,
                message: "Resume removed successfully",
            });
        } catch (err) {
            await t.rollback();
            console.error("[employee/removeResume] ERROR:", err);
            ErrorLogger.write({ type: "removeEmployeeResume error", error: err });
            res.status(500).json({
                success: false,
                message: "Server error",
                error: process.env.NODE_ENV === "development" ? err : undefined,
            });
        }
    }
);

// ===== EMPLOYEE LOGIN =====

/**
 * POST /employee/login
 * Employee login with:
 * 1. email + OTP (no 2FA required)
 * 2. email/contact + password (2FA required if enabled)
 * Allows all user types to login (not restricted to clients)
 */
router.post("/employee-login", async (req: Request, res: Response): Promise<void> => {

    const t = await dbInstance.transaction();

    try {
        const { email, contact, password, otp, twofactorToken, backupCode } = req.body;

        // ===============================
        // EMAIL + OTP LOGIN (user table)
        // ===============================
        if (email && otp) {
            const user: any = await User.findOne({
                where: { email, isDeleted: false },
                transaction: t,
            });

            // Ensure OTP record exists and is valid (not used and not expired)
            const otpRecord: any = await Otp.findOne({
                where: {
                    email,
                    otp: String(otp),
                    otpVerify: false,
                    otpExpiresAt: { [Op.gt]: new Date() },
                },
                transaction: t,
            });

            if (!user || !otpRecord) {
                await t.rollback();
                res.status(401).json({ success: false, message: "Invalid email or OTP." });
                return;
            }

            if (!user.isActive) {
                await t.rollback();
                res.status(403).json({
                    success: false,
                    message: "Your account is deactivated. Please contact support.",
                });
                return;
            }

            // Check if user is a client - clients cannot login through this endpoint
            if (user.userType === 'client') {
                await t.rollback();
                res.status(403).json({
                    success: false,
                    message: "Clients cannot login through this endpoint. Please use the client login endpoint.",
                });
                return;
            }

            // Mark OTP as used
            otpRecord.set({ otpVerify: true, otp: null, otpExpiresAt: null });
            await otpRecord.save({ transaction: t });

            // Ensure user's email verified flag is set
            if (!user.isEmailVerified) {
                await user.update({ isEmailVerified: true }, { transaction: t });
            }

            const isFirstLogin = user.isFirstLogin || false;
            if (isFirstLogin) {
                await user.update({ isFirstLogin: false }, { transaction: t });
            }

            const token = await generateToken(
                { userId: user.id, email: user.email, role: user.userType, companyId: user.companyId },
                "7d"
            );

            await t.commit();

            res.status(200).json({
                success: true,
                message: "Login successful!",
                data: {
                    userId: user.id,
                    email: user.email || email,
                    contact: user.contact || null,
                    companyId: user.companyId,
                    firstName: user.firstName,
                    lastName: user.lastName,
                    userType: user.userType,
                    isFirstLogin,
                    token,
                    twofactorEnabled: user.twofactorEnabled || false,
                },
            });
            return;
        }

        // =====================================
        // EMAIL / CONTACT + PASSWORD LOGIN
        // =====================================
        if ((email || contact) && password) {
            const whereClause: any = { isDeleted: false };
            if (email) whereClause.email = email;
            if (contact) whereClause.contact = contact;

            const user: any = await User.findOne({ where: whereClause, transaction: t });

            if (!user || !user.validatePassword(password)) {
                await t.rollback();
                res.status(401).json({ success: false, message: "Invalid credentials." });
                return;
            }

            if (!user.isActive) {
                await t.rollback();
                res.status(403).json({
                    success: false,
                    message: "Your account is deactivated. Please contact support.",
                });
                return;
            }

            // Check if user is a client - clients cannot login through this endpoint
            if (user.userType === 'client') {
                await t.rollback();
                res.status(403).json({
                    success: false,
                    message: "Clients cannot login through this endpoint. Please use the client login endpoint.",
                });
                return;
            }

            // ==============
            // 2FA HANDLING
            // ==============
            if (user.twofactorEnabled && user.twofactorVerified) {
                if (!twofactorToken && !backupCode) {
                    await t.rollback();
                    res.status(200).json({
                        success: true,
                        requires2FA: true,
                        message: "Password verified. Please provide 2FA code.",
                        data: { userId: user.id, email: user.email, twofactorEnabled: true },
                    });
                    return;
                }

                if (twofactorToken) {
                    const verified = speakeasy.totp.verify({
                        secret: user.twofactorSecret,
                        encoding: "base32",
                        token: String(twofactorToken),
                        window: 2,
                    });

                    if (!verified) {
                        await t.rollback();
                        res.status(401).json({ success: false, requires2FA: true, message: "Invalid 2FA token." });
                        return;
                    }
                }

                if (backupCode) {
                    const backupCodes = user.twofactorBackupCodes || [];
                    const index = backupCodes.findIndex((code: string) => code === String(backupCode).toUpperCase());
                    if (index === -1) {
                        await t.rollback();
                        res.status(401).json({ success: false, requires2FA: true, message: "Invalid backup code." });
                        return;
                    }
                    backupCodes.splice(index, 1);
                    await user.update({ twofactorBackupCodes: backupCodes }, { transaction: t });
                }
            }

            const isFirstLogin = user.isFirstLogin || false;
            if (isFirstLogin) await user.update({ isFirstLogin: false }, { transaction: t });

            const token = await generateToken(
                { userId: user.id, email: user.email || email, role: user.userType, companyId: user.companyId },
                "7d"
            );

            await t.commit();

            res.status(200).json({
                success: true,
                message: "Login successful!",
                data: {
                    userId: user.id,
                    email: user.email || email || null,
                    contact: user.contact || contact || null,
                    companyId: user.companyId,
                    firstName: user.firstName,
                    lastName: user.lastName,
                    userType: user.userType,
                    isFirstLogin,
                    token,
                    twofactorEnabled: user.twofactorEnabled || false,
                },
            });
            return;
        }

        await t.rollback();
        res.status(400).json({ success: false, message: "Invalid login request." });

    } catch (error: any) {
        await t.rollback();
        console.error("[POST /employee/login] ERROR:", error);
        ErrorLogger.write({ type: "employee login error", error });
        serverError(res, error.message || "Login failed.");
    }
});

// ===== EMPLOYEE DOCUMENT MANAGEMENT (NEW) =====

/**
 * POST /employee/uploadDocument/:employeeId
 * Upload employee document
 * Body: Form data with file field
 */
router.post(
    "/uploadDocument/:employeeId",
    tokenMiddleWare,
    employeeDocumentUpload.single("file"),
    async (req: Request, res: Response): Promise<void> => {
        const t = await dbInstance.transaction();
        try {
            let { employeeId } = req.params;
            if (Array.isArray(employeeId)) employeeId = employeeId[0];

            const user = (req as any).user;

            // Validation
            if (!user || !user.companyId) {
                await t.rollback();
                res.status(401).json({
                    success: false,
                    message: "Unauthorized: companyId missing",
                });
                return;
            }

            if (!req.file) {
                await t.rollback();
                res.status(400).json({
                    success: false,
                    message: "No file uploaded",
                });
                return;
            }

            const { companyId } = user;

            // Verify employee exists and belongs to company
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
                    message: "Unauthorized: Employee does not belong to your company",
                });
                return;
            }

            // Construct the relative path for storage
            const documentPath = `/employee/documents/${req.file.filename}`;

            // Add employee document in database
            await addEmployeeDocument(
                employeeId,
                companyId,
                documentPath,
                t
            );

            await t.commit();

            res.status(200).json({
                success: true,
                message: "Document uploaded successfully",
                data: {
                    employeeId,
                    documentPath,
                    filename: req.file.filename,
                },
            });
        } catch (err) {
            await t.rollback();
            console.error("[employee/uploadDocument] ERROR:", err);
            ErrorLogger.write({ type: "uploadEmployeeDocument error", error: err });
            res.status(500).json({
                success: false,
                message: "Server error",
                error: process.env.NODE_ENV === "development" ? err : undefined,
            });
        }
    }
);

/**
 * DELETE /employee/removeDocument/:documentId
 * Remove employee document
 */
router.delete(
    "/removeDocument/:documentId",
    tokenMiddleWare,
    async (req: Request, res: Response): Promise<void> => {
        const t = await dbInstance.transaction();
        try {
            let { documentId } = req.params;
            if (Array.isArray(documentId)) documentId = documentId[0];

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

            // Get document
            const document = await getEmployeeDocumentById(documentId);

            if (!document) {
                await t.rollback();
                res.status(404).json({
                    success: false,
                    message: "Document not found",
                });
                return;
            }

            // Verify document belongs to a company employee
            if (document.companyId !== companyId) {
                await t.rollback();
                res.status(403).json({
                    success: false,
                    message: "Unauthorized: Document does not belong to your company",
                });
                return;
            }

            // Get file path for deletion
            const filePath = document.documentPath;

            // Delete document
            await removeEmployeeDocument(documentId, t);

            // Delete file from disk if it exists
            if (filePath) {
                try {
                    const fullPath = path.join(
                        process.cwd(),
                        "src",
                        "public",
                        filePath.replace(/^\//, "")
                    );
                    if (fs.existsSync(fullPath)) {
                        fs.unlinkSync(fullPath);
                    }
                } catch (err) {
                    console.error("[employee/removeDocument] Error deleting file:", err);
                }
            }

            await t.commit();

            res.status(200).json({
                success: true,
                message: "Document removed successfully",
            });
        } catch (err) {
            await t.rollback();
            console.error("[employee/removeDocument] ERROR:", err);
            ErrorLogger.write({ type: "removeEmployeeDocument error", error: err });
            res.status(500).json({
                success: false,
                message: "Server error",
                error: process.env.NODE_ENV === "development" ? err : undefined,
            });
        }
    }
);

export default router;
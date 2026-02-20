import { Transaction } from "sequelize";
import { Ticket } from "./ticket-model";
import { Op } from "sequelize";
import { TicketAssignment } from "../ticket-assignment/ticket-assignment-model";
import { Company } from "../../company/company-model";
import { Clients } from "../../agency/clients/clients-model";
import { Employee } from "../../agency/employee/employee-model";
import { User } from "../../authentication/user/user-model";
import { Role } from "../../roles/role-model";
import { v4 as uuidv4 } from "uuid";
import { createTicketTimeline } from "../ticket-timeline/ticket-timeline-handler";
import { TicketTimeline } from "../ticket-timeline/ticket-timeline-model";
import { TicketAttachment } from "../ticket-attachments/ticket-attachments-model";
import { ManagerHandover } from "../manager-handover/manager-handover-model";
import { getActiveHandoverForActor } from "../manager-handover/manager-handover-handler";
import { assignEmployeeToTicket } from "../ticket-assignment/ticket-assignment-handler";
import { getAssignedUsersForClient } from "../../agency/client-assignment/client-assignment-handler";
import { unauthorized, serverError, successResponse, errorResponse } from "src/utils/responseHandler";
import { throwValidation } from "../../it-Management/it-Assets-Management/it-Assets-Management-handler";
export const generateTicketNumber = async (
    transaction: Transaction
): Promise<{ ticketId: string; ticketNumber: string }> => {
    let ticketId = uuidv4();
    const hex = ticketId.replace(/-/g, '');
    const num = BigInt('0x' + hex);
    let ticketNumber = num.toString(36).toUpperCase().slice(0, 6);

    let exists = await Ticket.findOne({
        where: { ticketNumber },
        transaction
    });
    if (!exists) {
        return { ticketId, ticketNumber };
    }
    else {
        while (exists) {
            ticketId = uuidv4();
            const hex = ticketId.replace(/-/g, '');
            const num = BigInt('0x' + hex);
            ticketNumber = num.toString(36).toUpperCase().slice(0, 6);
            exists = await Ticket.findOne({
                where: { ticketNumber },
                transaction
            });
        }
    }

    return { ticketId, ticketNumber };
};

export interface CreateTicketPayload {
    title: string;
    description: string;
    priority?: "Low" | "Medium" | "High";
    expectedDate?: Date;

    companyId?: string;
    clientId?: string;
    assignedManagerId?: string;
    assignedEmployeeIds?: string[];
    deliveryDate?: Date;
    isMultiAssignee?: boolean;
}

export interface TicketFilters {
    companyId?: string;
    clientId?: string;
    assignedManagerId?: string;
    priority?: "Low" | "Medium" | "High";
    overallStatus?: "Pending" | "Processing" | "Hold" | "Review" | "Changes" | "Completed";
    startDate?: string;
    endDate?: string;
}

const isValidPriority = (value: any): value is "Low" | "Medium" | "High" => {
    return ["Low", "Medium", "High"].includes(value);
};

const isValidStatus = (
    value: any
): value is "Pending" | "Processing" | "Review" | "Changes" | "Completed" | "Hold" => {
    return ["Pending", "Processing", "Review", "Changes", "Completed", "Hold"].includes(value);
};


// Helper function to calculate dueStatus based on delivery date
export const calculateLabel = (deliveryDate: Date | null, overallStatus?: string): "Today" | "Last Day" | "Exceeded" | null => {
    if (!deliveryDate) {
        return null;
    }
    if (overallStatus === "Completed") {
        return null;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);


    const delivery = new Date(deliveryDate);
    delivery.setHours(0, 0, 0, 0);


    const diffInDays = Math.floor((delivery.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (diffInDays < 0) {
        return "Exceeded";
    } else if (diffInDays === 0) {
        return "Today";
    } else if (diffInDays === 1) {
        return "Last Day";
    } else {
        return null;
    }
};

//helper function for calculating delay days
export const calculateDelayDays = (
    deliveryDate: Date | null,
    completedAt: Date | null,
    overallStatus: string
): number | null => {

    if (!deliveryDate) return null;

    const endDate =
        overallStatus === "Completed" && completedAt
            ? new Date(completedAt)
            : new Date();

    const delivery = new Date(deliveryDate);
    delivery.setHours(0, 0, 0, 0);
    endDate.setHours(0, 0, 0, 0);

    const diffInMs = endDate.getTime() - delivery.getTime();
    const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));

    return diffInDays > 0 ? diffInDays : 0;
};

// (previously had helper to enrich tickets) label/delayDays will be calculated inline where needed

export const createTicket = async (
    payload: CreateTicketPayload,
    user: any,
    transaction: Transaction
) => {
    const { ticketId, ticketNumber } = await generateTicketNumber(transaction);

    let ticketData;
    if (!user) throw new Error("User not found");

    let role: string;
    let clientId: string | undefined;

    if (user.userType === "client") {

        role = "client";

        const client = await Clients.findOne({
            where: { userId: user.id },
            transaction
        });

        clientId = client?.id;

    }
    else if (user.userType === "agency") {

        role = "admin";

    }
    else if (user.userType === "employee") {

        if (!user.roleId) {
            throw new Error("Employee role not assigned");
        }

        const roleRecord = await Role.findByPk(user.roleId, { transaction });

        if (!roleRecord) {
            throw new Error("Role not found");
        }

        role = roleRecord.name.toLowerCase();

    }
    else {

        throw new Error("Invalid user type");

    }

    const userContext = {
        userId: user.id,
        role,
        clientId,
        companyId: user.companyId || undefined
    };

    const expectedDate = payload.expectedDate ? new Date(payload.expectedDate) : null;
    const deliveryDate = payload.deliveryDate ? new Date(payload.deliveryDate) : null;

    if (userContext.role === "client") {
        const client = await Clients.findByPk(userContext.clientId, { transaction });
        if (!client) throw new Error("Client not found");

        let managerEmployeeId: string | null = payload.assignedManagerId ?? null;
        if (!managerEmployeeId) {
            const assigned = await getAssignedUsersForClient(userContext.clientId!, transaction);
            managerEmployeeId = assigned.managers?.[0]?.employeeId ?? null;
        }
        if (!managerEmployeeId) {
            throw new Error("No manager assigned to client");
        }
        if (payload.priority && !isValidPriority(payload.priority)) {
            const err = new Error("Invalid priority value");
            err.name = "ValidationError";
            throw err;
        }
        if (!payload.title || payload.title.trim().length < 3) {
            throw new Error("Title must be at least 3 characters");
        }

        if (!payload.description || payload.description.trim().length < 5) {
            throw new Error("Description must be at least 5 characters");
        }

        if (expectedDate && isNaN(expectedDate.getTime())) {
            throwValidation("Invalid expectedDate");
        }
        if (deliveryDate && isNaN(deliveryDate.getTime())) {
            throwValidation("Invalid deliveryDate");
        }
        ticketData = {
            id: ticketId,
            ticketNumber,
            companyId: client.companyId!,
            clientId: userContext.clientId!,
            assignedManagerId: managerEmployeeId,
            createdByUserId: userContext.userId,
            title: payload.title,
            description: payload.description,
            priority: payload.priority || "Low",
            overallStatus: "Pending" as const,
            deliveryDate: null,
            expectedDate: expectedDate || null,
            isMultiAssignee: false,
            isActive: true,
            isDeleted: false,
        };
    } else {
        // Infer missing fields where reasonable:
        // - companyId can default to authenticated user's company
        payload.companyId = payload.companyId as any || user.companyId;

        // Resolve assignedManagerId if not provided
        let inferredAssignedManagerId: string | null = payload.assignedManagerId ?? null;

        if (!inferredAssignedManagerId) {
            // If creator is an employee, prefer their Employee record when they are a manager
            if (user.userType === 'employee') {
                const emp = await Employee.findOne({ where: { userId: user.id }, transaction });
                if (emp) {
                    if (role === 'manager') {
                        inferredAssignedManagerId = emp.id;
                    } else if (payload.clientId) {
                        const assigned = await getAssignedUsersForClient(payload.clientId, transaction);
                        inferredAssignedManagerId = assigned.managers?.[0]?.employeeId ?? null;
                    }
                } else if (payload.clientId) {
                    const assigned = await getAssignedUsersForClient(payload.clientId, transaction);
                    inferredAssignedManagerId = assigned.managers?.[0]?.employeeId ?? null;
                }
            } else {
                // agency/admin: derive manager from client assignment if clientId provided
                if (payload.clientId) {
                    const assigned = await getAssignedUsersForClient(payload.clientId, transaction);
                    inferredAssignedManagerId = assigned.managers?.[0]?.employeeId ?? null;
                }
            }
        }

        // Apply inferred manager if found
        // If multiple managers provided (minimal support), prefer first as primary
        const providedAssignedManagerIds = (payload as any).assignedManagerIds;
        if (!inferredAssignedManagerId && providedAssignedManagerIds && Array.isArray(providedAssignedManagerIds) && providedAssignedManagerIds.length > 0) {
            inferredAssignedManagerId = providedAssignedManagerIds[0];
        }

        if (inferredAssignedManagerId) payload.assignedManagerId = inferredAssignedManagerId;

        // Basic validation after inference
        if (!payload.companyId || !payload.clientId || !payload.assignedManagerId) {
            throw new Error("companyId, clientId, and assignedManagerId required");
        }

        // Validate assignedManagerId refers to an active employee in same company
        const managerRecord = await Employee.findOne({ where: { id: payload.assignedManagerId, companyId: payload.companyId, isActive: true } });
        if (!managerRecord) {
            throw new Error("Invalid assignedManagerId");
        }

        if (payload.priority && !isValidPriority(payload.priority)) {
            const err = new Error("Invalid priority value");
            err.name = "ValidationError";
            throw err;
        }
        if (!payload.title || payload.title.trim().length < 3) {
            throw new Error("Title must be at least 3 characters");
        }

        if (!payload.description || payload.description.trim().length < 5) {
            throw new Error("Description must be at least 5 characters");
        }
        if (expectedDate && isNaN(expectedDate.getTime())) {
            throwValidation("Invalid expectedDate");
        }
        if (deliveryDate && isNaN(deliveryDate.getTime())) {
            throwValidation("Invalid deliveryDate");
        }
        ticketData = {
            id: ticketId,
            ticketNumber,
            companyId: payload.companyId,
            clientId: payload.clientId,
            assignedManagerId: payload.assignedManagerId,
            createdByUserId: userContext.userId,
            title: payload.title,
            description: payload.description,
            priority: payload.priority || "Low",
            overallStatus: "Pending" as const,
            deliveryDate: deliveryDate || null,
            expectedDate: expectedDate || null,
            isMultiAssignee: payload.isMultiAssignee || false,
            isActive: true,
            isDeleted: false,
        };
    }

    const ticket = await Ticket.create(ticketData, { transaction });
    // Prepare assigned employee ids (company-side flow) and create assignments now
    const assignedEmployeeIds = (payload as any).assignedEmployeeIds;
    const uniqueEmpIds = assignedEmployeeIds && Array.isArray(assignedEmployeeIds) ? [...new Set(assignedEmployeeIds)] : [];
    if (uniqueEmpIds.length > 0) {
        for (const empId of uniqueEmpIds) {
            const emp = await Employee.findOne({ where: { id: empId, companyId: ticket.companyId, isDeleted: false, isActive: true }, transaction });
            if (!emp) throw new Error(`Assigned employee ${empId} not found or not active in company`);
        }
        for (const empId of uniqueEmpIds) {
            await assignEmployeeToTicket(ticket.id, empId, userContext.userId, "Employee", transaction);
        }
        if (uniqueEmpIds.length > 1) {
            await ticket.update({ isMultiAssignee: true }, { transaction });
        }
    }

    // Minimal multi-manager support: if creator supplied assignedManagerIds (array), create TicketAssignment rows for each
    const assignedManagerIds = (payload as any).assignedManagerIds;
    const uniqueManagerIds = assignedManagerIds && Array.isArray(assignedManagerIds) ? [...new Set(assignedManagerIds)] : [];
    if (uniqueManagerIds.length > 0) {
        // validate each manager belongs to same company and is active
        for (const mgrId of uniqueManagerIds) {
            const mgr = await Employee.findOne({ where: { id: mgrId, companyId: ticket.companyId, isDeleted: false, isActive: true }, transaction });
            if (!mgr) throw new Error(`Assigned manager ${mgrId} not found or not active in company`);
        }
        const empAssignedSet = new Set(uniqueEmpIds);
        for (const mgrId of uniqueManagerIds) {
            // avoid duplicating assignment if manager is also included in assignedEmployeeIds
            if (empAssignedSet.has(mgrId)) continue;
            await assignEmployeeToTicket(ticket.id, mgrId, userContext.userId, "Manager", transaction);
        }
        // set primary assignedManagerId to first manager if different
        if (uniqueManagerIds.length > 0 && ticket.assignedManagerId !== uniqueManagerIds[0]) {
            await ticket.update({ assignedManagerId: uniqueManagerIds[0] }, { transaction });
        }
    }

    await createTicketTimeline(
        {
            ticketId: ticket.id,
            changedBy: userContext.userId,
            changeType: "status",
            oldValue: null,
            newValue: "Pending",
        },
        transaction
    );

    // Check if assigned manager has active handovers (for shared access tracking)
    // Tickets stay with original manager; backup managers access via handover relationship
    if (ticketData.assignedManagerId) {
        const activeHandovers = await ManagerHandover.findAll({
            where: {
                managerId: ticketData.assignedManagerId,
                status: "Active",
                companyId: ticketData.companyId,
            },
            transaction
        });

        // If handovers exist, log for tracking (backup managers see via getTicketsList query)
        if (activeHandovers.length > 0) {
            console.log(`[CREATE TICKET] Manager ${ticketData.assignedManagerId} has ${activeHandovers.length} active handover(s) - backup managers will have shared access`);
            // Note: We don't change assignedManagerId for shared access model
            // getTicketsList will show this ticket to all backup managers
        }
    }

    return ticket;
};

// Get ticket by ID with related data
export const getTicketById = async (user: any, ticketId: string) => {
    try {
        const ticket = await Ticket.findOne({
            where: {
                id: ticketId,
                isActive: true,
                isDeleted: false,
            },
            include: [
                // {
                //     model: Company,
                //     as: "company",
                //     attributes: ["id", "name"],
                // },
                {
                    model: Clients,
                    as: "client",
                    attributes: ["id", "businessName", "email", "contact"],
                },
                {
                    model: TicketAttachment,
                    as: "attachments",
                    attributes: ["id", "attachmentPath", "createdAt"],
                },
                {
                    model: TicketTimeline,
                    as: "timelines",
                    attributes: ["id", "changedBy", "changeType", "oldValue", "newValue", "createdAt"],
                    separate: true,
                    order: [["createdAt", "ASC"]],
                },
                {
                    model: TicketAssignment,
                    as: "assignments",
                    attributes: ["id", "employeeId", "employeeTicketStatus", "createdAt", "updatedAt"],
                    include: [
                        {
                            association: "employee",
                            attributes: ["id", "profilePhoto", "designation", "employeeStatus"],
                            include: [
                                { association: "user", attributes: ["firstName", "lastName", "email", "contact"] }
                            ]
                        },
                        { association: "assignedByUser", attributes: ["id", "firstName", "lastName", "email"] }
                    ]
                }
            ],
        });
        if (!ticket) return null;
        if (!user) return null;

        // Capture plain data immediately so it remains available across awaits
        // Use `any` because Sequelize's `.get({ plain: true })` includes
        // association properties (like `assignments`) that are not present
        // on the model's TS type. Casting to `any` avoids the TS error while
        // keeping runtime behaviour unchanged.
        const plainTicket: any = ticket.get({ plain: true });
        const {
            id: foundTicketId,
            companyId: ticketCompanyId,
            clientId: ticketClientId,
            assignedManagerId: ticketAssignedManagerId,
            deliveryDate,
            completedAt,
            overallStatus,
        } = plainTicket;

        // Compute displayDate: earliest assignment.createdAt or ticket.createdAt
        let displayDate: any = plainTicket.createdAt;
        if (plainTicket.assignments && Array.isArray(plainTicket.assignments) && plainTicket.assignments.length) {
            const earliest = plainTicket.assignments.reduce((acc: any, a: any) => {
                if (!acc) return a.createdAt;
                return new Date(a.createdAt) < new Date(acc) ? a.createdAt : acc;
            }, null);
            if (earliest) displayDate = earliest;
        }

        // CLIENT ACCESS CHECK (highest priority - check first)
        if (user.userType === "client") {
            const clientRecord = await Clients.findOne({
                where: { userId: user.id, isActive: true, isDeleted: false }
            });
            if (clientRecord && ticketClientId === clientRecord.id) {
                return {
                    ...plainTicket,
                    displayDate,
                    label: calculateLabel(deliveryDate, overallStatus),
                    delayDays: calculateDelayDays(deliveryDate, completedAt, overallStatus)
                };
            }
            const err: any = new Error("Unauthorized");
            err.name = "UnauthorizedError";
            throw err;
        }

        // ROLE-BASED ACCESS (for employees/admins)
        // Priority: 0=SuperAdmin, 10=CompanyAdmin, 20=Manager, 30=Employee
        let rolePriority = 999; // default: deny
        if (user.roleId) {
            const role = await Role.findByPk(user.roleId);
            rolePriority = role ? role.priority : 999;
        }
        // No special case for agency - all users (agency/employee) must have roleId

        // SuperAdmin (priority 0) - can access all tickets
        if (rolePriority === 0) {
            return {
                ...plainTicket,
                displayDate,
                label: calculateLabel(deliveryDate, overallStatus),
                delayDays: calculateDelayDays(deliveryDate, completedAt, overallStatus)
            };
        }

        // All non-superadmin users must belong to the same company
        if (ticketCompanyId !== user.companyId) {
            const err: any = new Error("Unauthorized");
            err.name = "UnauthorizedError";
            throw err;
        }

        // Company Admin (priority 10) - can access all tickets in their company
        if (rolePriority === 10) {
            return {
                ...plainTicket,
                displayDate,
                label: calculateLabel(deliveryDate, overallStatus),
                delayDays: calculateDelayDays(deliveryDate, completedAt, overallStatus)
            };
        }

        // Manager (priority 20) - can access tickets they manage OR tickets via active handover
        if (rolePriority === 20) {
            const managerEmployee = await Employee.findOne({ where: { userId: user.id } });
            if (managerEmployee) {
                // Check direct assignment
                if (ticketAssignedManagerId === managerEmployee.id) {
                    return {
                        ...plainTicket,
                        displayDate,
                        label: calculateLabel(deliveryDate, overallStatus),
                        delayDays: calculateDelayDays(deliveryDate, completedAt, overallStatus)
                    };
                }

                // Check if manager appears as an explicit assignment with roleType 'Manager'
                const managerAssignment = await TicketAssignment.findOne({
                    where: { ticketId: foundTicketId, employeeId: managerEmployee.id, roleType: "Manager", isActive: true }
                });
                if (managerAssignment) {
                    return {
                        ...plainTicket,
                        displayDate,
                        label: calculateLabel(deliveryDate, overallStatus),
                        delayDays: calculateDelayDays(deliveryDate, completedAt, overallStatus)
                    };
                }

                // Check if manager has active handover access to this ticket
                const handoverWhere: any = {
                    backupManagerId: managerEmployee.id,
                    managerId: ticketAssignedManagerId,
                    status: "Active"
                };
                if (user.companyId) {
                    handoverWhere.companyId = user.companyId;
                }

                const handoverAccess = await ManagerHandover.findOne({
                    where: handoverWhere
                });

                if (handoverAccess) {
                    return {
                        ...plainTicket,
                        displayDate,
                        label: calculateLabel(deliveryDate, overallStatus),
                        delayDays: calculateDelayDays(deliveryDate, completedAt, overallStatus)
                    };
                }
            }
            const err: any = new Error("Unauthorized");
            err.name = "UnauthorizedError";
            throw err;
        }

        // Employee (priority 30) - can only access tickets assigned to them
        if (rolePriority === 30) {
            const employee = await Employee.findOne({ where: { userId: user.id } });
            if (employee) {
                const assignment = await TicketAssignment.findOne({
                    where: { ticketId: foundTicketId, employeeId: employee.id }
                });
                if (assignment) {
                    return {
                        ...plainTicket,
                        displayDate,
                        label: calculateLabel(deliveryDate, overallStatus),
                        delayDays: calculateDelayDays(deliveryDate, completedAt, overallStatus)
                    };
                }
            }
            const err: any = new Error("Unauthorized");
            err.name = "UnauthorizedError";
            throw err;
        }

        // Default deny - user has no valid role or access
        const err: any = new Error("Unauthorized");
        err.name = "UnauthorizedError";
        throw err;

    } catch (error) {
        throw error;
    }
};

//Soft delete ticket
export const deleteTicket = async (ticketId: string, companyId: string, transaction: Transaction) => {
    try {
        const ticket = await Ticket.findOne({
            where: {
                id: ticketId,
                companyId: companyId,
                isDeleted: false,
                isActive: true,
            },
            transaction,
        });

        if (!ticket) {
            throw new Error("Ticket not found");
        }

        await ticket.update(
            {
                isDeleted: true,
                isActive: false,
            }, {
            where: { id: ticketId, companyId: companyId },
            transaction: transaction
        }
        );

        return ticket;
    } catch (error) {
        throw error;
    }
};


/**
 * Get tickets by company ID
 */
export const getTicketsByCompanyId = async (companyId: string) => {
    try {
        const tickets = await Ticket.findAll({
            where: {
                companyId,
                isDeleted: false,
            },
            include: [
                {
                    model: Clients,
                    as: "client",
                    attributes: ["id", "businessName", "email"],
                },
            ],
            order: [["createdAt", "DESC"]],
        });

        return tickets.map(ticket => {
            const plain = ticket.get({ plain: true });
            return {
                ...plain,
                label: calculateLabel(plain.deliveryDate, plain.overallStatus),
                delayDays: calculateDelayDays(
                    plain.deliveryDate,
                    plain.completedAt,
                    plain.overallStatus
                )
            };
        });

    } catch (error) {
        throw error;
    }
};

/**
 * Get tickets by client ID
 */
export const getTicketsByClientId = async (clientId: string) => {
    try {
        const tickets = await Ticket.findAll({
            where: {
                clientId,
                isDeleted: false,
            },
            order: [["createdAt", "DESC"]],
        });

        return tickets.map(ticket => {
            const plain = ticket.get({ plain: true });
            return {
                ...plain,
                label: calculateLabel(plain.deliveryDate, plain.overallStatus),
                delayDays: calculateDelayDays(
                    plain.deliveryDate,
                    plain.completedAt,
                    plain.overallStatus
                )
            };
        });

    } catch (error) {
        throw error;
    }
};


export const getTicketsByManagerId = async (managerId: string, showHandover: boolean = false) => {
    try {
        let whereClause: any;

        if (showHandover) {
            const activeHandovers = await ManagerHandover.findAll({
                where: {
                    backupManagerId: managerId,
                    status: "active",
                },
                attributes: ["id"],
            });

            const handoverIds = activeHandovers.map((h) => h.id);
            whereClause = {
                [Op.or]: [
                    {
                        assignedManagerId: managerId,
                        lastHandoverId: null,
                    },
                    ...(handoverIds.length > 0
                        ? [
                            {
                                assignedManagerId: managerId,
                                lastHandoverId: {
                                    [Op.in]: handoverIds,
                                },
                            },
                        ]
                        : []),
                    // Also include tickets where manager is an explicit assignee with roleType = 'Manager'
                    {
                        '$assignments.id$': { [Op.ne]: null }
                    }
                ],
                isDeleted: false,
            };
        } else {
            whereClause = {
                [Op.or]: [
                    { assignedManagerId: managerId, lastHandoverId: null },
                    { '$assignments.id$': { [Op.ne]: null } }
                ],
                isDeleted: false,
            };
        }

        const tickets = await Ticket.findAll({
            where: whereClause,
            include: [
                {
                    model: TicketAssignment,
                    as: 'assignments',
                    required: false,
                    where: { roleType: 'Manager', isActive: true, isDeleted: false }
                },
                {
                    model: Clients,
                    as: "client",
                    attributes: ["id", "businessName", "email"],
                },
            ],
            order: [["createdAt", "DESC"]],
        });

        return tickets.map(ticket => {
            const plain = ticket.get({ plain: true });
            return {
                ...plain,
                label: calculateLabel(plain.deliveryDate, plain.overallStatus),
                delayDays: calculateDelayDays(
                    plain.deliveryDate,
                    plain.completedAt,
                    plain.overallStatus
                )
            };
        });

    } catch (error) {
        throw error;
    }
};

/**
 * Get tickets assigned to a specific employee
 * Used by: Employee login (shows only their work)
 */
export const getTicketsByEmployeeId = async (employeeId: string, filters?: TicketFilters) => {
    try {
        const whereClause: any = {
            isDeleted: false,
        };

        if (filters?.overallStatus) {
            whereClause.overallStatus = filters.overallStatus;
        }
        if (filters?.priority) {
            whereClause.priority = filters.priority;
        }

        if (filters?.startDate || filters?.endDate) {
            whereClause.createdAt = {};
            if (filters.startDate) {
                whereClause.createdAt[Op.gte] = new Date(filters.startDate);
            }
            if (filters.endDate) {
                whereClause.createdAt[Op.lte] = new Date(filters.endDate);
            }
        }

        const tickets = await Ticket.findAll({
            where: whereClause,
            include: [
                {
                    model: TicketAssignment,
                    as: "assignments",
                    where: { employeeId, isActive: true, isDeleted: false },
                    required: true,
                },
                {
                    model: Clients,
                    as: "client",
                    attributes: ["id", "businessName", "email"],
                },
            ],
            order: [["createdAt", "DESC"]],
        });

        return tickets.map(ticket => {
            const plain = ticket.get({ plain: true });
            return {
                ...plain,
                label: calculateLabel(plain.deliveryDate, plain.overallStatus),
                delayDays: calculateDelayDays(
                    plain.deliveryDate,
                    plain.completedAt,
                    plain.overallStatus
                )
            };
        });
    } catch (error) {
        throw error;
    }
};

/**
 * Get unassigned tickets for a company (no active assignment rows)
 */
export const getUnassignedTickets = async (user: any) => {
    try {
        if (!user || !user.companyId) return [];

        const whereClause: any = {
            companyId: user.companyId,
            isDeleted: false,
            isActive: true,
            '$assignments.id$': null // no active assignments
        };

        const tickets = await Ticket.findAll({
            where: whereClause,
            include: [
                {
                    model: TicketAssignment,
                    as: 'assignments',
                    required: false,
                    where: { isActive: true, isDeleted: false }
                },
                {
                    model: Clients,
                    as: 'client',
                    attributes: ['id', 'businessName', 'email'],
                },
                {
                    model: TicketAttachment,
                    as: 'attachments',
                    attributes: ['id', 'attachmentPath', 'createdAt']
                }
            ],
            order: [['createdAt', 'DESC']],
            // `distinct` and `subQuery` are not valid on FindOptions for findAll in TS typings
            // If needed, use findAndCountAll or raw query. Keeping default behavior here.
        });

        return tickets.map(ticket => {
            const plain = ticket.get({ plain: true });
            return {
                ...plain,
                label: calculateLabel(plain.deliveryDate, plain.overallStatus),
                delayDays: calculateDelayDays(
                    plain.deliveryDate,
                    plain.completedAt,
                    plain.overallStatus
                )
            };
        });
    } catch (error) {
        throw error;
    }
};

/**
 * Update ticket status only
 */
export const updateTicketStatus = async (
    ticketId: string,
    status: "Pending" | "Processing" | "Review" | "Changes" | "Completed" | "Hold",
    userId: string,
    transaction: Transaction
) => {
    try {
        if (!isValidStatus(status)) {
            throw new Error("Invalid status value");
        }

        const ticket = await Ticket.findOne({
            where: {
                id: ticketId,
                isDeleted: false,
            },
            transaction,
        });

        if (!ticket) {
            throw new Error("Ticket not found");
        }

        const oldStatus = ticket.overallStatus;

        const user = await User.findByPk(userId, { transaction });
        let rolePriority = 999;
        if (user && user.roleId) {
            const role = await Role.findByPk(user.roleId, { transaction });
            rolePriority = role?.priority ?? 999;
        }

        let newOverallStatus = status;
        if (status === "Hold") {
            if (rolePriority >= 30) {
                throw new Error("Only managers or admins can place a ticket on Hold");
            }

            await ticket.update({ overallStatus: "Hold" }, { transaction });
            await TicketAssignment.update(
                { employeeTicketStatus: "Hold" },
                { where: { ticketId: ticket.id }, transaction }
            );
        } else {
            if (oldStatus === "Hold") {
                newOverallStatus = "Pending";
                await ticket.update({ overallStatus: newOverallStatus }, { transaction });
                await TicketAssignment.update(
                    { employeeTicketStatus: "Pending" },
                    { where: { ticketId: ticket.id }, transaction }
                );
            } else {
                await ticket.update({
                    overallStatus: status, completedAt: status === "Completed" ? new Date() : null
                }, { transaction });

            }
        }

        // Determine handover context (if caller is a backup manager acting under an active handover)
        let handoverRow = null as any;
        try {
            const actingEmployee = await Employee.findOne({ where: { userId }, transaction });
            if (actingEmployee) {
                handoverRow = await getActiveHandoverForActor(ticket.assignedManagerId as string, actingEmployee.id, ticket.companyId);
            }
        } catch (err) {
            // ignore helper errors and proceed without handoverId
            handoverRow = null;
        }

        await createTicketTimeline(
            {
                ticketId: ticket.id,
                changedBy: userId,
                changeType: "status",
                oldValue: oldStatus,
                newValue: newOverallStatus,
                handoverId: handoverRow ? handoverRow.id : null,
            },
            transaction
        );

        return ticket;
    } catch (error) {
        throw error;
    }
};

/**
 * Update priority only
 */
export const updateTicketPriority = async (
    ticketId: string,
    priority: "Low" | "Medium" | "High",
    userId: string,
    transaction: Transaction
) => {
    try {
        if (!isValidPriority(priority)) {
            throw new Error("Invalid priority value");
        }

        const ticket = await Ticket.findOne({
            where: {
                id: ticketId,
                isDeleted: false,
            },
            transaction,
        });

        if (!ticket) {
            throw new Error("Ticket not found");
        }

        const oldPriority = ticket.priority;

        await ticket.update({ priority }, { transaction });

        // Determine handover context for priority change
        let handoverRow = null as any;
        try {
            const actingEmployee = await Employee.findOne({ where: { userId }, transaction });
            if (actingEmployee) {
                handoverRow = await getActiveHandoverForActor(ticket.assignedManagerId as string, actingEmployee.id, ticket.companyId);
            }
        } catch (err) {
            handoverRow = null;
        }

        await createTicketTimeline(
            {
                ticketId: ticket.id,
                changedBy: userId,
                changeType: "priority",
                oldValue: oldPriority,
                newValue: priority,
                handoverId: handoverRow ? handoverRow.id : null,
            },
            transaction
        );

        return ticket;
    } catch (error) {
        throw error;
    }
};

/**
 * Update ticket details (title, description, dates, assignment)
 * Note: Priority and Status have separate handlers that create timeline entries
 */
export const updateTicketDetails = async (
    ticketId: string,
    companyId: string,
    ticketData: any,
    transaction: Transaction
) => {
    const ticket = await Ticket.findOne({
        where: {
            id: ticketId,
            companyId,
            isDeleted: false,
        },
        transaction,
    });

    if (!ticket) return null;
    if (ticketData.title !== undefined) {
        if (!ticketData.title || ticketData.title.trim() === "") {
            throw new Error("Title is required");
        }
    }
    if (ticketData.description !== undefined) {
        if (!ticketData.description || ticketData.description.trim() === "") {
            throw new Error("Description is required");
        }
    }
    if (ticketData.expectedDate && isNaN(ticketData.expectedDate.getTime())) {
        throwValidation("Invalid expectedDate");
    }
    if (ticketData.deliveryDate && isNaN(ticketData.deliveryDate.getTime())) {
        throwValidation("Invalid deliveryDate");
    }
    const allowedData: any = {
        title: ticketData.title,
        description: ticketData.description,
        expectedDate: ticketData.expectedDate,
        deliveryDate: ticketData.deliveryDate,
    };

    (Object.keys(allowedData) as (keyof typeof allowedData)[]).forEach(
        (key) => allowedData[key] === undefined && delete allowedData[key]
    );

    await Ticket.update(allowedData, {
        where: {
            id: ticketId,
            companyId,
            isDeleted: false,
        },
        transaction,
    });

    const updatedTicket = await Ticket.findOne({
        where: { id: ticketId, companyId, isDeleted: false },
        transaction,
    });

    if (!updatedTicket) return null;

    return updatedTicket.get({ plain: true });
};

export const calculateOverallTicketStatus = async (
    ticketId: string,
    transaction: Transaction
): Promise<"Pending" | "Processing" | "Hold" | "Review" | "Changes" | "Completed"> => {
    try {
        const ticket = await Ticket.findByPk(ticketId, { transaction });
        if (!ticket) {
            throw new Error("Ticket not found");
        }

        if (ticket.overallStatus === "Hold") {
            return "Hold";
        }

        const assignments = await TicketAssignment.findAll({
            where: { ticketId, isActive: true, isDeleted: false },
            transaction
        });

        // No assignments = Pending
        if (!assignments || assignments.length === 0) {
            return "Pending";
        }

        // Single assignee - map employee status to ticket status
        if (ticket.isMultiAssignee === false) {
            const assignment = assignments[0];
            switch (assignment.employeeTicketStatus) {
                case "Pending": return "Pending";
                case "Processing": return "Processing";
                case "Review": return "Review";
                case "Changes": return "Changes";
                case "Completed": return "Completed";
                default: return "Pending";
            }
        }

        // Multiple assignees - check all statuses
        const allCompleted = assignments.every(a =>
            a.employeeTicketStatus === "Completed"
        );

        if (allCompleted) {
            return "Completed";
        }

        // Check priority: Review > Changes > Processing > Pending
        const hasReview = assignments.some(a =>
            a.employeeTicketStatus === "Review"
        );
        if (hasReview) return "Review";

        const hasChanges = assignments.some(a =>
            a.employeeTicketStatus === "Changes"
        );
        if (hasChanges) return "Changes";

        const hasProcessing = assignments.some(a =>
            a.employeeTicketStatus === "Processing"
        );
        if (hasProcessing) return "Processing";

        return "Pending";

    } catch (error) {
        throw error;
    }
};


export const finalizeAndAssignTicket = async (
    id: string,
    payload: {
        deliveryDate: Date | string;
        priority: "Low" | "Medium" | "High";
        assignedEmployeeIds: string[];
        assignedManagerIds?: string[];
    },
    assignedBy: string,
    transaction: Transaction
): Promise<Ticket> => {
    try {
        if (!isValidPriority(payload.priority)) {
            const err = new Error("Invalid priority value");
            err.name = "ValidationError";
            throw err;
        }

        const deliveryDate = payload.deliveryDate ? new Date(payload.deliveryDate) : null;
        if (!deliveryDate) {
            const err = new Error("deliveryDate is required");
            err.name = "ValidationError";
            throw err;
        }

        if (!payload.assignedEmployeeIds || !Array.isArray(payload.assignedEmployeeIds) || payload.assignedEmployeeIds.length === 0) {
            const err = new Error("assignedEmployeeIds must be a non-empty array");
            err.name = "ValidationError";
            throw err;
        }

        const uniqueEmployeeIds = [...new Set(payload.assignedEmployeeIds)];
        const uniqueManagerIds = payload.assignedManagerIds && Array.isArray(payload.assignedManagerIds) ? [...new Set(payload.assignedManagerIds)] : [];

        const ticket = await Ticket.findByPk(id, { transaction });
        if (!ticket) {
            const err = new Error("Ticket not found");
            err.name = "NotFoundError";
            throw err;
        }

        const assigned = await getAssignedUsersForClient(ticket.clientId, transaction);
        const managerEmployeeId = assigned.managers?.[0]?.employeeId ?? null;

        await ticket.update(
            {
                deliveryDate: deliveryDate,
                priority: payload.priority,
                isMultiAssignee: uniqueEmployeeIds.length > 1,
                overallStatus: "Pending",
                assignedManagerId: uniqueManagerIds.length > 0 ? uniqueManagerIds[0] : managerEmployeeId,
            },
            { transaction }
        );

        for (const employeeId of uniqueEmployeeIds) {
            // validate employee exists in same company
            const emp = await Employee.findOne({ where: { id: employeeId, companyId: ticket.companyId, isDeleted: false, isActive: true }, transaction });
            if (!emp) throw new Error(`Assigned employee ${employeeId} not found or not active in company`);
            await assignEmployeeToTicket(
                id,
                employeeId,
                assignedBy,
                "Employee",
                transaction
            );
        }

        // If manager IDs provided, validate and create manager assignments
        if (uniqueManagerIds.length > 0) {
            for (const mgrId of uniqueManagerIds) {
                const mgr = await Employee.findOne({ where: { id: mgrId, companyId: ticket.companyId, isDeleted: false, isActive: true }, transaction });
                if (!mgr) throw new Error(`Assigned manager ${mgrId} not found or not active in company`);
            }
            // create assignments for managers (roleType = 'Manager')
            const empAssignedSet = new Set(uniqueEmployeeIds);
            for (const mgrId of uniqueManagerIds) {
                if (empAssignedSet.has(mgrId)) continue; // avoid duplicate
                await assignEmployeeToTicket(
                    id,
                    mgrId,
                    assignedBy,
                    "Manager",
                    transaction
                );
            }
        }

        return ticket;
    } catch (error) {
        console.error("Error finalizing ticket:", error);
        throw error;
    }
};

//GET /tickets/:ticketNumber - get ticket by ticket number (used in client portal for easy access to ticket without needing to know the ID)
export const getTicketByTicketNumber = async (ticketNumber?: string) => {
    try {
        const ticket = await Ticket.findOne({
            where: {
                ticketNumber,
                isActive: true,
                isDeleted: false,
            },
            include: [
                {
                    model: Company,
                    as: "company",
                    attributes: ["id", "name"],
                },
                {
                    model: Clients,
                    as: "client",
                    attributes: ["id", "businessName", "email", "contact"],
                },
                {
                    model: TicketAttachment,
                    as: "attachments",
                    attributes: ["id", "attachmentPath", "createdAt"],
                },
                {
                    model: TicketTimeline,
                    as: "timelines",
                    attributes: ["id", "changedBy", "changeType", "oldValue", "newValue", "createdAt"],
                    separate: true,
                    order: [["createdAt", "ASC"]],
                },
                {
                    model: TicketAssignment,
                    as: "assignments",
                    attributes: ["id", "employeeId", "employeeTicketStatus", "createdAt", "updatedAt"],
                    include: [
                        {
                            association: "employee",
                            attributes: ["id", "profilePhoto", "designation", "employeeStatus"],
                            include: [
                                { association: "user", attributes: ["firstName", "lastName", "email", "contact"] }
                            ]
                        },
                        { association: "assignedByUser", attributes: ["id", "firstName", "lastName", "email"] }
                    ]
                }
            ],
        });
        if (!ticket) return null;
        const plainTicket = ticket.get({ plain: true });
        return {
            ...plainTicket,
            label: calculateLabel(plainTicket.deliveryDate, plainTicket.overallStatus),
            delayDays: calculateDelayDays(
                plainTicket.deliveryDate,
                plainTicket.completedAt,
                plainTicket.overallStatus
            )
        };
    } catch (error) {
        console.error("Error fetching ticket by ticket number:", error);
        throw error;
    }
}


export async function getTicketsList(
    user: User,
    filters: TicketFilters & {
        sortBy?: string;
        sortOrder?: 'asc' | 'desc';
        page?: number;
        limit?: number;
    }
): Promise<{ tickets: any[]; total: number; page: number; limit: number }> {
    try {
        const whereClause: any = {
            isActive: true,
            isDeleted: false,
        };

        // Get user's role priority to determine access level
        let rolePriority = 999; // Default: lowest access

        // All users (agency/employee) must have roleId to determine permissions
        if (user.roleId) {
            const role = await Role.findByPk(user.roleId);
            rolePriority = role?.priority ?? 999;
        }
        // No special case for agency - userType is account category, roleId determines access

        console.log("🎯 Role Priority:", rolePriority);

        // Role-based filtering (using Role.priority system)
        // Priority: 0=SuperAdmin, 10=CompanyAdmin, 20=Manager, 30=Employee

        if (rolePriority <= 10) {
            // SuperAdmin/CompanyAdmin - see all company tickets
            console.log("👑 Admin/SuperAdmin detected");
            if (user.companyId) {
                whereClause.companyId = user.companyId;
                console.log("🏢 Filtering by companyId:", user.companyId);
            }
        } else if (user.userType === 'client') {
            // Client - see only their tickets
            console.log("👨‍💼 Client user detected");
            const clientRecord = await Clients.findOne({
                where: { userId: user.id, isActive: true, isDeleted: false }
            });
            console.log("📋 Client record found:", clientRecord?.id || "NOT FOUND");
            if (clientRecord) {
                whereClause.clientId = clientRecord.id;
            } else {
                whereClause.clientId = null; // No tickets if client not found
            }
        } else if (rolePriority === 20) {
            // Manager - see tickets assigned to their manager ID + tickets from active handovers
            console.log("👔 Manager detected");
            const employeeRecord = await Employee.findOne({
                where: { userId: user.id, isActive: true, isDeleted: false }
            });
            console.log("📋 Employee record found:", employeeRecord?.id || "NOT FOUND");
            if (employeeRecord) {
                // Find active handovers where this manager is the backup
                const handoverWhere: any = {
                    backupManagerId: employeeRecord.id,
                    status: "Active"
                };
                if (user.companyId) {
                    handoverWhere.companyId = user.companyId;
                }

                const activeHandovers = await ManagerHandover.findAll({
                    where: handoverWhere
                });

                const originalManagerIds = activeHandovers.map(h => h.managerId);

                if (originalManagerIds.length > 0) {
                    // Show tickets assigned to this manager OR original managers they're backing up
                    whereClause.assignedManagerId = {
                        [Op.in]: [employeeRecord.id, ...originalManagerIds]
                    };
                    console.log(`📋 Manager has ${originalManagerIds.length} active handover(s) - showing shared access tickets`);
                } else {
                    // No handovers - only show tickets directly assigned
                    whereClause.assignedManagerId = employeeRecord.id;
                }
            } else {
                whereClause.assignedManagerId = null;
            }
        } else if (rolePriority >= 30) {
            // Employee - see only assigned tickets
            console.log("👷 Employee detected");
            const employeeRecord = await Employee.findOne({
                where: { userId: user.id, isActive: true, isDeleted: false }
            });
            console.log("📋 Employee record found:", employeeRecord?.id || "NOT FOUND");
            if (employeeRecord) {
                whereClause['$assignments.employeeId$'] = employeeRecord.id;
            } else {
                whereClause.id = null; // No tickets if employee not found
            }
        }

        console.log("🔍 Final WHERE clause:", JSON.stringify(whereClause, null, 2));

        // Apply filters from query params (extend existing TicketFilters)
        if (filters.companyId) {
            whereClause.companyId = filters.companyId;
        }
        if (filters.clientId) {
            whereClause.clientId = filters.clientId;
        }
        if (filters.assignedManagerId) {
            whereClause.assignedManagerId = filters.assignedManagerId;
        }
        if (filters.priority) {
            whereClause.priority = filters.priority;
        }
        if (filters.overallStatus) {
            whereClause.overallStatus = filters.overallStatus;
        }
        if (filters.startDate || filters.endDate) {
            whereClause.createdAt = {};
            if (filters.startDate) {
                whereClause.createdAt[Op.gte] = new Date(filters.startDate);
            }
            if (filters.endDate) {
                whereClause.createdAt[Op.lte] = new Date(filters.endDate);
            }
        }

        // Pagination
        const page = Math.max(1, filters.page || 1);
        const limit = Math.min(100, Math.max(1, filters.limit || 20));
        const offset = (page - 1) * limit;

        // Sorting
        let order: any = [['createdAt', 'DESC']]; // Default
        if (filters.sortBy) {
            const validFields = ['title', 'createdAt', 'updatedAt', 'priority', 'overallStatus'];
            const sortField = validFields.includes(filters.sortBy) ? filters.sortBy : 'createdAt';
            const sortDirection = filters.sortOrder === 'asc' ? 'ASC' : 'DESC';
            order = [[sortField, sortDirection]];
        }

        // Query with pagination
        const { rows: tickets, count: total } = await Ticket.findAndCountAll({
            where: whereClause,
            include: [
                {
                    model: Clients,
                    as: 'client',
                    attributes: ['id', 'businessName']
                },
                {
                    model: TicketAssignment,
                    as: 'assignments',
                    attributes: ['id', 'employeeId', 'createdAt'],
                    required: false
                }
            ],
            order,
            limit,
            offset,
            distinct: true,
            subQuery: false
        });

        const compactTickets = tickets.map((ticket: any) => {
            const plain = ticket.get({ plain: true });

            // If ticket has assignments, use the FIRST (earliest) assignment.createdAt as the display date
            // This represents when the ticket was first assigned to employees
            // Otherwise, use ticket.createdAt for unassigned tickets
            let displayDate: any = plain.createdAt;
            if (plain.assignments && Array.isArray(plain.assignments) && plain.assignments.length) {
                const earliest = plain.assignments.reduce((acc: any, a: any) => {
                    if (!acc) return a.createdAt;
                    return new Date(a.createdAt) < new Date(acc) ? a.createdAt : acc;
                }, null);
                if (earliest) displayDate = earliest;
            }

            return {
                id: plain.id,
                ticketNumber: plain.ticketNumber,
                title: plain.title,
                client: plain.client ? { id: plain.client.id, businessName: plain.client.businessName } : null,
                displayDate,
                priority: plain.priority,
                overallStatus: plain.overallStatus,
            };
        });

        return {
            tickets: compactTickets,
            total,
            page,
            limit
        };
    } catch (error) {
        console.error('Error in getTicketsList:', error);
        throw error;
    }
}

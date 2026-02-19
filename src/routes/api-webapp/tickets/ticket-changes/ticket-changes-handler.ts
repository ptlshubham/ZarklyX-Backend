import { Transaction, Op } from "sequelize";
import { TicketChanges } from "./ticket-changes-model";
import { ChangeAssignment } from "./change-assignment-model";
import { Ticket } from "../ticket/ticket-model";
import { TicketAssignment } from "../ticket-assignment/ticket-assignment-model";
import { calculateOverallTicketStatus } from "../ticket/ticket-handler";


// Interfaces
export interface CreateChangeRequestPayload {
    ticketId: string;
    requestedBy: string; // Client user ID
    changeDescription: string;
    employeeId?: string; 
    employeeIds?: string[]; 
}

export interface AssignEmployeeToChangePayload {
    changeId: string;
    employeeId: string;
}

//helper function to generate change number based on ticket number
export const generateChangeNumber = async (ticketId: string): Promise<string> => {
    const ticket = await Ticket.findByPk(ticketId);
    if (!ticket) throw new Error("Ticket not found");

    const baseNumber = ticket.ticketNumber; 

    const changeCount = await TicketChanges.count({ where: { ticketId, isActive: true, isDeleted: false } });

    if (changeCount === 0) {
        return baseNumber; 
    } else {
        return `${baseNumber}-${changeCount}`; 
    }
};

// Validator for changeStatus values
const isValidChangeStatus = (value: any): value is "Pending" | "In Progress" | "Completed" => {
    return ["Pending", "In Progress", "Completed"].includes(value);
};

/**
 * Create a change request (by client or manager)
 */
export const createTicketChange = async (
    payload: CreateChangeRequestPayload,
    transaction: Transaction
): Promise<TicketChanges> => {
    try {
        const ticket = await Ticket.findOne({
            where: { id: payload.ticketId, isActive: true },
            transaction
        });
        if (!ticket) {
            throw new Error("Ticket not found");
        }

        let employeeIds: string[] = [];

        if (payload.employeeIds && payload.employeeIds.length > 0) {
            employeeIds = payload.employeeIds;
        } else if (payload.employeeId) {
            employeeIds = [payload.employeeId];
        } else if (!payload.employeeId) {
            if (ticket.isMultiAssignee === false) {
                const assignment = await TicketAssignment.findOne({
                    where: { ticketId: payload.ticketId ,isActive:true,isDeleted:false},
                    transaction
                });
                if (assignment) {
                    employeeIds = [assignment.employeeId];
                }
            } else {
                throw new Error("employeeId or employeeIds is required for multi-assignee tickets");
            }
        }

        if (employeeIds.length === 0) {
            throw new Error("At least one employee must be assigned to the change");
        }

        const changeNumber = await generateChangeNumber(payload.ticketId);

        if (employeeIds.length === 1) {
            const change = await TicketChanges.create(
                {
                    ticketId: payload.ticketId,
                    changeNumber,
                    changeStatus: "Pending",
                    requestedByUserId: payload.requestedBy,
                    changeDescription: payload.changeDescription,
                    employeeId: employeeIds[0],  
                    isMultiEmployeeChange: false,
                    isActive: true,
                    isDeleted: false,
                },
                { transaction }
            );

            await ticket.update({ overallStatus: "Changes" }, { transaction });

            return change;
        } else {
            const change = await TicketChanges.create(
                {
                    ticketId: payload.ticketId,
                    changeNumber,
                    changeStatus: "Pending",
                    requestedByUserId: payload.requestedBy,
                    changeDescription: payload.changeDescription,
                    employeeId: null,  
                    isMultiEmployeeChange: true,
                    isActive: true,
                    isDeleted: false,
                },
                { transaction }
            );

            for (const empId of employeeIds) {
                await ChangeAssignment.create(
                    {
                        changeId: change.id,
                        employeeId: empId,
                        status: "Pending",
                        isActive: true,
                        isDeleted: false,
                    },
                    { transaction }
                );
            }

            await ticket.update({ overallStatus: "Changes" }, { transaction });

            return change;
        }
    } catch (error) {
        throw error;
    }
};

// Update change status (pending → in_progress → completed)
export const updateTicketsChangeStatus = async (
    changeId: string,
    newStatus: "Pending" | "In Progress" | "Completed",
    transaction: Transaction,
    employeeId?: string, 
): Promise<TicketChanges> => {
    try {
        if (!isValidChangeStatus(newStatus)) {
            throw new Error("Invalid change status value");
        }
        const change = await TicketChanges.findOne({ where: { id: changeId, isActive: true, isDeleted: false }, transaction });
        if (!change) {
            throw new Error("Change request not found");
        }

        const ticketId = change.ticketId;

        if (!change.isMultiEmployeeChange) {
            await change.update({ changeStatus: newStatus }, { transaction });
        } else {
            if (!employeeId) {
                throw new Error("employeeId required for multi-employee changes");
            }

            const assignment = await ChangeAssignment.findOne({
                where: { changeId, employeeId, isActive: true, isDeleted: false },
                transaction,
            });

            if (!assignment) {
                throw new Error(`Employee ${employeeId} not assigned to this change`);
            }

            await assignment.update({ status: newStatus }, { transaction });

            const pendingAssignments = await ChangeAssignment.count({
                where: {
                    changeId,
                    status: { [Op.ne]: "Completed" },
                    isActive: true,
                    isDeleted: false,
                },
                transaction,
            });

            if (pendingAssignments === 0) {
                await change.update({ changeStatus: "Completed" }, { transaction });
            }
        }

        const updatedChange = await TicketChanges.findOne({ where: { id: changeId, isActive: true, isDeleted: false }, transaction });
        const ticket = await Ticket.findByPk(ticketId, { transaction });

        if (ticket && updatedChange) {
            const allChanges = await TicketChanges.findAll({
                where: { ticketId, isActive: true, isDeleted: false },
                transaction,
            });

            const allCompleted = allChanges.every(c => c.changeStatus === "Completed");

            if (allCompleted) {
                await ticket.update({ overallStatus: "Review" }, { transaction });
            } else {
                await ticket.update({ overallStatus: "Changes" }, { transaction });
            }
        }

        return updatedChange!;
    } catch (error) {
        throw error;
    }
};

// Assign employee to handle a change request
export const assignEmployeeToChange = async (
    changeId: string,
    employeeId: string,
    transaction: Transaction
): Promise<TicketChanges> => {
    try {
        const change = await TicketChanges.findOne({ where: { id: changeId, isActive: true, isDeleted: false }, transaction });
        if (!change) {
            throw new Error("Change request not found");
        }

        await change.update({ employeeId }, { transaction });

        return change;
    } catch (error) {
        throw error;
    }
};

//Get all changes for a specific ticket (chronological order)
export const getChangesByTicketId = async (ticketId: string): Promise<TicketChanges[]> => {
    try {
        const changes = await TicketChanges.findAll({
            where: { ticketId, isActive: true, isDeleted: false },
            order: [["createdAt", "ASC"]],
        });

        return changes;
    } catch (error) {
        throw error;
    }
};

// Get single change by ID
export const getChangeById = async (changeId: string): Promise<TicketChanges | null> => {
    try {
        const change = await TicketChanges.findOne({
            where: { id: changeId, isActive: true, isDeleted: false }
        });
        return change;
    } catch (error) {
        throw error;
    }
};

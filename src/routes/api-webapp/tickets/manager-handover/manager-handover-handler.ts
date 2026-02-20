import { Transaction } from "sequelize";
import { Ticket } from "../ticket/ticket-model";
import { Op } from "sequelize";
import path from "path";
import fs from "fs";
import { ManagerHandover } from "./manager-handover-model";
import { createTicketTimeline } from "../ticket-timeline/ticket-timeline-handler";
import { Employee } from "../../agency/employee/employee-model";

// Interfaces
export interface CreateHandoverPayload {
    managerId: string; // Manager going on leave
    backupManagerId: string; // Temporary replacement
    companyId: string;
    notes?: string;
}

/**
 * Create manager handover (when manager goes on leave)
 * Admin/HR creates handover to assign backup manager
 */
export const createManagerHandover = async (
    payload: CreateHandoverPayload,
    createdByUserId: string,
    transaction: Transaction
): Promise<ManagerHandover> => {
    try {
        // Validate both employees exist and are active
        const manager = await Employee.findOne({
            where: {
                id: payload.managerId,
                isDeleted: false,
            },
            transaction,
        });

        if (!manager) {
            throw new Error(`Manager with ID ${payload.managerId} not found or is deleted`);
        }

        const backupManager = await Employee.findOne({
            where: {
                id: payload.backupManagerId,
                isDeleted: false,
            },
            transaction,
        });

        if (!backupManager) {
            throw new Error(`Backup manager with ID ${payload.backupManagerId} not found or is deleted`);
        }

        // Note: We now allow multiple active handovers for same manager
        // This enables splitting tickets among multiple backup managers

        const handover = await ManagerHandover.create(
            {
                managerId: payload.managerId,
                backupManagerId: payload.backupManagerId,
                companyId: payload.companyId,
                status: "Pending", // Changed: handover request created as Pending, must be accepted
                notes: payload.notes || null,
            },
            { transaction }
        );

        // Note: Tickets are NOT transferred here
        // They will be transferred when handover is accepted via acceptHandover()
        console.log(`[HANDOVER] Created handover ${handover.id} with Pending status - awaiting acceptance`);

        return handover;
    } catch (error) {
        throw error;
    }
};

/**
 * Get handover by ID
 */
export const getHandoverById = async (
    handoverId: string
): Promise<ManagerHandover | null> => {
    try {
        return await ManagerHandover.findByPk(handoverId);
    } catch (error) {
        throw error;
    }
};

/**
 * Get active handover for a manager
 */
export const getActiveHandoverByManagerId = async (
    managerId: string
): Promise<ManagerHandover | null> => {
    try {
        return await ManagerHandover.findOne({
            where: {
                managerId,
                status: "Active",
            },
        });
    } catch (error) {
        throw error;
    }
};

// Simple validator for handover status values
const isValidHandoverStatus = (value: any): value is "Active" | "Completed" | "Cancelled" => {
    return ["Active", "Completed", "Cancelled"].includes(value);
};

/**
 * Get all handovers by company
 */
export const getHandoversByCompany = async (
    companyId: string
): Promise<ManagerHandover[]> => {
    try {
        return await ManagerHandover.findAll({
            where: { companyId },
            order: [["createdAt", "DESC"]],
        });
    } catch (error) {
        throw error;
    }
};

/**
 * Get all active handovers for a company
 */
export const getActiveHandoversByCompany = async (
    companyId: string
): Promise<ManagerHandover[]> => {
    try {
        return await ManagerHandover.findAll({
            where: {
                companyId,
                status: "Active",
            },
            order: [["createdAt", "DESC"]],
        });
    } catch (error) {
        throw error;
    }
};

/**
 * Complete handover (manager returns from leave)
 */
export const completeHandover = async (
    handoverId: string,
    completedByUserId: string,
    transaction: Transaction
): Promise<ManagerHandover> => {
    try {
        const handover = await ManagerHandover.findByPk(handoverId, { transaction });
        if (!handover) {
            throw new Error("Handover not found");
        }

        if (handover.status !== "Active") {
            throw new Error("Only active handovers can be completed");
        }

        // Find tickets that were moved by this handover and are still with the backup manager
        // const tickets = await Ticket.findAll({
        //     where: {
        //         lastHandoverId: handover.id,
        //         assignedManagerId: handover.backupManagerId,
        //         isDeleted: false,
        //         overallStatus: {
        //             [Op.notIn]: ["Completed"],
        //         },
        //     },
        //     transaction,
        // });

        // for (const t of tickets) {
        //     const oldManager = t.assignedManagerId;
        //     await t.update({ assignedManagerId: handover.managerId, lastHandoverId: null }, { transaction });

        //     // timeline entry for revert
        //     await createTicketTimeline(
        //         {
        //             ticketId: t.id,
        //             changedBy: completedByUserId,
        //             changeType: "handover_revert",
        //             oldValue: oldManager,
        //             newValue: handover.managerId,
        //         },
        //         transaction
        //     );
        // }

        await handover.update({ status: "Completed" }, { transaction });

        return handover;
    } catch (error) {
        throw error;
    }
};

/**
 * Cancel handover
 */
export const cancelHandover = async (
    handoverId: string,
    createdByUserId: string,
    transaction: Transaction
): Promise<ManagerHandover> => {
    try {
        const handover = await ManagerHandover.findByPk(handoverId, { transaction });
        if (!handover) {
            throw new Error("Handover not found");
        }

        if (handover.status !== "Active") {
            throw new Error("Only active handovers can be cancelled");
        }

        // Mark handover as cancelled (logical-access model: do not revert tickets)
        await handover.update({ status: "Cancelled" }, { transaction });

        // create a system timeline entry for the cancellation
        await createTicketTimeline({
            ticketId: null,
            changedBy: createdByUserId,
            changeType: "handover_cancel",
            oldValue: handover.managerId,
            newValue: handover.backupManagerId,
            handoverId: handover.id ?? null,
        }, transaction);

        return handover;
    } catch (error) {
        throw error;
    }
};


export const getEffectiveManager = async (
    managerId: string
): Promise<string[]> => {
    try {
        // const handover = await ManagerHandover.findOne({
        //     where: {
        //         managerId,
        //         status: "Active",
        //     },
        // });

        // If active handover exists, return backup manager
        // Otherwise, return original manager
        const handovers = await ManagerHandover.findAll({
            where: {
                managerId,
                status: "Active",
            },
        });
        return handovers.map(h => h.backupManagerId);
    } catch (error) {
        throw error;
    }
};

/**
 * Get backup manager for a manager (if active handover exists)
 * Returns null if no active handover
 */
export const getBackupManagerId = async (
    managerId: string
): Promise<string | null> => {
    try {
        const handover = await ManagerHandover.findOne({
            where: {
                managerId,
                status: "Active",
            },
        });

        return handover ? handover.backupManagerId : null;
    } catch (error) {
        throw error;
    }
};

/**
 * Get all active handovers (all companies)
 * Admin dashboard view
 */
export const getAllActiveHandovers = async (): Promise<ManagerHandover[]> => {
    try {
        return await ManagerHandover.findAll({
            where: { status: "Active" },
            order: [["createdAt", "DESC"]],
        });
    } catch (error) {
        throw error;
    }
};

/**
 * Get handover history for a specific manager
 * Shows all past handovers (completed and cancelled)
 */
export const getHandoverHistory = async (
    managerId: string
): Promise<ManagerHandover[]> => {
    try {
        return await ManagerHandover.findAll({
            where: { managerId },
            order: [["createdAt", "DESC"]],
        });
    } catch (error) {
        throw error;
    }
};

/**
 * REQUEST HANDOVER
 * status = Pending
 */
export const requestHandover = async (
    payload: {
        managerId: string;
        backupManagerId: string;
        companyId: string;
        startDate: Date;
        endDate: Date;
        notes?: string;
    },
    requestedBy: string,
    transaction: Transaction
): Promise<ManagerHandover> => {

    // validate manager exists
    const manager = await Employee.findOne({
        where: { id: payload.managerId, isDeleted: false },
        transaction
    });

    if (!manager) {
        throw new Error("Manager not found");
    }

    // validate backup manager exists
    const backup = await Employee.findOne({
        where: { id: payload.backupManagerId, isDeleted: false },
        transaction
    });

    if (!backup) {
        throw new Error("Backup manager not found");
    }

    // create handover request
    const handover = await ManagerHandover.create({
        managerId: payload.managerId,
        backupManagerId: payload.backupManagerId,
        companyId: payload.companyId,
        startDate: payload.startDate,
        endDate: payload.endDate,
        requestedBy,
        status: "Pending",
        notes: payload.notes || null
    }, { transaction });

    return handover;
};



/**
 * ACCEPT HANDOVER
 * status → Active
 * transfer tickets
 */
export const acceptHandover = async (
    handoverId: string,
    acceptedBy: string,
    transaction: Transaction
): Promise<ManagerHandover> => {

    if (!acceptedBy) {
        throw new Error("acceptedBy (userId) is required to accept a handover");
    }

    const handover = await ManagerHandover.findByPk(handoverId, { transaction });

    if (!handover) {
        throw new Error("Handover not found");
    }

    if (handover.status !== "Pending") {
        throw new Error("Only pending handover can be accepted");
    }

    // update status
    await handover.update({
        status: "Active",
        acceptedAt: new Date(),
        acceptedBy: acceptedBy
    }, { transaction });


    // // transfer ALL pending tickets
    // const tickets = await Ticket.findAll({
    //     where: {
    //         assignedManagerId: handover.managerId,
    //         companyId: handover.companyId,
    //         isDeleted: false,
    //         overallStatus: {
    //             [Op.notIn]: ["Completed"]
    //         }
    //     },
    //     transaction
    // });

    // for (const t of tickets) {

    //     await t.update({
    //         assignedManagerId: handover.backupManagerId,
    //         lastHandoverId: handover.id
    //     }, { transaction });

    //     await createTicketTimeline({
    //         ticketId: t.id,
    //         changedBy: acceptedBy,
    //         changeType: "handover_accept",
    //         oldValue: handover.managerId,
    //         newValue: handover.backupManagerId
    //     }, transaction);
    // }
    // DO NOT transfer tickets physically
    // Backup manager will access tickets logically via ManagerHandover table

    await createTicketTimeline({
        ticketId: null, // optional system log
        changedBy: acceptedBy,
        changeType: "handover_accept",
        oldValue: handover.managerId,
        newValue: handover.backupManagerId,
        handoverId: handover.id,
    }, transaction);


    return handover;
};



/**
 * REJECT HANDOVER
 */
export const rejectHandover = async (
    handoverId: string,
    rejectedBy: string,
    transaction: Transaction
): Promise<ManagerHandover> => {

    const handover = await ManagerHandover.findByPk(handoverId, { transaction });

    if (!handover) {
        throw new Error("Handover not found");
    }

    if (handover.status !== "Pending") {
        throw new Error("Only pending handover can be rejected");
    }

    await handover.update({
        status: "Rejected",
        rejectedAt: new Date(),
        rejectedBy: rejectedBy
    }, { transaction });

    await createTicketTimeline({
        ticketId: null,
        changedBy: rejectedBy,
        changeType: "handover_reject",
        oldValue: handover.managerId,
        newValue: handover.backupManagerId,
        handoverId: handover.id,
    }, transaction);

    return handover;
};

export const adminAssignHandover = async (
    payload: {
        managerId: string;
        backupManagerId: string;
        companyId: string;
        startDate?: Date;
        endDate?: Date;
        notes?: string;
    },
    adminUserId: string,
    transaction: Transaction
): Promise<ManagerHandover> => {

    const handover = await ManagerHandover.create({

        managerId: payload.managerId,
        backupManagerId: payload.backupManagerId,
        companyId: payload.companyId,
        startDate: payload.startDate || new Date(),
        endDate: payload.endDate || null,

        status: "Active",   // IMPORTANT
        approvedBy: adminUserId,
        acceptedAt: new Date(),
        notes: payload.notes || null

    }, { transaction });


    // transfer tickets immediately
    // const tickets = await Ticket.findAll({

    //     where: {

    //         assignedManagerId: payload.managerId,
    //         companyId: payload.companyId,
    //         isDeleted: false,

    //         overallStatus: {
    //             [Op.notIn]: ["Completed"]
    //         }
    //     },
    //     transaction
    // });


    // for (const t of tickets) {

    //     await t.update({

    //         assignedManagerId: payload.backupManagerId,
    //         lastHandoverId: handover.id

    //     }, { transaction });

    // }


    return handover;
};

/**
 * Get active handover for a specific actor (backup) relative to a manager
 * Returns the ManagerHandover row when backupManagerId matches actorEmployeeId and status is Active
 */
export const getActiveHandoverForActor = async (
    managerId: string,
    actorEmployeeId: string,
    companyId?: string
): Promise<ManagerHandover | null> => {
    try {
        const whereAny: any = {
            managerId,
            backupManagerId: actorEmployeeId,
            status: "Active",
        };
        if (companyId) whereAny.companyId = companyId;
        return await ManagerHandover.findOne({ where: whereAny });
    } catch (error) {
        throw error;
    }
};
import { Transaction } from "sequelize";
import { Ticket } from "../ticket/ticket-model";
import { Op } from "sequelize";
import { TicketAssignment } from "./ticket-assignment-model";
import { calculateOverallTicketStatus } from "../ticket/ticket-handler";
import {createTicketTimeline} from "../../tickets/ticket-timeline/ticket-timeline-handler"
import { Employee } from "../../agency/employee/employee-model";
import { getActiveHandoverForActor } from "../manager-handover/manager-handover-handler";

export const assignEmployeeToTicket = async (
    ticketId: string,
    employeeId: string,
    assignedBy: string,
    roleType: "Manager" | "Employee",
    transaction: Transaction
) :Promise<TicketAssignment>=> {
    try{
        const ticket = await Ticket.findByPk(ticketId, { transaction });
        if (!ticket) {
            throw new Error("Ticket not found");
        }
        if(!employeeId){
            throw new Error("Employee ID is required for assignment");
        }
       
        let assignment = await TicketAssignment.findOne({ where: { ticketId, employeeId }, transaction });
        if (assignment) {
            if (assignment.isActive && !assignment.isDeleted) {
                return assignment;
            }

            assignment.assignedBy = assignedBy;
            assignment.employeeTicketStatus = "Pending";
            assignment.isActive = true;
            assignment.isDeleted = false;
            await assignment.save({ transaction });
        } else {
            assignment = await TicketAssignment.create(
                {
                    ticketId,
                    employeeId,
                    assignedBy,
                    employeeTicketStatus:"Pending",
                    roleType,
                    isActive: true,
                    isDeleted: false,
                },
                { transaction }
            );
        }
        const newOverallStatus = await calculateOverallTicketStatus(ticketId, transaction);
        await Ticket.update(
            { overallStatus: newOverallStatus },
            { where: { id: ticketId }, transaction }
        );
        return assignment;
    }catch(error){
        console.error("Error assigning employee to ticket:", error);
        throw error;
    }
};

const isValidEmployeeTicketStatus = (value: any): value is "Pending" | "Processing" | "Hold" | "Review" | "Changes" | "Completed" => {
    return ["Pending", "Processing", "Hold", "Review", "Changes", "Completed"].includes(value);
};



export const updateEmployeeTicketStatus = async (
    id: string,
    employeeTicketStatus: "Pending" | "Processing" | "Hold" | "Review" | "Changes" | "Completed",
    userId: string,
    transaction: Transaction
): Promise<TicketAssignment> => {
    try {
        if (!isValidEmployeeTicketStatus(employeeTicketStatus)) {
            throw new Error("Invalid employeeTicketStatus value");
        }
        const assignment = await TicketAssignment.findOne({where:{id,isActive:true,isDeleted:false},  transaction });
        if (!assignment) {
            throw new Error("Ticket assignment not found");
        }
        
        const ticket = await Ticket.findByPk(assignment.ticketId, { transaction });
        if (!ticket) {
            throw new Error("Ticket not found");
        }
        if (ticket.overallStatus === "Hold") {
            throw new Error("Cannot change assignment status while ticket is on Hold");
        }
        const oldTicketStatus = ticket.overallStatus;
        
        assignment.employeeTicketStatus = employeeTicketStatus;
        await assignment.save({ transaction });
        
        const newOverallStatus = await calculateOverallTicketStatus(assignment.ticketId, transaction);
        await Ticket.update(
            { overallStatus: newOverallStatus },
            { where: { id: assignment.ticketId }, transaction }
        );
        
        if (oldTicketStatus !== newOverallStatus) {
            // Determine handover context if actor is backup manager
            let handoverRow = null as any;
            try {
                const actingEmployee = await Employee.findOne({ where: { userId }, transaction });
                if (actingEmployee) {
                    handoverRow = await getActiveHandoverForActor(ticket.id ? ticket.assignedManagerId as string : ticket.assignedManagerId, actingEmployee.id, ticket.companyId);
                }
            } catch (err) {
                handoverRow = null;
            }

            await createTicketTimeline(
                {
                    ticketId: assignment.ticketId,
                    changedBy: userId,
                    changeType: "status",
                    oldValue: oldTicketStatus,
                    newValue: newOverallStatus,
                    handoverId: handoverRow ? handoverRow.id : null,
                },
                transaction
            );
        }
        
        return assignment;
    } catch (error) {
        console.error("Error updating employee ticket status:", error);
        throw error;
    }
};

export const getAssignmentsByTicketId = async (
    ticketId: string
): Promise<TicketAssignment[]> => {
    try {
        const assignments = await TicketAssignment.findAll({
            where: { ticketId ,isActive:true,isDeleted:false},
        });
        return assignments;
    } catch (error) {
        throw error;
    }
};

export const getAssignmentsByEmployeeId = async (
    employeeId: string
): Promise<TicketAssignment[]> => {
    try {
        const assignments = await TicketAssignment.findAll({
            where: { employeeId, isActive:true,isDeleted:false },
        });
        return assignments;
    }
    catch (error) {
        throw error;
    }   
};

export const getAssignmentById = async (
    id: string
): Promise<TicketAssignment | null> => {
    try {   
        const assignment = await TicketAssignment.findOne({
            where: { id, isActive: true, isDeleted: false }
        });
        return assignment;
    } catch (error) {
        throw error;
    }
};
//SOFT delete assignment
export const removeAssignment = async (
    assignmentId: string,
    transaction: Transaction
): Promise<any> => {
    try {
        const assignment = await TicketAssignment.findOne({
            where: { id: assignmentId, isActive: true, isDeleted: false },
            transaction
        });
        if (!assignment) {
            throw new Error("Ticket assignment not found");
        }
        
        const ticketId = assignment.ticketId; 
        await assignment.update({ isDeleted: true,isActive:false }, { transaction });
        
        const newOverallStatus = await calculateOverallTicketStatus(ticketId, transaction);
        await Ticket.update(
            { overallStatus: newOverallStatus },
            { where: { id: ticketId }, transaction }
        );
        return assignment;
    } catch (error) {
        console.error("Error removing ticket assignment:", error);
        throw error;
    }
};



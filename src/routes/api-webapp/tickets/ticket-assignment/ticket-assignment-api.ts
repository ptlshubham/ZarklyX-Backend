import express, { Request, Response } from 'express';
import { TicketAssignment } from './ticket-assignment-model';
import { 
    assignEmployeeToTicket, 
    updateEmployeeTicketStatus, 
    getAssignmentsByTicketId,
    getAssignmentsByEmployeeId,
    getAssignmentById,
    removeAssignment 
} from './ticket-assignment-handler';
import { serverError, successResponse, unauthorized,errorResponse } from "../../../../utils/responseHandler";
import dbInstance from '../../../../db/core/control-db';

const router = express.Router();

//POST /api/tickets/assignment/assignEmployee
router.post('/assignEmployee', async (req: Request, res: Response): Promise<any> => {
    const t = await dbInstance.transaction();
    try {
        const { ticketId, employeeId, assignedBy } = req.body;
        if (!ticketId || !employeeId || !assignedBy) {
            await t.rollback();
            return errorResponse(res, "Missing required fields: ticketId, employeeId, assignedBy", null, 400);
        }
        const assignment = await assignEmployeeToTicket(
            ticketId,
            employeeId,
            assignedBy,
            t
        );
        await t.commit();
        return successResponse(res, "Employee assigned to ticket successfully", assignment);
    }
    catch (error) {
        await t.rollback();
        return serverError(res, "Failed to assign employee to ticket");
    }
});
    
// GET /api/tickets/assignment/getAssignments/:ticketId
router.get('/getAssignments/:ticketId', async (req: Request, res: Response): Promise<any> => {
    try {
        let ticketId = req.params.ticketId;
        if (Array.isArray(ticketId)) ticketId = ticketId[0];
        const assignments = await getAssignmentsByTicketId(ticketId);

        return successResponse(res, "Assignments for ticket retrieved successfully", assignments);
    } catch (error) {
        console.error("Get Assignments Error:", error);
        return serverError(res, "Failed to get assignments for ticket");
    }
});
//GET /api/tickets/assignment/getAssignmentById/:id
router.get('/getAssignmentById/:id', async (req: Request, res: Response): Promise<any> => {
    try {
        let id = req.params.id;
        if (Array.isArray(id)) id = id[0];
        const assignment = await getAssignmentById(id);
        if (!assignment) {
            return errorResponse(res, "Ticket assignment not found", null, 404);
        }
        return successResponse(res, "Assignment retrieved successfully", assignment);
    }
    catch (error) {
        console.error("Get Assignment By ID Error:", error);
        return serverError(res, "Failed to get assignment by ID");
    }
});

// PUT /api/tickets/assignment/updateEmployeeTicketStatus/:id
router.put('/updateEmployeeTicketStatus/:id', async (req: Request, res: Response): Promise<any> => {
    const t = await dbInstance.transaction();
    try {
        let id = req.params.id;
        if (Array.isArray(id)) id = id[0];
        const { employeeTicketStatus, userId } = req.body;
        
        if (!userId) {
            await t.rollback();
            return errorResponse(res, "userId is required", null, 400);
        }
        
        const assignment = await updateEmployeeTicketStatus(id, employeeTicketStatus, userId, t);
        
        await t.commit();
        return successResponse(res, "Employee ticket status updated successfully", assignment);
    }
    catch (error) {
        await t.rollback();
        console.error("Update Employee Status Error:", error);
        return serverError(res, "Failed to update employee ticket status");
    }
});

// GET /api/tickets/assignment/getAssignmentsByEmployee/:employeeId
router.get('/getAssignmentsByEmployee/:employeeId', async (req: Request, res: Response): Promise<any> => {
    try {
        let employeeId = req.params.employeeId;
        if (Array.isArray(employeeId)) employeeId = employeeId[0];
        const assignments = await getAssignmentsByEmployeeId(employeeId);
        return successResponse(res, "Assignments for employee retrieved successfully", assignments);
    }
    catch (error) {
        console.error("Get Assignments By Employee Error:", error);
        return serverError(res, "Failed to get assignments by employee ID");
    }
});

// DELETE /api/tickets/assignment/removeAssignment/:id
router.delete('/removeAssignment/:id', async (req: Request, res: Response): Promise<any> => {
    const t = await dbInstance.transaction();
    try {
        let id = req.params.id;
        if (Array.isArray(id)) id = id[0];
        
        const removedAssignment=await removeAssignment(id, t);
        if (!removedAssignment) {
            await t.rollback();
            return errorResponse(res, "Ticket assignment not found", null, 404);
        }
        await t.commit();
        return successResponse(res, "Employee assignment removed successfully", removedAssignment.id);
    }
    catch (error) {
        await t.rollback();
        return serverError(res, "Failed to remove assignment");
    }
});

export default router;
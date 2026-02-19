import express, { Request, Response } from 'express';
import {
    createTicketChange,
    updateTicketsChangeStatus,
    assignEmployeeToChange,
    getChangesByTicketId,
    getChangeById,
} from './ticket-changes-handler';
import { serverError, successResponse, unauthorized,errorResponse } from "../../../../utils/responseHandler";
import dbInstance from '../../../../db/core/control-db';
import { tokensAttachmentUpload, convertToRelativePath } from '../../../../services/multer';
import { createTicketAttachment } from '../ticket-attachments/ticket-attachments-handler';
import { error } from 'console';
const router = express.Router();

//POST /tickets/changes/createTicketsChange
router.post("/createTicketChange",     tokensAttachmentUpload.array('attachments', 10), async (req: Request, res: Response) => {
    const transaction = await dbInstance.transaction();
    try {
        let { ticketId, requestedBy, changeDescription, employeeId, employeeIds } = req.body;

        if (!ticketId || !requestedBy || !changeDescription) {
            await transaction.rollback();
            return errorResponse(res, "ticketId, requestedBy and changeDescription are required", null, 400);
        }
        
        if (typeof changeDescription === 'string' && changeDescription.trim() === "") {
            await transaction.rollback();
            return errorResponse(res, "changeDescription is required and cannot be empty", null, 400);
        }

        if (employeeIds && typeof employeeIds === "string") {
            try {
                employeeIds = JSON.parse(employeeIds);
            } catch (parseError) {
            }
        }

        const change = await createTicketChange(
            { ticketId, requestedBy, changeDescription, employeeId, employeeIds },
            transaction
        );


        if (req.files && Array.isArray(req.files) && req.files.length > 0) {
            const attachments = convertToRelativePath(req.files as Express.Multer.File[]);
              await createTicketAttachment(ticketId, attachments, transaction, change.id);
        }

        await transaction.commit();
        return res.status(201).json({
            success: true,
            message: "Change request for the ticket created successfully",
            data: change
        });
    } catch (error: any) {
        await transaction.rollback();
        console.error("Create Ticket Change Error:", error);
        return serverError(res, error.message || "Failed to create ticket change");
    }
});

//PUT /tickets/changes/updateTicketsChangeStatus/:id
 
router.put("/updateTicketsChangeStatus/:id", async (req: Request, res: Response) => {
    const transaction = await dbInstance.transaction();
    try {
        let id  = req.params.id;
        if(Array.isArray(id)) id = id[0];
        const { changeStatus, employeeId } = req.body;

        if (!changeStatus || !["Pending", "In Progress", "Completed"].includes(changeStatus)) {
            await transaction.rollback();
            return errorResponse(res, "Valid status is required (Pending, In Progress, Completed)", null, 400);
        }

        const change = await updateTicketsChangeStatus(id, changeStatus, transaction, employeeId);

        await transaction.commit();
        return successResponse(res, "Change status updated successfully", change);
    } catch (error: any) {
        await transaction.rollback();
        return serverError(res, error.message);
    }
});

//PUT /tickets/changes/assignEmployeeToChange/:id
router.put("/assignEmployeeToChange/:id", async (req: Request, res: Response) => {
    const transaction = await dbInstance.transaction();
    try {
         let id  = req.params.id;
        if(Array.isArray(id)) id = id[0];
        const { employeeId } = req.body;

        if (!employeeId) {
            await transaction.rollback();
            return errorResponse(res, "employeeId is required", null, 400);
        }

        const change = await assignEmployeeToChange(id, employeeId, transaction);

        await transaction.commit();
        return successResponse(res, "Employee assigned to change request successfully", change);
    } catch (error: any) {
        await transaction.rollback();
        return serverError(res, error.message);
    }
});

// GET /tickets/changes/getChangesByTicketId/:ticketId
router.get("/getChangesByTicketId/:ticketId", async (req: Request, res: Response) => {
    try {
         let ticketId  = req.params.ticketId;
        if(Array.isArray(ticketId)) ticketId = ticketId[0];
        const changes = await getChangesByTicketId(ticketId);

        return successResponse(res, "Changes retrieved successfully", changes);
    } catch (error: any) {
        return serverError(res, error.message);
    }
});

//GET /tickets/changes/getChangeById/:id
router.get("/getChangeById/:id", async (req: Request, res: Response) => {
    try {
         let id  = req.params.id;
        if(Array.isArray(id)) id = id[0];

        const change = await getChangeById(id);

        if (!change) {
            return errorResponse(res, "Change request not found", null, 404);
        }

        return successResponse(res, "Change retrieved successfully", change);
    } catch (error: any) {
        return serverError(res, error.message);
    }
});

router.patch("/deleteChange/:id", async (req: Request, res: Response) => {
    const transaction = await dbInstance.transaction();
    try {
            let id  = req.params.id;
        if(Array.isArray(id)) id = id[0];
        const change = await getChangeById(id);
        if (!change) {
            await transaction.rollback();
            return errorResponse(res, "Change request not found", null, 404);
        }
        await change.update({ isDeleted: true, isActive: false }, { transaction });
        await transaction.commit();
        return successResponse(res, "Change request deleted successfully", change);
    } catch (error: any) {
        await transaction.rollback();
        return serverError(res, error.message);
    }
});

export default router;

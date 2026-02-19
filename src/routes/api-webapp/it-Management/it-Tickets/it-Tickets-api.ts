import express, { Request, Response } from 'express';
import {
    createItTickets,
    getItTicketsById,
    getAllItTicketsByEmployeeId,
    getAllItTicketsByCompanyId,
    updateItTicketsStatus,
    deleteItTickets,
    updateItTicketsDetailsByEmployee,
    updateItTicketsPriority,
} from './it-Tickets-handler';
import { createItTicketsAttachments, removeItTicketsAttachmentByEmployee } from './it-Tickets-Attachments/it-Tickets-Attachments-handler';
import { createItTicketsTimeline } from './it-Tickets-Timeline/it-Tickets-Timeline-handler';
import { serverError, successResponse, unauthorized,errorResponse } from "../../../../utils/responseHandler";
import { convertToRelativePath } from '../../../../services/multer';
// import { tokenMiddleWare } from 'src/services/jwtToken-service';
import dbInstance from '../../../../db/core/control-db';
import { ticketAttachmentUpload } from '../../../../services/multer';

const router = express.Router();


//create ticket route PATCH /itManagement/itTickets/createItTickets
router.post("/createItTickets", ticketAttachmentUpload.array("attachments", 100), async (req: Request, res: Response): Promise<any> => {
    const t = await dbInstance.transaction();
    try {
        const { userId, companyId, userType } = req.body;

        if (!userId || !companyId || !userType) {
            await t.rollback();
            return errorResponse(res, "userId, companyId and userType are required.", null, 400);
        }

        const attachments = convertToRelativePath(
            req.files as Express.Multer.File[]
        );
        const ticketPayload = {
            ...req.body,
            attachments,
        }

        const data = await createItTickets(ticketPayload, t);
        await createItTicketsTimeline(data.id, data.employeeId, data.status, t);

        if (attachments.length > 0) {
            await createItTicketsAttachments(data.id, attachments, t);
        }

        await t.commit();
        return successResponse(res, "Ticket is created successfully", data);
    } catch (error: any) {
        await t.rollback();
        if (error?.name === "ValidationError") {
            return res.status(400).json({
                success: false,
                message: error.message
            });
        }
        if (error?.name === "UnauthorizedError") {
            return unauthorized(res, error.message);
        }
        return serverError(res,"Failed to create ticket.", error.message);
    }
}
);



//GET /itManagement/itTickets/getItTicketsById/:id
router.get("/getItTicketsById/:id", async (req, res): Promise<any> => {
    try {
        let id = req.params.id;
        if (Array.isArray(id)) id = id[0];
        const data = await getItTicketsById(id);

        return successResponse(res, "Ticket retrieved successfully", data);
    }
    catch (error:any) {
        return serverError(res, "Failed to fetch the ticket.", error.message);
    }
});

//GET /itManagement/itTickets/getAllItTicketsByEmployeeId/:employeeId
router.get("/getAllItTicketsByEmployeeId/:employeeId", async (req, res): Promise<any> => {
    try {
        let employeeId = req.params.employeeId;
        if (Array.isArray(employeeId)) employeeId = employeeId[0];
        const data = await getAllItTicketsByEmployeeId(employeeId);
        return successResponse(res, "Tickets retrieved successfully", data);
    } catch (error:any) {
        return serverError(res, "Failed to fetch tickets by employeeId.", error.message);
    }
});

//PATCH /itManagement/itTickets/updateItTicketsDetailsByEmployee/:id/:employeeId/:companyId
router.patch("/updateItTicketsDetailsByEmployee/:id/:employeeId/:companyId", ticketAttachmentUpload.array("attachments", 5), async (req, res): Promise<any> => {
    const t = await dbInstance.transaction();
    try {
        let id = req.params.id;
        let employeeId = req.params.employeeId;
        let companyId = req.params.companyId;
        if (Array.isArray(id)) id = id[0];
        if (Array.isArray(employeeId)) employeeId = employeeId[0];
        if (Array.isArray(companyId)) companyId = companyId[0];
        const { subject, description, preferredDate } = req.body;
        const newAttachments = convertToRelativePath(
            req.files as Express.Multer.File[]
        );

        if (!id || !employeeId || !companyId) {
            await t.rollback();
            return errorResponse(res, "id, employeeId and companyId are required", null, 400);
        }

        if (
            subject === undefined &&
            description === undefined &&
            preferredDate === undefined &&
            newAttachments.length === 0
        ) {
            await t.rollback();
            return errorResponse(res, "At least one field (subject, description, preferredDate or attachments) is required to update", null, 400);
        }

        const updatedTicket = await updateItTicketsDetailsByEmployee(id, employeeId, companyId, req.body, t);

        if (!updatedTicket) {
            await t.rollback();
            return errorResponse(res, "Ticket not found or unauthorized update", null, 404);
        }

        if (newAttachments.length > 0) {
            await createItTicketsAttachments(updatedTicket.id, newAttachments, t);

        }

        await t.commit();
        return successResponse(res, "Ticket details are updated successfully", updatedTicket);
    }
    catch (error: any) {
        await t.rollback();
         if (error?.name === "ValidationError") {
            return res.status(400).json({
                success: false,
                message: error.message
            });
        }
        return serverError(res, "Failed to update ticket details.", error.message);
    }
});

//PATCH /itManagement/itTickets/removeItTicketsAttachmentByEmployee/:id/:employeeId/:companyId"
router.patch("/removeItTicketsAttachmentByEmployee/:id/:employeeId/:companyId", async (req, res): Promise<any> => {
    const t = await dbInstance.transaction();
    try {
        let id = req.params.id;
        let employeeId = req.params.employeeId;
        let companyId = req.params.companyId;
        if (Array.isArray(id)) id = id[0];
        if (Array.isArray(employeeId)) employeeId = employeeId[0];
        if (Array.isArray(companyId)) companyId = companyId[0];
        const { attachmentId } = req.body;
        if (!id || !employeeId || !companyId || !attachmentId) {
            await t.rollback();
            return errorResponse(res, "ticketId, employeeId , companyId and attachmentId are required", null, 400);
        }
        const data = await removeItTicketsAttachmentByEmployee(id, employeeId, companyId, attachmentId, t);
        if (!data) {
            await t.rollback();
            return errorResponse(res, "Attachment not found or unauthorized delete", null, 404);
        }

        await t.commit();
        return successResponse(res, "Attachment is removed successfully.", {id: data.id});

    } catch (error: any) {
        await t.rollback();
        return serverError(res,"Failed to remove attachment of ticket.", error?.message || null)
    }
});

//GET /itManagement/itTickets/getItTicketsByCompanyId/:companyId
router.get("/getItTicketsByCompanyId/:companyId", async (req, res): Promise<any> => {
    try {
        let companyId = req.params.companyId;
        if (Array.isArray(companyId)) companyId = companyId[0];
        const data = await getAllItTicketsByCompanyId(companyId);
        return successResponse(res, "Tickets fetched successfully", data);
    }
    catch (error: any) {
        return serverError(res,"Failed to fetch  tickets by companyId.", error?.message || null)
    }
});

//PATCH /itManagement/itTickets/updateItTicketsStatus/:id/:companyId
router.patch("/updateItTicketsStatus/:id/:employeeId/:companyId", async (req, res): Promise<any> => {
    const t = await dbInstance.transaction();
    try {

        let id = req.params.id;
        let employeeId = req.params.employeeId;
        let companyId = req.params.companyId;
        if (Array.isArray(id)) id = id[0];
        if (Array.isArray(employeeId)) employeeId = employeeId[0];
        if (Array.isArray(companyId)) companyId = companyId[0];
        const { status } = req.body;

        if (!employeeId) {
            await t.rollback();
            return errorResponse(res, "employeeId is required", null, 400);
        }
        if(!status)
        {
            await t.rollback();
            return errorResponse(res, "status is required", null, 400);
        }
        const updatedTicket = await updateItTicketsStatus(id, companyId, status, t);

        if (!updatedTicket) {
            await t.rollback();
            return errorResponse(res, "Ticket not found", null, 404);
        }
        await createItTicketsTimeline(
            updatedTicket.id,
            employeeId,
            status ?? updatedTicket.status ?? "Pending", 
            t
        );
        await t.commit();
        return successResponse(res, "Ticket status is updated", updatedTicket);
    
    } catch (error: any) {
        await t.rollback();
        if (error?.name === "ValidationError") {
            return res.status(400).json({
                success: false,
                message: error.message
            });
        }
        return errorResponse(res, "Failed to update the ticket status.", error?.message || null, 500);
    }
});


//DELETE /itManagement/itTickets/deleteItTickets/:id/:companyId
router.delete("/deleteItTickets/:id/:companyId", async (req, res): Promise<any> => {
    const t = await dbInstance.transaction();
    try {
        let id = req.params.id;
        let companyId = req.params.companyId;
        if (Array.isArray(id)) id = id[0];
        if (Array.isArray(companyId)) companyId = companyId[0];
        const data = await deleteItTickets(id, companyId, t);
        if (!data) {
            await t.rollback();
            return errorResponse(res, "Ticket not found", null, 404);
        }
        await t.commit();
        return successResponse(res, "Ticket is deleted", { id: data.id });
    }
    catch (error: any) {
        await t.rollback();
        return errorResponse(res, "Failed to delete the ticket.", error?.message || null, 500);
    }
})

// PATCH /itManagement/itTickets/updateItTicketsPriority/:id/:companyId
router.patch("/updateItTicketsPriority/:id/:companyId", async (req, res): Promise<any> => {
    const t = await dbInstance.transaction();
    try {
        // const { id, companyId } = req.params;
        let id = req.params.id;
        let companyId = req.params.companyId;
        if (Array.isArray(id)) id = id[0];
        if (Array.isArray(companyId)) companyId = companyId[0];
        const { priority } = req.body;
            if (!priority) {
            await t.rollback();
            return errorResponse(res, "priority is required", null, 400);
        }
        const updated = await updateItTicketsPriority(
            id,
            companyId,
            priority,
            t
        );
        if (!updated) {
            await t.rollback();
            return errorResponse(res, "Ticket not found or unauthorized update", null, 404);
        }
        await t.commit();
        return successResponse(res, "Ticket priority is updated", updated);
    } catch (error: any) {
        await t.rollback();
        if (error?.name === "ValidationError") {
            return res.status(400).json({
                success: false,
                message: error.message
            });
        }
        return errorResponse(res, "Failed to update ticket priority", error?.message || null, 500);
    }
});



export default router;
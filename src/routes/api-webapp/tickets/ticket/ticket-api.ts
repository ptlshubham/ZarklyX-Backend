import express, { Request, Response } from 'express';
import {
    createTicket, getTicketById,
    deleteTicket,
    getTicketsByCompanyId, getTicketsByClientId, getTicketsByManagerId, getTicketsByEmployeeId,
    updateTicketStatus, updateTicketPriority, updateTicketDetails, getTicketByTicketNumber,
    finalizeAndAssignTicket, getTicketsList,getUnassignedTickets
} from './ticket-handler';
import { createTicketAttachment, createAttachmentsZipStream } from '../ticket-attachments/ticket-attachments-handler';
import { serverError, successResponse, unauthorized, errorResponse } from "../../../../utils/responseHandler";
import { convertToRelativePath } from '../../../../services/multer';
import { tokensAttachmentUpload } from '../../../../services/multer';
import dbInstance from '../../../../db/core/control-db';
import { authMiddleware } from '../../../../middleware/auth.middleware';
const router = express.Router();

// POST /api/tickets/createTicket
router.post("/createTicket",authMiddleware, tokensAttachmentUpload.array("attachments", 100), async (req: Request, res: Response): Promise<any> => {
    const t = await dbInstance.transaction();
    try {
        const user = (req as any).user;
        
        if (!user) {
            await t.rollback();
            return unauthorized(res, "User not authenticated");
        }

        let ticketPayload: any = req.body.ticketPayload ?? req.body;
        
        // handle multipart/form-data where client may send JSON string
        if (typeof ticketPayload === 'string') {
            try {
                ticketPayload = JSON.parse(ticketPayload);
            } catch (e) {
                // leave as-is
            }
        }

        if (ticketPayload?.title) ticketPayload.title = ticketPayload.title.trim();
        if (ticketPayload?.description) ticketPayload.description = ticketPayload.description.trim();
        
        if (!ticketPayload || !ticketPayload.title || !ticketPayload.description || !ticketPayload.expectedDate) {
            await t.rollback();
            return errorResponse(res, "title, description and expectedDate are required", null, 400);
        }

        const ticket = await createTicket(ticketPayload, user, t);

        const attachments = convertToRelativePath(
            req.files as Express.Multer.File[]
        );

        if (attachments.length > 0) {
            await createTicketAttachment(ticket.id, attachments, t);
        }

        await t.commit();

        return successResponse(res, "Ticket is created successfully", ticket);

    } catch (err: any) {
        await t.rollback();
        console.error('POST /createTicket error:', err && err.message ? err.message : err);

        if (err.name === "ValidationError") {
            return res.status(400).json({
                success: false,
                message: err.message || "Validation failed"
            });
        }
        if (err.name === "NotFoundError") {
            return res.status(404).json({
                success: false,
                message: err.message || "Resource not found"
            });
        }

        return serverError(res, "Failed to create ticket.");
    }
});

// GET /api/tickets/getTicketById/:id
router.get("/getTicketById/:id", authMiddleware,async (req: Request, res: Response): Promise<any> => {
    try {
        let ticketId = req.params.id;
        if (Array.isArray(ticketId)) ticketId = ticketId[0];
        const user= (req as any).user;
        if(!user){
            return unauthorized(res, "User not authenticated");
        }
        const ticket = await getTicketById(user,ticketId);
        if (!ticket) {
            return errorResponse(res, "Ticket not found", null, 404);
        }
        return successResponse(res, "Ticket details retrieved successfully", ticket);
    } catch (err) {
        return serverError(res, "Failed to get ticket by ticket ID.");
    }
});


router.get("/getTicketsByCompanyId/:companyId", async (req: Request, res: Response): Promise<any> => {
    try {
        let companyId = req.params.companyId;
        if (Array.isArray(companyId)) companyId = companyId[0];
        const tickets = await getTicketsByCompanyId(companyId);
        if (!tickets) {
            return errorResponse(res, "Tickets not found for given companyId", null, 404);
        }
        return successResponse(res, "Tickets retrieved successfully", tickets);
    } catch (err) {
        return serverError(res, "Failed to get tickets by company ID.");
    }
});

router.get("/getTicketsByClientId/:clientId", async (req: Request, res: Response): Promise<any> => {
    try {
        let clientId = req.params.clientId;
        if (Array.isArray(clientId)) clientId = clientId[0];
        const tickets = await getTicketsByClientId(clientId);
        if (!tickets) {
            return errorResponse(res, "Tickets not found for given clientId", null, 404);
        }
        return successResponse(res, "Tickets retrieved successfully", tickets);
    } catch (err) {
        return serverError(res, "Failed to get tickets by client ID.");
    }
});

router.get("/getTicketsByManagerId/:managerId", async (req: Request, res: Response): Promise<any> => {
    try {
        let managerId = req.params.managerId;
        if (Array.isArray(managerId)) managerId = managerId[0];

        const showHandover = req.query.showHandover === "true";

        const tickets = await getTicketsByManagerId(managerId, showHandover);
        if (!tickets) {
            return errorResponse(res, "Tickets not found for given managerId", null, 404);
        }
        return successResponse(res, "Tickets retrieved successfully", tickets);

    } catch (err) {
        return serverError(res, "Failed to get tickets by manager ID.");
    }
});

router.get("/getTicketsByEmployeeId/:employeeId", async (req: Request, res: Response): Promise<any> => {
    try {
        let employeeId = req.params.employeeId;
        if (Array.isArray(employeeId)) employeeId = employeeId[0];
        const tickets = await getTicketsByEmployeeId(employeeId);
        if (!tickets) {
            return errorResponse(res, "Tickets not found for given employeeId", null, 404);
        }
        return successResponse(res, "Tickets retrieved successfully", tickets);
    } catch (err) {
        return serverError(res, "Failed to get tickets by employee ID.");
    }
});

router.put("/updateTicketStatus/:id", async (req: Request, res: Response): Promise<any> => {
    const t = await dbInstance.transaction();
    try {
        let ticketId = req.params.id;
        if (Array.isArray(ticketId)) ticketId = ticketId[0];
        const { userId } = req.body;
        const status = (req.body.status || '').trim();
        if (!userId) {
            await t.rollback();
            return errorResponse(res, "userId is required", null, 400);
        }
        if (!status) {
            await t.rollback();
            return errorResponse(res, "status is a required field", null, 400);
        }
        const updatedTicket = await updateTicketStatus(ticketId, status, userId, t);
        await t.commit();

        return successResponse(res, "Ticket status is updated successfully", updatedTicket);
    } catch (err) {
        await t.rollback();
        return serverError(res, "Failed to update ticket status.");
    }
});

router.put("/updateTicketPriority/:id", async (req: Request, res: Response): Promise<any> => {
    const t = await dbInstance.transaction();
    try {
        let ticketId = req.params.id;
        if (Array.isArray(ticketId)) ticketId = ticketId[0];
        const { userId } = req.body;
        const priority = (req.body.priority || '').trim();

        if (!userId) {
            await t.rollback();
            return errorResponse(res, "userId is required", null, 400);
        }
        if (!priority) {
            await t.rollback();
            return errorResponse(res, "priority is a required field", null, 400);
        }
        const updatedTicket = await updateTicketPriority(ticketId, priority, userId, t);
        await t.commit();

        return successResponse(res, "Ticket priority is updated successfully", updatedTicket);
    } catch (err) {
        await t.rollback();
        return serverError(res, "Failed to update ticket priority.");
    }
});

// PATCH /api/tickets/updateTicketDetails/:id/:companyId
router.patch(
    "/updateTicketDetails/:id/:companyId",
    tokensAttachmentUpload.array("attachments", 100),
    async (req: Request, res: Response): Promise<any> => {
        const t = await dbInstance.transaction();
        try {
            let ticketId = req.params.id;
            let companyId = req.params.companyId;
            if (Array.isArray(ticketId)) ticketId = ticketId[0];
            if (Array.isArray(companyId)) companyId = companyId[0];

            const { title, description, expectedDate, deliveryDate, assignedManagerId } = req.body;
            const newAttachments = convertToRelativePath(req.files as Express.Multer.File[]);

            if (!ticketId || !companyId) {
                await t.rollback();
                return errorResponse(res, "Ticket ID and Company ID are required", null, 400);
            }
            if (title) req.body.title = title.trim();
            if (description) req.body.description = description.trim();
            if (expectedDate) {
                const parsedExpectedDate = new Date(expectedDate);
                if (isNaN(parsedExpectedDate.getTime())) {
                    await t.rollback();
                    return errorResponse(res, "Invalid expectedDate format", null, 400);
                }
            }

            if (deliveryDate) {
                const parsedDeliveryDate = new Date(deliveryDate);
                if (isNaN(parsedDeliveryDate.getTime())) {
                    await t.rollback();
                    return errorResponse(res, "Invalid deliveryDate format", null, 400);
                }
            }
            if (
                title === undefined &&
                description === undefined &&
                expectedDate === undefined &&
                deliveryDate === undefined &&
                assignedManagerId === undefined &&
                newAttachments.length === 0
            ) {
                await t.rollback();
                return errorResponse(res, "At least one field is required to update", null, 400);
            }

            const updatedTicket = await updateTicketDetails(ticketId, companyId, req.body, t);

            if (!updatedTicket) {
                await t.rollback();
                return errorResponse(res, "Ticket not found or unauthorized update", null, 404);
            }

            if (newAttachments.length > 0) {
                await createTicketAttachment(ticketId, newAttachments, t);
            }

            await t.commit();

            return res.status(200).json({
                success: true,
                message: "Ticket details updated successfully",
                data: updatedTicket,
            });
        } catch (err) {
            await t.rollback();
            return serverError(res, "Failed to update ticket details.");
        }
    }
);



// soft DELETE /api/tickets/deleteTicket/:id/:companyId
router.delete("/deleteTicket/:id/:companyId", async (req: Request, res: Response): Promise<any> => {
    const t = await dbInstance.transaction();
    try {
        let id = req.params.id;
        if (Array.isArray(id)) id = id[0];
        let companyId = req.params.companyId;
        if (Array.isArray(companyId)) companyId = companyId[0];
        const data = await deleteTicket(id, companyId, t);
        if (!data) {
            await t.rollback();
            return errorResponse(res, "Ticket not found", null, 404);
        }
        await t.commit();
        return successResponse(res, "Ticket deleted successfully", { id: data.id });
    }
    catch (err) {
        await t.rollback();
        return serverError(res, "Failed to delete ticket.");
    }
});

// GET /api/tickets/downloadAllAttachments/:id
router.get("/downloadAllAttachments/:id", authMiddleware,async (req: Request, res: Response): Promise<any> => {
    try {
        let id = req.params.id;
        if (Array.isArray(id)) id = id[0];

        if (!id) {
            errorResponse(res, "Ticket ID is required", null, 400);
            return;
        }
        const user = (req as any).user;
        if(!user){
            return unauthorized(res, "User not authenticated");
        }
        const ticket = await getTicketById(user,id);
        if (!ticket) {
            errorResponse(res, "Ticket not found", null, 404);
            return;
        }

        const fileName = ticket.ticketNumber
            ? `${ticket.ticketNumber}_attachments.zip`
            : `ticket_${id}_attachments.zip`;

        res.setHeader("Content-Type", "application/zip");
        res.setHeader("Content-Disposition", `attachment; filename="${fileName}"`);

        await createAttachmentsZipStream(id, res);
    } catch (err: any) {

        if (err.message === "No attachments found for this ticket") {
            if (!res.headersSent) {
                errorResponse(res, "No attachments found for this ticket", null, 404);
            }
            return;
        }

        if (!res.headersSent) {
            serverError(res, "Failed to download attachments");
        }
    }
});

// PUT /api/tickets/finalizeAndAssign/:id
router.put("/finalizeAndAssign/:id", async (req: Request, res: Response): Promise<any> => {
    const t = await dbInstance.transaction();
    try {
        let id = req.params.id;
        if (Array.isArray(id)) id = id[0];
        const { deliveryDate, priority, assignedEmployeeIds, assignedBy } = req.body;

        if (!assignedBy) {
            await t.rollback();
            return errorResponse(res, "assignedBy (userId) is required", null, 400);
        }
        if (!deliveryDate) {
            await t.rollback();
            return errorResponse(res, "deliveryDate is required", null, 400);
        }
        if (!priority) {
            await t.rollback();
            return errorResponse(res, "priority is required", null, 400);
        }
        if (!assignedEmployeeIds || !Array.isArray(assignedEmployeeIds) || assignedEmployeeIds.length === 0) {
            await t.rollback();
            return errorResponse(res, "assignedEmployeeIds must be a non-empty array", null, 400);
        }

        const parsedDate = new Date(deliveryDate);
        if (isNaN(parsedDate.getTime())) {
            await t.rollback();
            return errorResponse(res, "Invalid deliveryDate format", null, 400);
        }
        const updatedTicket = await finalizeAndAssignTicket(id, { deliveryDate, priority, assignedEmployeeIds }, assignedBy, t);
        await t.commit();
        return successResponse(res, "Ticket finalized and employees assigned successfully", updatedTicket);
    } catch (err: any) {
        await t.rollback();
        if (err.name === "ValidationError") {
            return res.status(400).json({
                success: false,
                message: err.message || "Validation failed"
            });
        }
        if (err.name === "NotFoundError") {
            return res.status(404).json({
                success: false,
                message: err.message || "Resource not found"
            });
        }
        return serverError(res, "Failed to finalize and assign ticket.");
    }
});

router.get("/getTicketByTicketNumber/", async (req: Request, res: Response): Promise<any> => {
    try {
        let ticketNumber = req.query.ticketNumber;
        if (Array.isArray(ticketNumber)) ticketNumber = ticketNumber[0];
        if (typeof ticketNumber !== "string") {
            return errorResponse(res, "ticketNumber must be a string", null, 400);
        }

        ticketNumber = ticketNumber.trim().toUpperCase();

        if (!ticketNumber) {
            return errorResponse(res, "ticketNumber is required", null, 400);
        }

        const ticket = await getTicketByTicketNumber(ticketNumber as string);
        if (!ticket) {
            return errorResponse(res, "Ticket not found", null, 404);
        }
        return successResponse(res, "Ticket retrieved successfully", ticket);
    } catch (error: any) {
        return serverError(res, "Failed to get ticket by ticket number.");
    }
});

/**
 * UNIFIED TICKET LIST - Single endpoint for all roles
 * Uses JWT to auto-detect role and apply filters
 * Query params: status, priority, startDate, endDate, sortBy, sortOrder, page, limit
 */
router.get("/list", authMiddleware, async (req: Request, res: Response): Promise<any> => {
    try {
        const user = (req as any).user;
        
        if (!user) {
            return unauthorized(res, "User not authenticated");
        }

        // Map query params to TicketFilters + pagination
        const filters: any = {
            // Existing TicketFilters
            overallStatus: req.query.status,
            priority: req.query.priority,
            startDate: req.query.dateFrom,
            endDate: req.query.dateTo,
            // Pagination & sorting
            sortBy: req.query.sortBy,
            sortOrder: (req.query.sortOrder as 'asc' | 'desc') || 'desc',
            page: parseInt(req.query.page as string) || 1,
            limit: parseInt(req.query.limit as string) || 20
        };


        const result = await getTicketsList(user, filters);
        
        
        return successResponse(res, "Tickets retrieved successfully", {
            tickets: result.tickets,
            pagination: {
                total: result.total,
                page: result.page,
                limit: result.limit,
                totalPages: Math.ceil(result.total / result.limit)
            }
        });
    } catch (error: any) {
        console.error("Error in /list:", error);
        return serverError(res, error.message || "Failed to retrieve tickets");
    }
});

/**
 * GET /api/tickets/unassigned
 * Returns tickets in the user's company that have no active assignments
 */
router.get('/unassigned', authMiddleware, async (req: Request, res: Response): Promise<any> => {
    try {
        const user = (req as any).user;
        if (!user) return unauthorized(res, 'User not authenticated');

        const tickets = await getUnassignedTickets(user);
        return successResponse(res, 'Unassigned tickets retrieved successfully', tickets);
    } catch (err: any) {
        console.error('Error in /unassigned:', err);
        return serverError(res, 'Failed to retrieve unassigned tickets');
    }
});

export default router;
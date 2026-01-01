import express, { Request, Response } from 'express';
import { ItTickets } from './it-Tickets-model';
import {
    createTicket,
    getTicketById,
    getAllTicketsByUserId,
    getAllTicketByCompanyId,
    updateTicketStatus,
    deleteTicket, updateTicketDetails,
    removeTicketAttachmentsByUser
} from './it-Tickets-handler';
import { serverError, success, unauthorized } from "../../../../utils/responseHandler";
// import { tokenMiddleWare } from 'src/services/jwtToken-service';
import dbInstance from '../../../../db/core/control-db';
import { ticketAttachmentUpload } from '../../../../services/multer';
import path from "path";

const router = express.Router();


//create ticket route PATCH /itManagement/itTickets/createItTickets
router.post("/createItTickets", ticketAttachmentUpload.array("attachments", 5), async (req: Request, res: Response): Promise<any> => {
        const t = await dbInstance.transaction();
        try {
            if (req.files?.length) {
                req.body.attachments = (req.files as Express.Multer.File[]).map(
                    (f) => {
                        const relativePath = path
                            .relative(
                                path.join(process.cwd(), "src/public"),
                                f.path
                            )
                            .replace(/\\/g, "/");

                        return `/${relativePath}`;
                    }
                );
            } else {
                req.body.attachments = null;
            }

            const data = await createTicket(req.body, t);
            await t.commit();

            return res.status(200).json({
                success: true,
                message: "Ticket created successfully",
                data,
            });
        } catch (error) {
            await t.rollback();
            console.error("Create Ticket Error:", error);
            return serverError(res, "Failed to create ticket.");
        }
    }
);



//GET /itManagement/itTickets/getById/:id
router.get("/getItTicketsById/:id", async (req, res): Promise<any> => {
    try {
        const data = await getTicketById(req.params.id);
        return res.status(200).json({
            success: true,
            data,
        })
    }
    catch (error) {
        console.error("Get Ticket Error:", error);
        return serverError(res, "Failed to get ticket");
    }
});

//GET /itManagement/itTickets/getItTicketsByUserId/:userId
router.get("/getItTicketsByUserId/:userId", async (req, res): Promise<any> => {
    try {
        const data = await getAllTicketsByUserId(req.params.userId);
        return res.status(200).json({
            success: true,
            data,
        });
    } catch (error) {
        return serverError(res, "Failed to fetch tickets bu userId.")
    }
});

//PATCH /itManagement/itTickets/updateItTicketsDetailsByUser
router.patch("/updateItTicketsDetailsByUser", ticketAttachmentUpload.array("attachments", 5), async (req, res): Promise<any> => {
    const t = await dbInstance.transaction();
    try {
        const { id, userId, subject, description, preferredDate } = req.body;
        if (req.files && Array.isArray(req.files) && req.files.length > 0) {
            req.body.attachments = (req.files as Express.Multer.File[]).map(
                (f) => {
                    const relativePath = path
                        .relative(
                            path.join(process.cwd(), "src/public"),
                            f.path
                        )
                        .replace(/\\/g, "/");

                    return `/${relativePath}`;
                }
            );
        }
        if (!id || !userId) {
            await t.rollback();
            return res.status(400).json({
                success: false,
                message: "Ticket id and userId are required.",
            });
        }

        if (
            subject === undefined &&
            description === undefined &&
            preferredDate === undefined &&
            req.body.attachments === undefined
        ) {
            await t.rollback();
            return res.status(400).json({
                success: false,
                message: "At least one field is required to update.",
            });
        }

        const updatedTicket = await updateTicketDetails(id, userId, req.body, t);

        // If helper returned [0], it means no ticket found
        if (!updatedTicket) {
            await t.rollback();
            return res.status(404).json({
                success: false,
                message: "Ticket not found or unauthorized update.",
            });
        }


        await t.commit();
        return res.status(200).json({
            success: true,
            message: "Ticket details updated successfully.",
            data: updatedTicket,
        })
    }
    catch (error) {
        await t.rollback();
        return serverError(res, "Failed to update ticket details.")
    }
});

//PATCH /itManagement/itTickets/removeItTicketsAttachmentsByUser
router.patch("/removeItTicketsAttachmentsByUser", async (req, res): Promise<any> => {
    const t = await dbInstance.transaction();
    try {
        const { id, userId, attachment } = req.body;
        if (!id || !userId || !attachment) {
            await t.rollback();
            return res.status(400).json({
                success: false,
                message: "ticketId, userId and attachment path are required",
            });
        }
        const data = await removeTicketAttachmentsByUser(id, userId, attachment, t);
        if (!data) {
            await t.rollback();
            return res.status(404).json({
                success: false,
                message: "Ticket not found or unauthorized",
            });
        }
        await t.commit();
        return res.status(200).json({
            success: true,
            message: "Attachment removed successfully.",
            data
        });

    } catch (error) {
        return serverError(res, "Failed to update remove ticket attachment.")
    }
});

//GET /itManagement/itTickets/getItTicketsByCompanyId/:companyId
router.get("/getItTicketsByCompanyId/:companyId", async (req, res): Promise<any> => {
    try {
        const data = await getAllTicketByCompanyId(req.params.companyId);
        return res.status(200).json({
            sucess: true,
            data
        })
    }
    catch {
        return serverError(res, "Failed to fetch tickets by companyId.")
    }
});

//PATCH /itManagement/itTickets/updateItTicketsStatus
router.patch("/updateItTicketsStatus", async (req, res): Promise<any> => {
    const t = await dbInstance.transaction();
    try {


        const { id, status } = req.body;
        const data = await updateTicketStatus(id, status, t);
        await t.commit();
        return res.status(200).json({
            success: true,
            message: "Ticket status updated",
            data,
        });

    } catch (error) {
        await t.rollback();
        return serverError(res, "Failed to update the ticket status.")
    }
});


//DELETE /itManagement/itTickets/deleteItTickets/:id
router.delete("/deleteItTickets/:id", async (req, res): Promise<any> => {
    const t = await dbInstance.transaction();
    try {

        const data = await deleteTicket(req.params.id, t);
        await t.commit();
        return res.status(200).json({
            success: true,
            message: "Ticket deleted",
            data,
        });
    }
    catch (error) {
        await t.rollback();
        return serverError(res, "Failed to delete the ticket.");
    }
})

export default router;
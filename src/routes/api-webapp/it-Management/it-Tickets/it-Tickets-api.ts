import express, { Request, Response } from 'express';
import { ItTickets } from './it-Tickets-model';
import {
    createItTickets,
    getItTicketsById,
    getAllItTicketsByEmployeeId,
    getAllItTicketsByCompanyId,
    updateItTicketsStatus,
    deleteItTickets,
    updateItTicketsDetailsByEmployee,
    updateItTicketsPriority,
    // assignItTickets
} from './it-Tickets-handler';
import { createItTicketsAttachments, removeItTicketsAttachmentByEmployee } from './it-Tickets-Attachments/it-Tickets-Attachments-handler';
import { createItTicketsTimeline } from './it-Tickets-Timeline/it-Tickets-Timeline-handler';
import { serverError, success, unauthorized } from "../../../../utils/responseHandler";
import { convertToRelativePath } from '../../../../services/multer';
import { Employee } from '../../agency/employee/employee-model';
// import { tokenMiddleWare } from 'src/services/jwtToken-service';
import dbInstance from '../../../../db/core/control-db';
import { ticketAttachmentUpload } from '../../../../services/multer';
import path from "path";

const router = express.Router();


//create ticket route PATCH /itManagement/itTickets/createItTickets
router.post("/createItTickets", ticketAttachmentUpload.array("attachments", 100), async (req: Request, res: Response): Promise<any> => {
    const t = await dbInstance.transaction();
    try {
        const { userId, companyId, userType } = req.body;

        if (!userId || !companyId || !userType) {
            await t.rollback();
            return res.status(400).json({
                success: false,
                message: "userId, companyId and userType are required."
            })
        }
        if (typeof userType !== "string" || userType.toLowerCase() !== "employee") {
            await t.rollback();
            return unauthorized(res, "Only employees are allowed to create it tickets.");
        }
        const employee = await Employee.findOne({
            where: {
                userId, companyId, isDeleted: false
            },
            transaction: t,

        });

        if (!employee) {
            await t.rollback();
            return res.status(404).json({
                success: false,
                message: "Employee not found.",
            });
        }
        const attachments = convertToRelativePath(
            req.files as Express.Multer.File[]
        );
        const ticketPayload = {
            ...req.body,
            priority: req.body.priority || "Low",
            employeeId: employee.id,
            attachments,
        }

        const data = await createItTickets(ticketPayload, t);
        await createItTicketsTimeline(data.id, data.employeeId, data.status, t);

        if (attachments.length > 0) {
            await createItTicketsAttachments(data.id, attachments, t);
        }

        await t.commit();
        return res.status(200).json({
            success: true,
            message: "Ticket is created successfully",
            data,
        });
    } catch (error) {
        await t.rollback();
        return serverError(res, "Failed to create  ticket.");
    }
}
);



//GET /itManagement/itTickets/getItTicketsById/:id
router.get("/getItTicketsById/:id", async (req, res): Promise<any> => {
    try {
        let id = req.params.id;
        if (Array.isArray(id)) id = id[0];
        const data = await getItTicketsById(id);

        return res.status(200).json({
            success: true,
            data,
        })
    }
    catch (error) {
        return serverError(res, "Failed to get  ticket");
    }
});

//GET /itManagement/itTickets/getAllItTicketsByEmployeeId/:employeeId
router.get("/getAllItTicketsByEmployeeId/:employeeId", async (req, res): Promise<any> => {
    try {
        let employeeId = req.params.employeeId;
        if (Array.isArray(employeeId)) employeeId = employeeId[0];
        const data = await getAllItTicketsByEmployeeId(employeeId);
        return res.status(200).json({
            success: true,
            data,
        });
    } catch (error) {
        return serverError(res, "Failed to fetch  tickets by employeeId.")
    }
});

//PATCH /itManagement/itTickets/updateItTicketsDetailsByEmployee/:id/:employeeId/:companyId
router.patch("/updateItTicketsDetailsByEmployee/:id/:employeeId/:companyId", ticketAttachmentUpload.array("attachments", 5), async (req, res): Promise<any> => {
    const t = await dbInstance.transaction();
    try {
        // const { id, employeeId, companyId } = req.params;
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
            return res.status(400).json({
                success: false,
                message: "Ticket id, employeeId and companyId are required.",
            });
        }

        if (
            subject === undefined &&
            description === undefined &&
            preferredDate === undefined &&
            newAttachments.length === 0
        ) {
            await t.rollback();
            return res.status(400).json({
                success: false,
                message: "At least one field is required to update.",
            });
        }

        const updatedTicket = await updateItTicketsDetailsByEmployee(id, employeeId, companyId, req.body, t);

        // If helper returned [0], it means no ticket found
        if (!updatedTicket) {
            await t.rollback();
            return res.status(404).json({
                success: false,
                message: "Ticket not found or unauthorized update.",
            });
        }

        if (newAttachments.length > 0) {
            await createItTicketsAttachments(updatedTicket.id, newAttachments, t);

        }

        await t.commit();
        return res.status(200).json({
            success: true,
            message: "Ticket details are updated successfully.",
            data: updatedTicket,
        })
    }
    catch (error) {
        await t.rollback();
        return serverError(res, "Failed to update ticket details.")
    }
});

//PATCH /itManagement/itTickets/removeItTicketsAttachmentByEmployee/:id/:employeeId/:companyId"
router.patch("/removeItTicketsAttachmentByEmployee/:id/:employeeId/:companyId", async (req, res): Promise<any> => {
    const t = await dbInstance.transaction();
    try {
        // const { id, employeeId, companyId } = req.params;
        let id = req.params.id;
        let employeeId = req.params.employeeId;
        let companyId = req.params.companyId;
        if (Array.isArray(id)) id = id[0];
        if (Array.isArray(employeeId)) employeeId = employeeId[0];
        if (Array.isArray(companyId)) companyId = companyId[0];
        const { attachmentId } = req.body;
        if (!id || !employeeId || !companyId || !attachmentId) {
            await t.rollback();
            return res.status(400).json({
                success: false,
                message: "ticketId, employeeId , companyId and attachmentId are required",
            });
        }
        const data = await removeItTicketsAttachmentByEmployee(id, employeeId, companyId, attachmentId, t);
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
            message: "Attachment is removed successfully.",
            data
        });

    } catch (error) {
        return serverError(res, "Failed to remove attachment of ticket.")
    }
});

//GET /itManagement/itTickets/getItTicketsByCompanyId/:companyId
router.get("/getItTicketsByCompanyId/:companyId", async (req, res): Promise<any> => {
    try {
        let companyId = req.params.companyId;
        if (Array.isArray(companyId)) companyId = companyId[0];
        const data = await getAllItTicketsByCompanyId(companyId);
        return res.status(200).json({
            sucess: true,
            data
        })
    }
    catch {
        return serverError(res, "Failed to fetch  tickets by companyId.")
    }
});

//PATCH /itManagement/itTickets/updateItTicketsStatus/:id/:companyId
router.patch("/updateItTicketsStatus/:id/:employeeId/:companyId", async (req, res): Promise<any> => {
    const t = await dbInstance.transaction();
    try {

        // const { id, employeeId, companyId } = req.params;
        let id = req.params.id;
        let employeeId = req.params.employeeId;
        let companyId = req.params.companyId;
        if (Array.isArray(id)) id = id[0];
        if (Array.isArray(employeeId)) employeeId = employeeId[0];
        if (Array.isArray(companyId)) companyId = companyId[0];
        const { status } = req.body;
        await updateItTicketsStatus(id, companyId, status, t);

        if (!employeeId) {
            await t.rollback();
            return res.status(400).json({ message: "employeeId is required" });
        }
        const updatedTicket = await ItTickets.findOne({
            where: { id, companyId },
            transaction: t,
        });

        if (!updatedTicket) {
            await t.rollback();
            return res.status(404).json({ success: false, message: "Ticket not found" });
        }

        await createItTicketsTimeline(
            updatedTicket.id,
            employeeId,
            status ?? updatedTicket.status ?? "Pending", // ensure a valid status
            t
        );
        await t.commit();
        return res.status(200).json({
            success: true,
            message: "Ticket status is updated",
            data: updatedTicket,
        });

    } catch (error) {
        await t.rollback();
        return serverError(res, "Failed to update the ticket status.")
    }
});


//DELETE /itManagement/itTickets/deleteItTickets/:id/:companyId
router.delete("/deleteItTickets/:id/:companyId", async (req, res): Promise<any> => {
    const t = await dbInstance.transaction();
    try {
        // const { id, companyId } = req.params;
        let id = req.params.id;
        let companyId = req.params.companyId;
        if (Array.isArray(id)) id = id[0];
        if (Array.isArray(companyId)) companyId = companyId[0];
        const data = await deleteItTickets(id, companyId, t);
        if (!data) {
            await t.rollback();
            return res.status(404).json({ success: false, message: "Ticket not found" });
        }
        await t.commit();
        return res.status(200).json({
            success: true,
            message: "Ticket is deleted",
            id: data.id,
        });
    }
    catch (error) {
        await t.rollback();
        console.error("Delete Asset Error:", error);
        return serverError(res, "Failed to delete the ticket.");
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

        const updated = await updateItTicketsPriority(
            id,
            companyId,
            priority,
            t
        );

        if (!updated) {
            await t.rollback();
            return res.status(404).json({
                success: false,
                message: "Ticket not found",
            });
        }

        await t.commit();
        return res.status(200).json({
            success: true,
            message: "Ticket priority updated",
        });
    } catch (error) {
        await t.rollback();
        return serverError(res, "Failed to update ticket priority");
    }
}
);


export default router;
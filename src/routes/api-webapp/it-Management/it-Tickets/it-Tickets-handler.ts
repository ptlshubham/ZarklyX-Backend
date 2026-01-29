
import { Op, Transaction } from "sequelize";
import { ItTickets } from "./it-Tickets-model";
import fs from "fs";
import path from "path";

//create a new ticket
export async function createTicket(ticketData: any, t: any) {
    return await ItTickets.create(ticketData, { transaction: t });
}


//get individual ticket by id
export async function getTicketById(id: string) {
    return await ItTickets.findOne({
        where: { id: id }
    })
}

//get all tickets by user id
export async function getAllTicketsByUserId(userId: string) {
    return await ItTickets.findAll({
        where: {
            userId: userId
        }
    });
}

function normalizeAttachments(
    attachments: string[] | string | null
): string[] {
    if (Array.isArray(attachments)) return attachments;
    if (typeof attachments === "string") {
        try {
            return JSON.parse(attachments);
        } catch {
            return [];
        }
    }
    return [];
}

//update ticket details by user
export async function updateTicketDetails(id: string, userId: string, ticketData: any, t: any) {
    const ticket = await ItTickets.findOne({
        where: { id, userId, isDeleted: false },
        transaction: t,
    });
    if (!ticket) return null;
    const allowedData: any = {
        'subject': ticketData.subject,
        'description': ticketData.description,
        'preferredDate': ticketData.preferredDate,
    };

    (Object.keys(allowedData) as (keyof typeof allowedData)[]).forEach(
        (key) => allowedData[key] === undefined && delete allowedData[key]
    );

    if (ticketData.attachments?.length) {
        const existing = normalizeAttachments(ticket.attachments);
        allowedData.attachments = [...existing, ...ticketData.attachments];
    }

    await ItTickets.update(allowedData, {
        where: {
            id: id,
            userId: userId,
            isDeleted: false,
        },
        transaction: t,
    })
    // Fetch the updated ticket again
    const updatedTicket = await ItTickets.findOne({
        where: { id, userId, isDeleted: false },
        transaction: t,
    });

    if (!updatedTicket) return null;

    const ticketObj = updatedTicket.get({ plain: true });
    ticketObj.attachments = normalizeAttachments(ticketObj.attachments);

    return ticketObj;

}

//remove ticket attachment by user
export async function removeTicketAttachmentsByUser(id: string, userId: string, attachment: string, t: Transaction) {
    const ticket = await ItTickets.findOne({
        where: {
            id: id, userId: userId, isDeleted: false
        },
        transaction: t
    });
    if (!ticket) return null;

    const existingAttachments = normalizeAttachments(ticket.attachments);

    const updatedAttachments = existingAttachments.filter(
        (filePath) => filePath !== attachment
    );

    if (updatedAttachments.length === existingAttachments.length) {
        return [0];
    }

    try {
        const absolutePath = path.join(
            process.cwd(),
            "src",
            "public",
            attachment
        );

        if (fs.existsSync(absolutePath)) {
            fs.unlinkSync(absolutePath);
        }
    } catch (err) {
        console.error("File delete failed:", err);
    }

    return await ItTickets.update(
        { attachments: updatedAttachments },
        { where: { id: id, userId: userId, isDeleted: false }, transaction: t }
    );
}
//get all tickets by company id
export async function getAllTicketByCompanyId(companyId: string) {
    return await ItTickets.findAll({
        where: {
            companyId: companyId
        }
    });
}

//update ticket status
export async function updateTicketStatus(id: string, status: string, t: Transaction) {
    return await ItTickets.update(
        { status },
        {
            where: { id },
            transaction: t,
        }
    );
}

//delete ticket
export async function deleteTicket(id: string, t: Transaction) {
    return await ItTickets.update({
        isDeleted: true
    }, {
        where: { id },
        transaction: t
    });
}


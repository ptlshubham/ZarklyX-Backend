import { Transaction } from "sequelize";
import { Response } from "express";
import { Ticket } from "../ticket/ticket-model";
import { Op } from "sequelize";
import { TicketAttachment } from "./ticket-attachments-model";
import path from "path";
import fs from "fs";
import JSZip from "jszip";

// Create ticket attachments (for ticket creation or updates)
export const createTicketAttachment = async (
    ticketId: string,
    attachmentPaths: string[],
    t: Transaction,
    changeId?: string,
): Promise<TicketAttachment[]> => {
    try {
        if (!attachmentPaths || attachmentPaths.length === 0) return [];

        const ticketExists = await Ticket.findByPk(ticketId, { transaction: t });
        if (!ticketExists) {
            throw new Error("Ticket not found");
        }

        const records = attachmentPaths.map((path: string) => ({
            ticketId: ticketId,
            attachmentPath: path,
            changeId: changeId || null, 
        }));

        return await TicketAttachment.bulkCreate(records, {
            transaction: t,
        });
    } catch (error) {
        throw error;
    }
};

// Get all attachments for a ticket
export const getAttachmentsByTicketId = async (
    ticketId: string
): Promise<TicketAttachment[]> => {
    try {
        const attachments = await TicketAttachment.findAll({
            where: { ticketId },
            order: [["createdAt", "ASC"]],
        });
        return attachments;
    } catch (error) {
        throw error;
    }
};

// Download all attachments as ZIP file using JSZip with streaming

export const createAttachmentsZipStream = async (
    ticketId: string,
    res: Response
): Promise<void> => {
    const attachments = await TicketAttachment.findAll({
        where: { ticketId },
    });

    if (!attachments || attachments.length === 0) {
        throw new Error("No attachments found for this ticket");
    }

    const zip = new JSZip();

    for (const attachment of attachments) {
        const filePath = path.join(process.cwd(), "src", "public" + attachment.attachmentPath);
        const fileName = path.basename(filePath);

        if (fs.existsSync(filePath)) {
            const fileContent = fs.readFileSync(filePath);
            zip.file(fileName, fileContent);
        } else {
            console.warn(`⚠️ File not found: ${filePath}`);
        }
    }

    const zipBuffer = await zip.generateAsync({
        type: "nodebuffer",
        compression: "STORE"
    });

    res.setHeader("Content-Length", zipBuffer.length);

    res.end(zipBuffer);
};


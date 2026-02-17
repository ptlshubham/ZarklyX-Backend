import { ItTickets } from "../it-Tickets-model";
import { ItTicketsAttachments } from "./it-Tickets-Attachments-model";
import { Transaction } from "sequelize";
import path from "path";
import fs from "fs";

export async function createItTicketsAttachments(
  ticketId: string,
  attachmentPaths: string[],
  t: Transaction
) {
  if (!attachmentPaths || attachmentPaths.length === 0) return [];

  const ticketExists = await ItTickets.findByPk(ticketId, { transaction: t });
  if (!ticketExists) {
    throw new Error("Ticket not found");
  }

  const records = attachmentPaths.map((path) => ({
    itTicketId: ticketId,
    attachmentPath: path,
  }));

  return await ItTicketsAttachments.bulkCreate(records, {
    transaction: t,
  });
}


export async function removeItTicketsAttachmentByEmployee(
  ticketId:string,
  employeeId:string,
  companyId: string,
  attachmentId: string,
  t: Transaction
) {
  const ticket=await ItTickets.findOne({
    where:{id:ticketId,employeeId,companyId,isDeleted:false},
    transaction:t,
  })
  if(!ticket) return null;
  const attachment = await ItTicketsAttachments.findOne({
    where: { id: attachmentId, itTicketId:ticketId},
    transaction: t,
  });

  if (!attachment) return null;

  // delete file
  const absolutePath = path.join(
    process.cwd(),
    "src",
    "public",
    attachment.attachmentPath
  );

  if (fs.existsSync(absolutePath)) {
    fs.unlinkSync(absolutePath);
  }

  await attachment.destroy({ transaction: t });
  return true;
}
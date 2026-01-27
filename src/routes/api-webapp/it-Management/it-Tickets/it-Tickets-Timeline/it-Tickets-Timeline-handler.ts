import { Op, Transaction } from "sequelize";
import { ItTicketsTimeline } from "./it-Tickets-Timeline-model";

export async function createItTicketsTimeline(
  ticketId: string,
  employeeId:string,
  status: string | null,
  t: Transaction
) {
  return await ItTicketsTimeline.create(
    {
      itTicketId: ticketId,
      employeeId,
      status: status ?? "Pending",
    },
    { transaction: t }
  );
}

export async function getTimelineByTicketId(itTicketId: string) {
  return await ItTicketsTimeline.findAll({
    where: { itTicketId },
    order: [["createdAt", "ASC"]],
  });
}


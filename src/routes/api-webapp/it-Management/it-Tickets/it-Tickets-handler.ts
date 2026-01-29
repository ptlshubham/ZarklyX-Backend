
import { Op, Transaction } from "sequelize";
import { ItTickets } from "./it-Tickets-model";
import fs from "fs";
import path from "path";

//create a new ticket
export async function createItTickets(ticketData: any, t: any) {
    return await ItTickets.create(ticketData, { transaction: t });
}


//get individual ticket by id
export async function getItTicketsById(id: string) {
    return await ItTickets.findOne({
        where: { id },
        include: [
            { association: "attachments" },
            {
                association: "timeline",
                separate: true,
                order: [["createdAt", "DESC"]],
                include: [
                    {
                        association: "assignedEmployee",
                        attributes: ["id", "profilePhoto", "designation", "employeeStatus"],
                        include: [
                            {
                                association: "user",
                                attributes: ["firstName", "lastName", "email", "contact"],
                            },
                        ],
                    },
                ]
            },
            {
                association: "assignedEmployee",
                attributes: ["id", "profilePhoto", "designation", "employeeStatus"],
                include: [
                    {
                        association: "user",
                        attributes: ["firstName", "lastName", "email", "contact"]

                    },
                ],
            },
        ],
    })
}

//get all tickets by user id
export async function getAllItTicketsByEmployeeId(employeeId: string) {
    return await ItTickets.findAll({
        where: {
            employeeId: employeeId, isDeleted: false
        },
        include: [
            { association: "attachments" },
            {
                association: "timeline",
                separate: true,
                order: [["createdAt", "DESC"]],
                include: [
                    {
                        association: "assignedEmployee",
                        attributes: ["id", "profilePhoto", "designation", "employeeStatus"],
                        include: [
                            {
                                association: "user",
                                attributes: ["firstName", "lastName", "email", "contact"],
                            },
                        ],
                    },
                ]
            },
            {
                association: "assignedEmployee",
                attributes: ["id", "profilePhoto", "designation", "employeeStatus"],
                include: [
                    {
                        association: "user",
                        attributes: ["firstName", "lastName", "email", "contact"]

                    },
                ],
            },
        ],
    });
}



//update ticket details by employee
export async function updateItTicketsDetailsByEmployee(id: string, employeeId: string, companyId: string, ticketData: any, t: any) {
    const ticket = await ItTickets.findOne({
        where: { id, employeeId, isDeleted: false },
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


    await ItTickets.update(allowedData, {
        where: {
            id: id,
            employeeId: employeeId,
            isDeleted: false,
        },
        transaction: t,
    })
    // Fetch the updated ticket again
    const updatedTicket = await ItTickets.findOne({
        where: { id, employeeId, isDeleted: false },
        transaction: t,
    });

    if (!updatedTicket) return null;

    const ticketObj = updatedTicket.get({ plain: true });
    return ticketObj;

}


//get all tickets by company id
export async function getAllItTicketsByCompanyId(companyId: string) {
    return await ItTickets.findAll({
        where: {
            companyId: companyId
        },
        include: [
            { association: "attachments" },
            {
                association: "timeline",
                separate: true,
                order: [["createdAt", "DESC"]],
                include: [
                    {
                        association: "assignedEmployee",
                        attributes: ["id", "profilePhoto", "designation", "employeeStatus"],
                        include: [
                            {
                                association: "user",
                                attributes: ["firstName", "lastName", "email", "contact"],
                            },
                        ],
                    },
                ]
            },
            {
                association: "assignedEmployee",
                attributes: ["id", "profilePhoto", "designation", "employeeStatus"],
                include: [
                    {
                        association: "user",
                        attributes: ["firstName", "lastName", "email", "contact"]

                    },
                ],
            },
        ],
    });
}

//update ticket status
export async function updateItTicketsStatus(id: string, companyId: string, status: string, t: Transaction) {
    const updatedRows = await ItTickets.update(
        { status },
        {
            where: { id, companyId },
            transaction: t,
        },
    );
    if (!updatedRows) return null;

    const updatedTicket = await ItTickets.findOne({ where: { id, companyId }, transaction: t });
    return updatedTicket;
}

//soft delete ticket
export async function deleteItTickets(id: string, companyId: string, t: Transaction) {
    const ticket = await ItTickets.findOne({
        where: {
            id: id, companyId: companyId, isDeleted: false
        }
        ,
        transaction: t
    });
    if (!ticket) return null;

    await ItTickets.update({
        isDeleted: true
    }, {
        where: { id: id, companyId: companyId, isDeleted: false },
        transaction: t
    });
    return ticket;
}

//update itticket priority
export async function updateItTicketsPriority(
    id: string,
    companyId: string,
    priority: "Low" | "Medium" | "High",
    t: Transaction
) {
    return await ItTickets.update(
        { priority },
        {
            where: { id, companyId, isDeleted: false },
            transaction: t,
        }
    );
}


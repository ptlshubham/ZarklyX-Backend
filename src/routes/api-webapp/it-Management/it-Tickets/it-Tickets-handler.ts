
import { Op, Transaction } from "sequelize";
import { ItTickets } from "./it-Tickets-model";
import { Employee } from "../../agency/employee/employee-model";


const PRIORITY = ["Low", "Medium", "High"];
const STATUS = ["Pending", "In Progress", "Hold", "Completed", "Rejected"];

function throwValidation(msg: string): never {
    const e = new Error(msg);
    e.name = "ValidationError";
    throw e;
}
function validateEnum(value: any, validValues: string[], fieldName: string) {
    if (value && !validValues.includes(value)) {
        throwValidation(`Invalid ${fieldName}. Must be one of: ${validValues.join(", ")}`);
    }
}

export function validateItTicketsEnum(data: any) {
    validateEnum(data.priority, PRIORITY, "priority");
    validateEnum(data.status, STATUS, "status");
}
//create a new ticket
export async function createItTickets(ticketData: any, t: any) {
    if (!ticketData.subject || String(ticketData.subject).trim() === "") {
        throwValidation("Subject is required");
    }
    if (!ticketData.description || String(ticketData.description).trim() === "") {
        throwValidation("Description is required");
    }
    validateItTicketsEnum(ticketData);

    if (typeof ticketData.userType !== "string" || ticketData.userType.toLowerCase() !== "employee") {
        const e = new Error("Only employees are allowed to create it tickets.");
        e.name = "UnauthorizedError";
        throw e;
    }
    const employee = await Employee.findOne({
        where: {
            userId: ticketData.userId, companyId: ticketData.companyId, isDeleted: false
        },
        transaction: t,

    });

    if (!employee) {
        throwValidation("Employee not found.");
    }
    ticketData.employeeId = employee.id;

    ticketData.priority = ticketData.priority || "Low";
    return await ItTickets.create(ticketData, { transaction: t });
}



//get individual ticket by ticket id
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

//get all tickets by employee id
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

    if ('subject' in allowedData) {
        if (allowedData.subject === null || String(allowedData.subject).trim() === '') {
            throwValidation('Subject cannot be empty');
        }
    }

    if ('description' in allowedData) {
        if (allowedData.description === null || String(allowedData.description).trim() === '') {
            throwValidation('Description cannot be empty');
        }
    }

    if ('preferredDate' in allowedData) {
        if (allowedData.preferredDate === null) {
            allowedData.preferredDate = null;
        } else {
            if (String(allowedData.preferredDate).trim() === '') {
                throwValidation('preferredDate cannot be empty');
            }
            const pd = new Date(allowedData.preferredDate);
            if (isNaN(pd.getTime())) {
                throwValidation('Invalid preferredDate');
            }
            allowedData.preferredDate = pd;
        }
    }

    await ItTickets.update(allowedData, {
        where: {
            id: id,
            employeeId: employeeId,
            isDeleted: false,
        },
        transaction: t,
    })
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
    validateItTicketsEnum({ status });
    const updatedRows = await ItTickets.update(
        { status },
        {
            where: { id, companyId, isDeleted: false },
            transaction: t,
        },
    );
    if (updatedRows[0] === 0) return null;
    const updatedTicket = await ItTickets.findOne({ where: { id, companyId, isDeleted: false }, transaction: t });
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
    priority: string,
    t: Transaction
) {
    validateItTicketsEnum({ priority });
    const updatedRows = await ItTickets.update(
        { priority },
        {
            where: { id, companyId, isDeleted: false },
            transaction: t,
        }
    );

    if (updatedRows[0] === 0) return null;

    const updatedTicket = await ItTickets.findOne({
        where: { id, companyId },
        transaction: t
    });
    return updatedTicket;
}


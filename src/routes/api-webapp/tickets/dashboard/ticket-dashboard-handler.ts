import { Transaction, where } from "sequelize";
import { Ticket } from "../ticket/ticket-model";
import { Op } from "sequelize";
import path, { parse } from "path";
import fs from "fs";
import { Employee } from "../../agency/employee/employee-model";
import { Clients } from "../../agency/clients/clients-model";
import { TicketAssignment } from "../ticket-assignment/ticket-assignment-model";
import { User } from "../../authentication/user/user-model"
import { TicketTimeline } from "../ticket-timeline/ticket-timeline-model";
import sequelize from "sequelize";

const getWhereClauseByRole = async (userId: string, userRole: string, companyId: string, clientId?: string): Promise<any> => {
    const whereClause: any = { isDeleted: false };

    if (userRole === "superadmin") {
        return whereClause;
    }

    if (userRole === "admin") {
        whereClause.companyId = companyId;
        return whereClause;
    }

    if (userRole === "manager") {
        const employee = await Employee.findOne({
            where: { userId: userId, isDeleted: false },
            attributes: ["id"],
        });

        if (!employee) {
            return { id: { [Op.in]: [] } };
        }

        whereClause.companyId = companyId;
        whereClause.assignedManagerId = employee.id;
        return whereClause;
    }

    if (userRole === "employee") {
        const employee = await Employee.findOne({
            where: { userId: userId, isDeleted: false },
            attributes: ["id"],
        });

        if (!employee) {
            return { id: { [Op.in]: [] } };
        }

        const assignments = await TicketAssignment.findAll({
            where: { employeeId: employee.id,isActive:true,isDeleted:false },
            attributes: ["ticketId"],
        });
        const ticketIds = assignments.map(a => a.ticketId);

        if (ticketIds.length === 0) {
            return { id: { [Op.in]: [] } };
        }

        whereClause.companyId = companyId;
        whereClause.id = { [Op.in]: ticketIds };
        return whereClause;
    }

    if (userRole === "client") {
        if (!clientId) throw new Error("clientId required for client dashboard");
        whereClause.companyId = companyId;
        whereClause.clientId = clientId;
        return whereClause;
    }

    return { id: { [Op.in]: [] } };


}
export const getTicketStatsCounts = async (userId: string, userRole: string, companyId: string, clientId?: string): Promise<any> => {
    try {
        const whereClause = await getWhereClauseByRole(userId, userRole, companyId, clientId);
      
        const statusCounts = await Ticket.findAll({
            where: whereClause,
            attributes: ['overallStatus',
                [sequelize.fn("COUNT", sequelize.col("id")), "count"],

            ],
            group: ['overallStatus'],
            raw: true,
        });

        const counts: any = {
            pending: 0,
            processing: 0,
            review: 0,
            changes: 0,
            completed: 0,
            hold: 0,
        }

        statusCounts.forEach((row: any) => {
            if (row.overallStatus === "Pending") {
                counts.pending = parseInt(row.count);
            }
            if (row.overallStatus === "Processing") {
                counts.processing = parseInt(row.count);
            }
            if (row.overallStatus === "Changes") {
                counts.changes = parseInt(row.count);
            }
            if (row.overallStatus === "Review") {
                counts.review = parseInt(row.count);
            }
            if (row.overallStatus === "Completed") {
                counts.completed = parseInt(row.count);
            }
            if (row.overallStatus === "Hold") {
                counts.hold = parseInt(row.count);
            }
        })

        return {
            total: counts.pending + counts.processing + counts.completed + counts.changes + counts.review + counts.hold,
            pending: counts.pending,
            processing: counts.processing,
            completed: counts.completed,
            changes: counts.changes,
            review: counts.review,
            hold: counts.hold,
        }
    } catch (error) {
        throw error;
    }
}
export const getTicketStatsList = async (status: string, userId: string, userRole: string, companyId: string, limit: number = 10,
    offset: number = 0): Promise<any> => {
    try {
        const whereClause = await getWhereClauseByRole(userId, userRole, companyId);
        const STATUS_MAP: Record<string, string> = {
            pending: "Pending",
            processing: "Processing",
            completed: "Completed",
            changes: "Changes",
            review: "Review",
            hold: "Hold",
        };

        const normalizedStatus = STATUS_MAP[status.toLowerCase()];
        if (!normalizedStatus) {
            throw new Error("Invalid status filter");
        }

        const where = {
            ...whereClause,
            overallStatus: normalizedStatus,
        };
        if (status === "Pending") {
            whereClause.overallStatus = "Pending";
        }
        else if (status === "Processing") {
            whereClause.overallStatus = "Processing";
        }
        else if (status === "Completed") {
            whereClause.overallStatus = "Completed";
        }
        else if (status === "Changes") {
            whereClause.overallStatus = "Changes";
        }
        else if (status === "Review") {
            whereClause.overallStatus = "Review";
        }
        else if (status === "Hold") {
            whereClause.overallStatus = "Hold";
        }
      
        const { count, rows: tickets } = await Ticket.findAndCountAll({
            where: where,
            distinct: true,
            col: 'id',
            include: [
                {
                    model: Clients,
                    as: 'client',
                    attributes: ['id', 'businessName', 'email'],
                },
                {
                    model: Employee,
                    as: 'assignedManager',
                    attributes: ['id'],
                    include: [
                        {
                            model: User,
                            as: 'user',
                            attributes: ['firstName', 'lastName', 'email'],
                        }
                    ]
                },
                {
                    model: TicketAssignment,
                    as: 'assignments',
                    attributes: ['id'],
                    where: { isActive: true, isDeleted: false },
                    required:false,
                    include: [
                        {
                            model: Employee,
                            as: 'employee',
                            attributes: ['id'],
                            include: [
                                {
                                    model: User,
                                    as: 'user',
                                    attributes: ['firstName', 'lastName', 'email'],
                                }
                            ]
                        }
                    ]
                },
            ],
            limit,
            offset,
            order: [['createdAt', 'DESC']],
        });
        return { total: count, data: tickets };
    } catch (error) {
        throw error;
    }
}

export const getTicketStatsTimeline = async (userId: string, userRole: string, companyId: string, month: number, year: number): Promise<any> => {
    try {
        const whereClause = await getWhereClauseByRole(userId, userRole, companyId);
        console.log("Timeline whereClause:", JSON.stringify(whereClause));

        const firstDay = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
        const lastDay = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
        console.log("Date range:", firstDay, "to", lastDay);

        whereClause.createdAt = {
            [Op.between]: [firstDay, lastDay]
        };

        // Check total tickets in date range
        const totalInRange = await Ticket.count({ where: whereClause });
        console.log("Total tickets in date range:", totalInRange);
        const createdByDay = await Ticket.findAll({
            where: whereClause,
            attributes: [
                [sequelize.fn("DATE", sequelize.col("createdAt")), "date"],
                [sequelize.fn("COUNT", sequelize.col("id")), "count"],
            ],
            group: [sequelize.fn("DATE", sequelize.col("createdAt"))],
            order: [[sequelize.fn("DATE", sequelize.col("createdAt")), "ASC"]],
            raw: true,
        });
        console.log("Created by day:", JSON.stringify(createdByDay));

        const completedByDay = await Ticket.findAll({
            where: {
                ...whereClause,
                overallStatus: "Completed",
            },
            attributes: [
                [sequelize.fn("DATE", sequelize.col("updatedAt")), "date"],
                [sequelize.fn("COUNT", sequelize.col("id")), "count"],
            ],
            group: [sequelize.fn("DATE", sequelize.col("updatedAt"))],
            order: [[sequelize.fn("DATE", sequelize.col("updatedAt")), "ASC"]],
            raw: true,
        });
        console.log("Completed by day:", JSON.stringify(completedByDay));

        const daysInMonth = new Date(year, month, 0).getDate();
        const timeline: any[] = [];

        for (let day = 1; day <= daysInMonth; day++) {
            const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

            const created: any = createdByDay.find((d: any) => d.date === date);
            const completed: any = completedByDay.find((d: any) => d.date === date);

            timeline.push({
                date,
                created: created ? parseInt(created.count) : 0,
                completed: completed ? parseInt(completed.count) : 0,
            });
        }

        return timeline;
    } catch (error) {
        throw error;
    }
}

export const getTicketStatsPriority = async (userId: string, userRole: string, companyId: string): Promise<any> => {
    try {
        const whereClause = await getWhereClauseByRole(userId, userRole, companyId);

        const totalTickets = await Ticket.count({ where: whereClause });
        console.log("Total tickets matching whereClause:", totalTickets);

        const priorityCounts = await Ticket.findAll({
            where: whereClause,
            attributes: ["priority",
                [sequelize.fn("COUNT", sequelize.col("id")), "count"],
            ],
            group: ["priority"],
            raw: true,
        });
        console.log("Priority Counts:", JSON.stringify(priorityCounts));
        const counts: any = {
            low: 0,
            moderate: 0,
            high: 0,
        };

        priorityCounts.forEach((row: any) => {
            if (row.priority === "Low") {
                counts.low = parseInt(row.count);
            }
            if (row.priority === "Medium") {
                counts.moderate = parseInt(row.count);
            }
            if (row.priority === "High") {
                counts.high = parseInt(row.count);
            }
        });
        console.log("Final Priority Counts:", counts);
        return counts;
    }
    catch (error) {
        throw error;
    }
}


export const getTicketStatsDailyReport = async (userId: string, userRole: string, companyId: string, date: string, employeeId?: string): Promise<any> => {
    try {
        const startDate = new Date(date);
        startDate.setHours(0, 0, 0, 0);
        const endDate = new Date(date);
        endDate.setHours(23, 59, 59, 999);

        let whereClause: any = {
            overallStatus: "Completed",
            updatedAt: { [Op.between]: [startDate, endDate] },
            isDeleted: false,
            companyId: companyId,
        };


        if (userRole === "employee") {
            const employee = await Employee.findOne({
                where: { userId: userId, isDeleted: false },
                attributes: ["id"],
            });

            if (!employee) {
                return {
                    date,
                    totalCompleted: 0,
                    tickets: [],
                    byEmployee: [],
                };
            }

            const assignments = await TicketAssignment.findAll({
                where: { employeeId: employee.id,isActive:true,isDeleted:false },
                attributes: ["ticketId"],
            });
            const ticketIds = assignments.map(a => a.ticketId);

            if (ticketIds.length === 0) {
                return {
                    date,
                    totalCompleted: 0,
                    tickets: [],
                    byEmployee: [],
                };
            }

            whereClause.id = { [Op.in]: ticketIds };

        }
        else if (userRole === "manager") {
            if (employeeId) {
                const assignments = await TicketAssignment.findAll({
                    where: { employeeId,isActive:true,isDeleted:false },
                    attributes: ["ticketId"],
                });
                const ticketIds = assignments.map(a => a.ticketId);
                whereClause.id = { [Op.in]: ticketIds };
            } else {
                const employee = await Employee.findOne({
                    where: { userId: userId, isDeleted: false },
                    attributes: ["id"],
                });

                if (!employee) {
                    return {
                        date,
                        totalCompleted: 0,
                        tickets: [],
                        byEmployee: [],
                    };
                }

                whereClause.assignedManagerId = employee.id;
            }
        } else if (userRole === "admin") {
            whereClause.companyId = companyId;
        } else if (userRole === "client") {
            whereClause.clientId = userId;
        }
        else if (userRole === "superadmin") {
        }
        const completedTickets = await Ticket.findAll({
            where: whereClause,
            include: [
                {
                    model: Clients,
                    as: "client",
                    attributes: ["id", "businessName"],
                },
                {
                    model: Employee,
                    as: 'assignedManager',
                    attributes: ['id'],
                    include: [
                        {
                            model: User,
                            as: 'user',
                            attributes: ['firstName', 'lastName', 'email'],
                        }
                    ],
                },
                {
                    model: TicketAssignment,
                    as: 'assignments',
                    attributes: ['id'],
                    include: [
                        {
                            model: Employee,
                            as: 'employee',
                            attributes: ['id'],
                            include: [
                                {
                                    model: User,
                                    as: 'user',
                                    attributes: ['firstName', 'lastName', 'email'],
                                }
                            ]
                        }
                    ]
                },
            ],
            order: [["updatedAt", "DESC"]],
        });

        let byEmployee: any = {};
        if (userRole === "manager" || userRole === "admin") {
            completedTickets.forEach((ticket: any) => {
                ticket.assignments?.forEach((assign: any) => {
                    const empId = assign.employee.id;
                    const empName = `${assign.employee.user.firstName} ${assign.employee.user.lastName}`;

                    if (!byEmployee[empId]) {
                        byEmployee[empId] = {
                            employeeId: empId,
                            employeeName: empName,
                            completedCount: 0,
                            tickets: [],
                        };
                    }

                    byEmployee[empId].completedCount++;
                    byEmployee[empId].tickets.push(ticket);
                });
            });
        }
        return {
            date,
            totalCompleted: completedTickets.length,
            tickets: completedTickets,
            byEmployee: Object.values(byEmployee),
        }
    }
    catch (error) {
        throw error;
    }
}

export const getAverageCompletionTime = async (userId: string, userRole: string, companyId: string, start: Date, end: Date, excludeHold: boolean): Promise<any> => {
    try {
        const whereClause = await getWhereClauseByRole(userId, userRole, companyId);

        const completedTickets = await TicketTimeline.findAll({
            where: {
                changeType: "status",
                newValue: "Completed",
                createdAt: { [Op.between]: [start, end] },
            },
            attributes: ["ticketId", "createdAt"],
            raw: true,
        });
        if (!completedTickets || completedTickets.length === 0) {
            return { avgMs: 0, avgDisplay: "0 hrs : 0 mins : 0 secs", count: 0 };
        }
        const ticketIds = completedTickets.map((t: any) => t.ticketId);
        const tickets = await Ticket.findAll({
            where: { id: { [Op.in]: ticketIds }, ...whereClause },
            attributes: ["id", "createdAt"],
            raw: true,
        });
        const ticketMap = new Map(tickets.map((t: any) => [t.id, t.createdAt]));

        if (!tickets || tickets.length === 0) {
            return { avgMs: 0, avgDisplay: "0 hrs : 0 mins : 0 secs", count: 0 };
        }

        let totalMs = 0;
        let counted = 0;

        if (excludeHold) {
            const ticketCreatedTimes = tickets.map((t: any) => new Date(t.createdAt).getTime());
            const completedTimes = completedTickets.map((c: any) => new Date(c.createdAt).getTime());
            const minCreated = new Date(Math.min(...ticketCreatedTimes));
            const maxCompleted = new Date(Math.max(...completedTimes));

            const allTimelines = await TicketTimeline.findAll({
                where: {
                    ticketId: { [Op.in]: ticketIds },
                    changeType: "status",
                    createdAt: { [Op.between]: [minCreated, maxCompleted] },
                },
                order: [["createdAt", "ASC"]],
                attributes: ["ticketId", "createdAt", "oldValue", "newValue"],
                raw: true,
            });

            const timelineMap = new Map<string, any[]>();
            for (const r of allTimelines) {
                if (!timelineMap.has(r.ticketId)) timelineMap.set(r.ticketId, []);
                timelineMap.get(r.ticketId)!.push(r);
            }

            for (const ev of completedTickets) {
                const ticketCreated = ticketMap.get(ev.ticketId);
                if (!ticketCreated) continue;

                const completedAt = new Date(ev.createdAt);
                const createdAt = new Date(ticketCreated);
                let baseMs = Math.max(0, completedAt.getTime() - createdAt.getTime());

                const rows = (timelineMap.get(ev.ticketId) || []).filter((r: any) => {
                    const t = new Date(r.createdAt);
                    return t >= createdAt && t <= completedAt;
                });

                let holdMs = 0;
                let holdStart: Date | null = null;
                for (const r of rows) {
                    const when = new Date(r.createdAt);
                    if (r.newValue === "Hold") {
                        holdStart = when;
                    } else {
                        if (holdStart) {
                            holdMs += Math.max(0, when.getTime() - holdStart.getTime());
                            holdStart = null;
                        }
                    }
                }
                if (holdStart) {
                    holdMs += Math.max(0, completedAt.getTime() - holdStart.getTime());
                }

                const effectiveMs = Math.max(0, baseMs - holdMs);
                totalMs += effectiveMs;
                counted++;
            }
        } else {
            for (const ev of completedTickets) {
                const ticketCreated = ticketMap.get(ev.ticketId);
                if (!ticketCreated) continue;
                const completedAt = new Date(ev.createdAt);
                const createdAt = new Date(ticketCreated);
                let baseMs = Math.max(0, completedAt.getTime() - createdAt.getTime());
                totalMs += baseMs;
                counted++;
            }
        }
        const avgMs = counted === 0 ? 0 : Math.round(totalMs / counted);

        const hours = Math.floor(avgMs / (1000 * 60 * 60));
        const mins = Math.floor((avgMs % (1000 * 60 * 60)) / (1000 * 60));
        const secs = Math.floor((avgMs % (1000 * 60)) / 1000);
        const avgDisplay = `${hours} hrs : ${mins} mins : ${secs} secs`;

        return { avgMs, avgDisplay, count: counted };

    }
    catch (error) {
        throw error;
    }
}
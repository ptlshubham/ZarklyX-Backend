import { Transaction } from "sequelize";
import { Ticket } from "../ticket/ticket-model";
import { Op } from "sequelize";
import { TicketTimeline } from "./ticket-timeline-model";
import path from "path";
import fs from "fs";

export interface CreateTimelineEntryPayload {
    ticketId: string;
    changedBy: string; // Employee or Manager ID
    changeType: "status" | "priority" | "handover_assign" | "handover_revert" | "handover_cancel" | "handover_accept";
    oldValue: string | null;
    newValue: string;
}

const isValidChangeType = (value: any): value is "status" | "priority" | "handover_assign" | "handover_revert" | "handover_cancel" | "handover_accept" => {
    return ["status", "priority", "handover_assign", "handover_revert", "handover_cancel", "handover_accept"].includes(value);
};

export const createTicketTimeline = async (
    payload: CreateTimelineEntryPayload,
    t: Transaction
): Promise<TicketTimeline> => {

    try {
        const ticket = await Ticket.findByPk(payload.ticketId, { transaction: t });
        if (!ticket) {
            throw new Error("Ticket not found");
        }

        if (!isValidChangeType(payload.changeType)) {
            throw new Error("Invalid changeType value");
        }

        const timelineEntry = await TicketTimeline.create(
            {
                ticketId: payload.ticketId,
                changedBy: payload.changedBy,
                changeType: payload.changeType,
                oldValue: payload.oldValue,
                newValue: payload.newValue,
            },
            { transaction: t }
        );
        return timelineEntry;
    } catch (error) {
        throw error;
    }
};

export const getTimelineByTicketId = async (
    ticketId: string
): Promise<TicketTimeline[]> => {
    try {
        const timelineEntries = await TicketTimeline.findAll({  
            where: { ticketId },
            order: [['createdAt', 'ASC']],
        });
        return timelineEntries;
    }
    catch (error) {
        throw error;
    }
};


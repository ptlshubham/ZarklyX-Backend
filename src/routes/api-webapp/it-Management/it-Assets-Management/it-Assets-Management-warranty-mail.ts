import { sendEmail } from "../../../../services/mailService";
import { formatDate } from "../../../../utils/helper";

export type ReminderMailType =
    | 'DAYS_30'
    | 'DAYS_15'
    | 'DAILY'
    | 'EXPIRED';


export async function sendWarrantyEmail(email: string,
    userName: string,
    asset: any,
    type: ReminderMailType) {
    const mailData = buildWarrantyMailData(email, userName, asset, type);
    // await sendEmail(mailData);
    console.log("[WARRANTY EMAIL]", mailData);

}

export function buildWarrantyMailData(email:string, userName:string, asset: any, type: ReminderMailType) {
    const daysLeftMap = {
        DAYS_30: 30,
        DAYS_15: 15,
        DAILY: 7,
        EXPIRED: 0
    }
    return {
        from: "" as any,
        to: email,
        subject: buildWarrantyMailSubject(asset, type),
        htmlFile: "warranty-reminder",
        replacements: {
            emailTitle: "ZarklyX Warranty Renewal Reminder",
            userName: userName  || "User",
            assetName: asset.assetName,
            expiryDate: formatDate( asset.warrantyEndDate),
            expiryLabel: "warranty",
            daysLeft: daysLeftMap[type],
            isExpired: type === "EXPIRED",
            currentYear: new Date().getFullYear(),
        },
        html: null,
        text: "",
        attachments: null,
        cc: null,
        replyTo: null,
    };
};


export function buildWarrantyMailSubject(asset: any, type: ReminderMailType) {
    switch (type) {
        case 'DAYS_30':
            return `Warranty expiring in 30 days-${asset.assetName}`;
        case 'DAYS_15':
            return `Warranty expiring in 15 days-${asset.assetName}`;
        case `DAILY`:
            return `Warranty expiring soon-${asset.assetName}`;
        case `EXPIRED`:
            return `Warranty expired-${asset.assetName}`;
    }
}

export async function sendServiceExpiryEmail(email: string,
    userName: string,
    asset: any,
    type: ReminderMailType) {
    const mailData = buildServiceExpiryMailData(email, userName, asset, type);
    // await sendEmail(mailData);
    console.log("[SERVICE EXPIRY EMAIL]", mailData);

}

export function buildServiceExpiryMailData(email:string, userName:string, asset: any, type: ReminderMailType) {
    const daysLeftMap = {
        DAYS_30: 30,
        DAYS_15: 15,
        DAILY: 7,
        EXPIRED: 0
    }
    return {
        from: "" as any,
        to: email,
        subject: buildServiceExpiryMailSubject(asset, type),
        htmlFile: "warranty-reminder",
        replacements: {
            emailTitle: "ZarklyX Service Expiry Reminder",
            userName: userName  || "User",
            assetName: asset.assetName,
            expiryDate: formatDate(asset.endDate),
            expiryLabel: "service",
            daysLeft: daysLeftMap[type],
            isExpired: type === "EXPIRED",
            currentYear: new Date().getFullYear(),
        },
        html: null,
        text: "",
        attachments: null,
        cc: null,
        replyTo: null,
    };
};


export function buildServiceExpiryMailSubject(asset: any, type: ReminderMailType) {
    switch (type) {
        case 'DAYS_30':
            return `Service  expiring in 30 days-${asset.assetName}`;
        case 'DAYS_15':
            return `Service  expiring in 15 days-${asset.assetName}`;
        case `DAILY`:
            return `Service  expiring soon-${asset.assetName}`;
        case `EXPIRED`:
            return `Service  expired-${asset.assetName}`;
    }
}
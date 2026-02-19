import { sendEmail } from "../../../../services/mailService";
import { formatDate } from "../../../../utils/helper";

export type ReminderMailType =
    | 'DAYS_30'
    | 'DAYS_15'
    | 'DAILY'
    | 'EXPIRED';


export async function sendWarrantyEmail(email: string,
    userName: string,
    companyName: string,
    companyEmail: string | null,
    isCompanyAsset: boolean,
    asset: any,
    type: ReminderMailType) {
    const mailData = buildWarrantyMailData(email, userName, companyName, companyEmail, isCompanyAsset, asset, type);
    // await sendEmail(mailData);
    console.log("[WARRANTY EMAIL]", mailData);

}

export function buildWarrantyMailData(
    email: string,
    userName: string,
    companyName: string,
    companyEmail: string | null,
    isCompanyAsset: boolean,
    asset: any,
    type: ReminderMailType
) {
    const daysLeftMap = {
        DAYS_30: 30,
        DAYS_15: 15,
        DAILY: 7,
        EXPIRED: 0
    }

    const statusMap = {
        DAYS_30: "Expiring Soon",
        DAYS_15: "Action Required",
        DAILY: "Urgent - Expiring Very Soon",
        EXPIRED: "Expired"
    }

    const statusMessageMap = {
        DAYS_30: "Your asset warranty will expire in 30 days. Please plan for renewal or extension.",
        DAYS_15: "Your asset warranty will expire in 15 days. Immediate action recommended.",
        DAILY: "Your asset warranty is expiring within a week. Please renew immediately to avoid service interruption.",
        EXPIRED: "Your asset warranty has expired. Please contact us to renew and restore coverage."
    }

    const mail: any = {
        from: companyEmail || "" as any,
        to: email,
        subject: buildWarrantyMailSubject(asset, type),
        htmlFile: "it_asset_warranty_ reminder_email",
        replacements: {
            ClientName: userName || "User",
            CompanyName: companyName || "ZarklyX",
            AssetName: asset.assetName,
            WarrantyEndDate: formatDate(asset.warrantyEndDate),
            DaysLeft: daysLeftMap[type],
            WarrantyStatus: statusMap[type],
            StatusMessage: statusMessageMap[type],
            isCompanyAsset: isCompanyAsset,
            currentYear: new Date().getFullYear(),
        },
        html: null,
        attachments: null,
        text: "",
    };

    if (!isCompanyAsset && companyEmail) {
        mail.cc = companyEmail;
        mail.replyTo = companyEmail;
    }

    return mail;
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
    companyName: string,
    companyEmail: string | null,
    isCompanyAsset: boolean,
    asset: any,
    type: ReminderMailType) {
    const mailData = buildServiceExpiryMailData(email, userName, companyName, companyEmail, isCompanyAsset, asset, type);
    // await sendEmail(mailData);
    console.log("[SERVICE EXPIRY EMAIL]", mailData);

}

export function buildServiceExpiryMailData(
    email: string,
    userName: string,
    companyName: string,
    companyEmail: string | null,
    isCompanyAsset: boolean,
    asset: any,
    type: ReminderMailType
) {
    const daysLeftMap = {
        DAYS_30: 30,
        DAYS_15: 15,
        DAILY: 7,
        EXPIRED: 0
    }

    const statusMap = {
        DAYS_30: "Expiring Soon",
        DAYS_15: "Action Required",
        DAILY: "Urgent - Expiring Very Soon",
        EXPIRED: "Expired"
    }

    const statusMessageMap = {
        DAYS_30: "Your service subscription will expire in 30 days. Please plan for renewal to maintain uninterrupted service.",
        DAYS_15: "Your service subscription will expire in 15 days. Immediate action recommended.",
        DAILY: "Your service subscription is expiring within a week. Please renew immediately to avoid service interruption.",
        EXPIRED: "Your service subscription has expired. Please contact us to renew and restore access."
    }

    const mail: any = {
        from: companyEmail || "" as any,
        to: email,
        subject: buildServiceExpiryMailSubject(asset, type),
        htmlFile: "Service_Expiry_Subscription_Reminder_Email",
        replacements: {
            ClientName: userName || "User",
            CompanyName: companyName || "ZarklyX",
            ServiceName: asset.assetName,
            ServiceEndDate: formatDate(asset.endDate),
            DaysLeft: daysLeftMap[type],
            ServiceStatus: statusMap[type],
            StatusMessage: statusMessageMap[type],
            isCompanyAsset: isCompanyAsset,
            currentYear: new Date().getFullYear(),
        },
        html: null,
        attachments: null,
        text: "",
    };

    if (!isCompanyAsset && companyEmail) {
        mail.cc = companyEmail;
        mail.replyTo = companyEmail;
    }

    return mail;
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
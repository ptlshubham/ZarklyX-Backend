import { Op } from "sequelize";
import { Company } from "../../company/company-model";
import { Clients } from "../../agency/clients/clients-model";
import { ItAssetsManagement } from "./it-Assets-Management-model";
import {
  sendWarrantyEmail,
  ReminderMailType,
  sendServiceExpiryEmail,
} from "./it-Assets-Management-warranty-mail";
import { infoLog, warningLog, errorLog } from "../../../../services/logging-service";

export async function runAssetExpiryReminder() {
  infoLog(`[Asset expiry] Started at ${new Date().toISOString()}`);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const assets = await ItAssetsManagement.findAll({
    where: {
      isDeleted: false,
      renewalReminderDate: {
        [Op.lte]: today
      }
    },
    include: [
      {
        model: Company,
        as: "company",
        attributes: ["email", "name"]
      },
      {
        model: Clients,
        as: "client",
        attributes: ["businessEmail", "email", "businessName", "clientfirstName"]
      }
    ]
  });

  for (const asset of assets) {
    try {
    const expiryDate = asset.assetType === "Product" ? asset.warrantyEndDate : asset.endDate;
    if (!expiryDate) {
      continue;
    }
    const expiry = new Date(expiryDate);
    expiry.setHours(0, 0, 0, 0);

    const diffMs = expiry.getTime() - today.getTime();
    const daysLeft = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

    let reminderType: ReminderMailType | null = null;

    if (daysLeft === 30) reminderType = "DAYS_30";
    else if (daysLeft === 15) reminderType = "DAYS_15";
    else if (daysLeft <= 7 && daysLeft >= 0) reminderType = "DAILY";
    else if (daysLeft < 0) reminderType = "EXPIRED";
    else continue;

    if (asset.lastReminderSentAt) {
      const lastSent = new Date(asset.lastReminderSentAt);
      lastSent.setHours(0, 0, 0, 0);

      if (lastSent.getTime() === today.getTime()) {
        continue;
      }
    }

    const company = (asset as any).company;
    const client = (asset as any).client;

    let email: string | null = null;
    let userName = "Customer";
    let companyName = company?.name ?? "";
    let companyEmail = company?.email ?? null;
    let isCompanyAsset = false;

    if (asset.clientId && client) {
      email = client.businessEmail || client.email || null;
      userName = client.businessName || client.clientfirstName || "Customer";
      isCompanyAsset = false;
    }
    else if (asset.companyId && company) {
      email = company.email || null;
      userName = "Team"; 
      isCompanyAsset = true;
    }

    if (!email) {
      warningLog(`[Asset expiry CRON] No recipient email found ${JSON.stringify({ assetId: asset.id, companyId: asset.companyId, clientId: asset.clientId })}`);
      continue;
    }


    if (asset.assetType == "Product") {
      await sendWarrantyEmail(
        email,
        userName,
        companyName,
        companyEmail,
        isCompanyAsset,
        asset,
        reminderType
      );
    }else if(asset.assetType=="Service"){
      await sendServiceExpiryEmail(
        email,
        userName,
        companyName,
        companyEmail,
        isCompanyAsset,
        asset,
        reminderType
      );
    }


    const updateData: any = {
      lastReminderSentAt: new Date()
    };

    if (reminderType === "EXPIRED") {
      updateData.isRenewalReminderSent = true;
    }

    await asset.update(updateData);

    infoLog(`[Asset expiry UPDATED] ${JSON.stringify({ assetId: asset.id, reminderType, email })}`);
  } catch (error) {
    errorLog(`[Asset expiry CRON] Error processing asset ${asset.id} - ${String(error)}`);
    continue; 
  }
  }

  infoLog("[Asset expiry CRON] Finished");
}

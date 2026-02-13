import { Op } from "sequelize";
import { Company } from "../../company/company-model";
import { Clients } from "../../agency/clients/clients-model";
import { ItAssetsManagement } from "./it-Assets-Management-model";
import {
  sendWarrantyEmail,
  ReminderMailType,
  sendServiceExpiryEmail,
} from "./it-Assets-Management-warranty-mail";

export async function runAssetExpiryReminder() {
  console.log("[Asset expiry] Started at", new Date().toISOString());

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Fetch eligible assets based on reminder date
  const assets = await ItAssetsManagement.findAll({
    where: {
      isDeleted: false,
      renewalReminderDate: {
        [Op.lte]: today
      }
    }
  });

  console.log("[Asset expiry] Assets fetched:", assets.length);

  // Process each asset
  for (const asset of assets) {
    // Determine expiry date based on asset type
    const expiryDate = asset.assetType === "Product" ? asset.warrantyEndDate : asset.endDate;
    if (!expiryDate) {
      console.log("[Asset expiry CRON] No expiry date found, skipping", asset.id);
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

    // Prevent duplicate reminder on same day
    if (asset.lastReminderSentAt) {
      const lastSent = new Date(asset.lastReminderSentAt);
      lastSent.setHours(0, 0, 0, 0);

      if (lastSent.getTime() === today.getTime()) {
        console.log("[ASSET EXPIRY CRON] Already sent today, skipping", asset.id);
        continue;
      }
    }

    // Resolve recipient (BUSINESS CONTACT)
    let email: string | null = null;
    let userName = "User";

    if (asset.clientId) {
      const client = await Clients.findByPk(asset.clientId, {
        attributes: ["businessEmail", "email", "clientfirstName"]
      });

      email = client?.businessEmail || client?.email || null;
      userName = client?.clientfirstName ?? "Client";
    }

    else if (asset.companyId) {
      const company = await Company.findByPk(asset.companyId, {
        attributes: ["email", "name"]
      });

      email = company?.email || null;
      userName = company?.name ?? "Company";
    }
    if (!email) {
      console.warn("[Asset expiry CRON] No recipient email found", {
        assetId: asset.id,
        companyId: asset.companyId,
        clientId: asset.clientId
      });
      continue;
    }


    if (asset.assetType == "Product") {
      await sendWarrantyEmail(
        email,
        userName,
        asset,
        reminderType
      );
    }else if(asset.assetType=="Service"){
      await sendServiceExpiryEmail(
        email,
        userName,
        asset,
        reminderType
      );
    }

    // Update asset
    // await asset.update({
    //   lastReminderSentAt: new Date(),
    //   isRenewalReminderSent: true
    // });

    await asset.update({
      lastReminderSentAt: new Date(),

    });
    if (reminderType === "EXPIRED") {
      await asset.update({
        isRenewalReminderSent: true
      });
    }

    console.log("[Asset expiry UPDATED]", {
      assetId: asset.id,
      reminderType,
      email
    });
  }

  console.log("[Asset expiry CRON] Finished");
}

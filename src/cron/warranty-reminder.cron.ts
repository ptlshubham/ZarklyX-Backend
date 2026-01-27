import cron from "node-cron";
import { runAssetExpiryReminder } from "../routes/api-webapp/it-Management/it-Assets-Management/it-Assets-Management-warranty-cron";

// Run daily at 9:00 AM
cron.schedule("0 9 * * *", async () => {
  console.log("[CRON] Running daily warranty reminder at", new Date().toISOString());
  try {
    await runAssetExpiryReminder();
  } catch (error) {
    console.error("[CRON ERROR] Warranty reminder failed:", error);
  }
});

console.log("[CRON] Warranty reminder scheduled: Daily at 9:00 AM");
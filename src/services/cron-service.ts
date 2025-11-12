import cron from "node-cron";
import { ConsoleSpinner } from "./console-info";
import { addNewFNYear, evPendingReminder, evPickReminder, paymentsCallBack, 
    renewalReminder, settleRazorpayPayments, testCronJob } from "../routes/cron-job/cron-job-handler";

const cronTimings = {
  // everyDayAt5pm: "0 17 * * *",
  everyDayAt6AM: "0 6 * * *",
  everyDayAt9AM: "0 9 * * *",
  every1stAprilAt6AM: "0 6 1 4 *",
  everyMinute: "* * * * *",
} as const;

export class Cronjob {
  static startAll() {
    this.paymentSettlementCron();
    this.renewalReminderCron();
    this.evPickReminderCron();
    this.evPendingPickReminderCron();
    this.fnYearCron();
    // this.testCron();
  }

  private static paymentSettlementCron(): void {
    ConsoleSpinner.success("Ride-it payment settlement cron-job scheduled every day at 6am");
    cron.schedule(cronTimings.everyDayAt6AM, () => {
      settleRazorpayPayments();      
      paymentsCallBack();
    });
  };

  private static renewalReminderCron(): void {
    ConsoleSpinner.success("Renewal reminder cron-job scheduled every day at 9AM");
    cron.schedule(cronTimings.everyDayAt9AM, () => {
      renewalReminder();
    });
  };

  private static evPickReminderCron(): void {
    ConsoleSpinner.success("EV pick-up reminder cron-job scheduled every day at 9AM");
    cron.schedule(cronTimings.everyDayAt9AM, () => {
      evPickReminder();
    });
  };

  private static evPendingPickReminderCron(): void {
    ConsoleSpinner.success("Pending EV pick-up reminder cron-job scheduled every day at 9AM");
    cron.schedule(cronTimings.everyDayAt6AM, () => {
      evPendingReminder();
    });
  };

  private static fnYearCron(): void {
    ConsoleSpinner.success("FN Year cron-job scheduled every year on April 1st at 6AM");
    cron.schedule(cronTimings.every1stAprilAt6AM, () => {
      addNewFNYear();
    });
  };

  private static testCron(): void {
    ConsoleSpinner.success("Test cron-job");
    cron.schedule(cronTimings.everyMinute, () => {
      testCronJob();
    });
  };

}

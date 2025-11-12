import { BaseLogger } from "./base-logger";

class CronLoggerClass extends BaseLogger {
  constructor(filename: string) {
    super(filename, 'error');
  }

  write(data: any) {    
    this.logger.info(`[${new Date().toLocaleString()}]  ${JSON.stringify(data)}`);
  }
}
 
const CronLogger = new CronLoggerClass("cron.log");
export default CronLogger;

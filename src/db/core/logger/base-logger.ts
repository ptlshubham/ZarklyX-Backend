import {  Logger, createLogger, format } from "winston";
import { ROOT_FOLDER } from "../../core/utils/fs-helpers.util";
import  DailyRotateFile from 'winston-daily-rotate-file';
const { timestamp, prettyPrint, json } = format;

type LevelType = "error" | "info";

export class BaseLogger {
  logger!: Logger;
  constructor(filename: string, level?: LevelType) {
    this.createLogger(filename, level);
  }

  private createLogger(filename: string, level: LevelType = "error") {
    const transport: DailyRotateFile = new DailyRotateFile({
      filename: `${ROOT_FOLDER}/logs/${filename}-%DATE%.log`,
      maxSize: '20m',
      maxFiles: '7d'
    });


    this.logger = createLogger({
      level,
      format: format.combine(json(), prettyPrint(), timestamp()),
      transports: [transport],
    });
  }
}

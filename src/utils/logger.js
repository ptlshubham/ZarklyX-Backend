const winston = require("winston");

const logger = winston.createLogger({
  level: "info", // Log only messages of level 'info' and above
  format: winston.format.combine(
    winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    winston.format.colorize(),
    winston.format.printf(({ timestamp, level, message }) => {
      return `[${timestamp}] ${level}: ${message}`;
    })
  ),
  transports: [
    new winston.transports.Console(),
    // In production, you might want to add a transport to log to a file
    // new winston.transports.File({ filename: 'error.log', level: 'error' }),
  ],
});

module.exports = logger;

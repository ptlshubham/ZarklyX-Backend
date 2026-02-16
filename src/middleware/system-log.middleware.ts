import { Request, Response, NextFunction } from "express";
import { SystemLog } from "../routes/api-webapp/system log/system-log-model";

type SystemLogConfig = {
  module: string;
  operation: string;
  action: string;
  metadata?: object;
};

export function systemLog(config: SystemLogConfig) {
  return (req: Request, res: Response, next: NextFunction) => {

    res.on("finish", async () => {
      try {
        const user = (req as any).user;

        if (!user?.id || !user?.companyId) {
          return;
        }

        await SystemLog.create({
          companyId: user.companyId,
          userId: user.id,

          module: config.module,
          operation: config.operation,
          action: config.action,

          status: res.statusCode < 400 ? "SUCCESS" : "FAILED",

          requestMethod: req.method,
          requestPath: req.originalUrl,

          ipAddress: (req.headers["x-forwarded-for"] as string)?.split(",")[0] || req.ip || null,
          userAgent: req.headers["user-agent"] || null,

          metadata: res.statusCode < 400 ? config.metadata || (req as any).metadata || null : null,
          errorMessage:
            res.statusCode >= 400
              ? res.statusMessage || "Request failed"
              : null,

          createdAt: new Date(),
        });
      } catch (error) {
        console.error("System log insert failed:", error);
      }
    });

    next();
  };
}

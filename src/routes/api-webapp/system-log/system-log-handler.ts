import { SystemLog } from "./system-log-model";

type GetSystemLogsParams = {
  companyId: string;
  module?: string;
  userId?: string;
  limit: number;
  offset: number;
};

export const getSystemLogs = async ({
  companyId,
  module,
  userId,
  limit,
  offset,
}: GetSystemLogsParams) => {
  const where: any = { companyId };

  if (module) {
    where.module = module;
  }

  if (userId) {
    where.userId = userId;
  }

  return await SystemLog.findAndCountAll({
    where,
    order: [["createdAt", "DESC"]],
    limit,
    offset,
  });
};

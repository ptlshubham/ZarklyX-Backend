import { Notification } from "./notification-model";

export const createNotification = async (payload: any) => {
  return await Notification.create(payload);
};

export const getUserNotifications = async (userId: number) => {
  return await Notification.findAll({
    where: { customerId: userId, isDeleted: false },
    order: [["createdAt", "DESC"]],
  });
};

export const markAllAsRead = async (userId: number) => {
  return await Notification.update(
    { readNotification: true },
    { where: { customerId: userId, readNotification: false } }
  );
};

export const deleteAllNotifications = async (userId: number) => {
  return await Notification.update(
    { deleteNotification: true },
    { where: { customerId: userId } }
  );
};
import express from "express";
import { createNotification, deleteAllNotifications, getUserNotifications, markAllAsRead } from "./notification-handler";
import { tokenMiddleWare } from "../../../services/jwtToken-service";
import { sendEncryptedResponse } from "../../../services/encryptResponse-service";
import {
  alreadyExist,
  serverError,
  unauthorized,
} from "../../../utils/responseHandler";
const router = express.Router();

router.get("/my-notifications", tokenMiddleWare, async (req: any, res) => {
  try {
    const data = await getUserNotifications(req.user.id);
    sendEncryptedResponse(res, data, "User notifications fetched");
  } catch (error) {
    serverError(res, (error as Error).message || "An unexpected error occurred");
  }
});

router.post("/mark-all-read", tokenMiddleWare, async (req: any, res) => {
  try {
    await markAllAsRead(req.user.id);
    sendEncryptedResponse(res, {}, "All notifications marked as read");
  } catch (error) {
    serverError(res, (error as Error).message || "An unexpected error occurred");
  }
});

router.post("/clear-all", tokenMiddleWare, async (req: any, res) => {
  try {
    await deleteAllNotifications(req.user.id);
    sendEncryptedResponse(res, {}, "All notifications cleared");
  } catch (error) {
    serverError(res, (error as Error).message || "An unexpected error occurred");
  }
});

module.exports = router;

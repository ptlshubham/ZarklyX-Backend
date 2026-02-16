import express from "express";
import asyncHandler from "express-async-handler";
import { serverError } from "../../../utils/responseHandler";
import { getSystemLogs } from "./system-log-handler";
import { authMiddleware } from "../../../middleware/auth.middleware";

const router = express.Router();

// GET system logs 
router.get(
  "/getSystemLogs",
  authMiddleware,
  asyncHandler( async (req, res) => {
    try {
    
      const companyId = req.user?.companyId;
 
      if (!companyId) {
         res.status(400).json({ success: false, message: "companyId is required" });
         return;
      }

      const page = Number(req.query.page) || 1;
      const limit = Number(req.query.limit) || 20;
      const offset = (page - 1) * limit;

      const module =
        typeof req.query.module === "string"
          ? req.query.module
          : undefined;

      const userId =
        typeof req.query.userId === "string"
          ? req.query.userId
          : undefined;

      const { rows, count } = await getSystemLogs({
        companyId,
        module,
        userId,
        limit,
        offset,
      });

      res.status(200).json({
        success: true,
        message: "System logs retrieved successfully",
        data: rows,
        meta: {
          total: count,
          page,
          limit,
        },
      });
    } catch (error) {
      console.error("Get system logs error:", error);
      serverError(res, "Something went wrong while fetching system logs.");
    }
  })
);

export default router;

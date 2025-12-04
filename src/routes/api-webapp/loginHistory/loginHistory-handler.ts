import { Request, Response } from "express";
import { LoginHistory } from "./loginHistory-model";
import {
  getUserLoginHistory,
  getUserActiveSessions,
  updateLogoutTime,
} from "../../../services/loginHistory-service";

/**
 * Get user login history
 */
export const getLoginHistory = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const userId = req.params.userId;
    const limit = req.query.limit ? parseInt(req.query.limit as string) : 20;
    const page = req.query.page ? parseInt(req.query.page as string) : 1;
    const offset = (page - 1) * limit;

    if (!userId) {
      res.status(400).json({
        success: false,
        message: "userId is required",
      });
      return;
    }

    const result = await getUserLoginHistory(userId, limit, offset);

    if (!result.success) {
      res.status(500).json({
        success: false,
        message: result.error instanceof Error ? result.error.message : "Failed to fetch login history",
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: "Login history fetched successfully",
      data: result.data,
      pagination: {
        total: result.count || 0,
        limit,
        page,
        totalPages: Math.ceil((result.count || 0) / limit),
      },
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error?.message || "Failed to fetch login history",
    });
  }
};

/**
 * Get active sessions for a user
 */
export const getActiveSessions = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const userId = req.params.userId;

    if (!userId) {
      res.status(400).json({
        success: false,
        message: "userId is required",
      });
      return;
    }

    const result = await getUserActiveSessions(userId);

    if (!result.success) {
      res.status(500).json({
        success: false,
        message: result.error instanceof Error ? result.error.message : "Failed to fetch active sessions",
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: "Active sessions fetched successfully",
      data: result.data,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error?.message || "Failed to fetch active sessions",
    });
  }
};

/**
 * Logout from a session
 */
export const logoutSession = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { sessionId } = req.body;

    if (!sessionId) {
      res.status(400).json({
        success: false,
        message: "sessionId is required",
      });
      return;
    }

    const result = await updateLogoutTime(sessionId);

    if (!result.success) {
      res.status(404).json({
        success: false,
        message: "Session not found",
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: "Logged out successfully",
      data: result.data,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error?.message || "Failed to logout",
    });
  }
};

/**
 * Logout all sessions for a user
 */
export const logoutAllSessions = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const userId = req.params.userId;

    if (!userId) {
      res.status(400).json({
        success: false,
        message: "userId is required",
      });
      return;
    }

    await LoginHistory.update(
      { logoutTime: new Date() },
      {
        where: {
          userId,
          logoutTime: null,
          status: "SUCCESS",
        },
      }
    );

    res.status(200).json({
      success: true,
      message: "All sessions logged out successfully",
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error?.message || "Failed to logout all sessions",
    });
  }
};

/**
 * Delete a login history record (admin only)
 */
export const deleteLoginHistory = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { id } = req.params;

    if (!id) {
      res.status(400).json({
        success: false,
        message: "Login history ID is required",
      });
      return;
    }

    const loginHistory = await LoginHistory.findByPk(id);

    if (!loginHistory) {
      res.status(404).json({
        success: false,
        message: "Login history record not found",
      });
      return;
    }

    await loginHistory.destroy();

    res.status(200).json({
      success: true,
      message: "Login history record deleted successfully",
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      message: error?.message || "Failed to delete login history",
    });
  }
};

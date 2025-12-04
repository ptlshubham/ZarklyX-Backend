import express, { Request, Response, Router } from "express";
import {
  getLoginHistory,
  getActiveSessions,
  logoutSession,
  logoutAllSessions,
  deleteLoginHistory,
} from "./loginHistory-handler";
import { authMiddleware } from "../../../middleware/auth.middleware";

const router: Router = express.Router();

/**
 * @route   GET /login-history/:userId
 * @desc    Get login history for a user
 * @access  Private
 */
router.get("/:userId", authMiddleware, getLoginHistory);

/**
 * @route   GET /login-history/:userId/active-sessions
 * @desc    Get active sessions for a user
 * @access  Private
 */
router.get("/:userId/active-sessions", authMiddleware, getActiveSessions);

/**
 * @route   POST /login-history/logout-session
 * @desc    Logout from a specific session
 * @access  Private
 */
router.post("/logout-session", authMiddleware, logoutSession);

/**
 * @route   POST /login-history/:userId/logout-all
 * @desc    Logout all sessions for a user
 * @access  Private
 */
router.post("/:userId/logout-all", authMiddleware, logoutAllSessions);

/**
 * @route   DELETE /login-history/:id
 * @desc    Delete a login history record (admin only)
 * @access  Private (Admin)
 */
router.delete("/:id", authMiddleware, deleteLoginHistory);

export default router;

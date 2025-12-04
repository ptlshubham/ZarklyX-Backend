import express from "express";
import { Request, Response } from "express";
import * as speakeasy from "speakeasy";
import * as QRCode from "qrcode";
import crypto from "crypto";
import dbInstance from "../../../../db/core/control-db";
import { Clients } from "./clients-model";
import { serverError, unauthorized } from "../../../../utils/responseHandler";
import { tokenMiddleWare } from "../../../../services/jwtToken-service";
import ErrorLogger from "../../../../db/core/logger/error-logger";

const router = express.Router();

/**
 * POST /clients/2fa/setup
 * Generate 2FA secret and QR code for client
 * Requires authentication
 */
router.post(
  "/clients/2fa/setup",
  tokenMiddleWare,
  async (req: Request, res: Response): Promise<void> => {
    const t = await dbInstance.transaction();
    try {
      const clientId = (req as any).user?.clientId;

      if (!clientId) {
        await t.rollback();
        unauthorized(res, "Client authentication required.");
        return;
      }

      const client: any = await Clients.findByPk(clientId, { transaction: t });

      if (!client) {
        await t.rollback();
        res.status(404).json({
          success: false,
          message: "Client not found.",
        });
        return;
      }

      // Check if 2FA is already enabled
      if (client.twofactorEnabled && client.twofactorVerified) {
        await t.rollback();
        res.status(400).json({
          success: false,
          message: "2FA is already enabled. Please disable it first to set up again.",
        });
        return;
      }

      // Generate new secret
      const secret = speakeasy.generateSecret({
        name: `ZarklyX Client (${client.email})`,
        issuer: "ZarklyX",
        length: 32,
      });

      // Generate QR code
      const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url!);

      // Save secret (not verified yet)
      await client.update(
        {
          twofactorSecret: secret.base32,
          twofactorEnabled: false, // Will be enabled after verification
          twofactorVerified: false,
        },
        { transaction: t }
      );

      await t.commit();

      res.status(200).json({
        success: true,
        message: "2FA secret generated. Please scan the QR code and verify.",
        data: {
          secret: secret.base32,
          qrCode: qrCodeUrl,
          otpauthUrl: secret.otpauth_url,
        },
      });
    } catch (error: any) {
      await t.rollback();
      console.error("[POST /clients/2fa/setup] ERROR:", error);
      ErrorLogger.write({ type: "2fa setup error", error });
      serverError(res, error.message || "Failed to set up 2FA.");
    }
  }
);

/**
 * POST /clients/2fa/verify
 * Verify 2FA token and enable 2FA
 * Requires authentication
 */
router.post(
  "/clients/2fa/verify",
  tokenMiddleWare,
  async (req: Request, res: Response): Promise<void> => {
    const t = await dbInstance.transaction();
    try {
      const clientId = (req as any).user?.clientId;
      const { token } = req.body;

      if (!clientId) {
        await t.rollback();
        unauthorized(res, "Client authentication required.");
        return;
      }

      if (!token) {
        await t.rollback();
        res.status(400).json({
          success: false,
          message: "2FA token is required.",
        });
        return;
      }

      const client: any = await Clients.findByPk(clientId, { transaction: t });

      if (!client) {
        await t.rollback();
        res.status(404).json({
          success: false,
          message: "Client not found.",
        });
        return;
      }

      if (!client.twofactorSecret) {
        await t.rollback();
        res.status(400).json({
          success: false,
          message: "2FA is not set up. Please set up 2FA first.",
        });
        return;
      }

      // Verify the token
      const verified = speakeasy.totp.verify({
        secret: client.twofactorSecret,
        encoding: "base32",
        token: String(token),
        window: 2, // Allow 2 time steps before/after
      });

      if (!verified) {
        await t.rollback();
        res.status(400).json({
          success: false,
          message: "Invalid 2FA token. Please try again.",
        });
        return;
      }

      // Generate backup codes
      const backupCodes = Array.from({ length: 10 }, () =>
        crypto.randomBytes(4).toString("hex").toUpperCase()
      );

      // Enable 2FA
      await client.update(
        {
          twofactorEnabled: true,
          twofactorVerified: true,
          twofactorBackupCodes: backupCodes,
        },
        { transaction: t }
      );

      await t.commit();

      res.status(200).json({
        success: true,
        message: "2FA enabled successfully. Please save your backup codes.",
        data: {
          backupCodes,
        },
      });
    } catch (error: any) {
      await t.rollback();
      console.error("[POST /clients/2fa/verify] ERROR:", error);
      ErrorLogger.write({ type: "2fa verify error", error });
      serverError(res, error.message || "Failed to verify 2FA.");
    }
  }
);

/**
 * POST /clients/2fa/disable
 * Disable 2FA for client
 * Requires authentication and password confirmation
 */
router.post(
  "/clients/2fa/disable",
  tokenMiddleWare,
  async (req: Request, res: Response): Promise<void> => {
    const t = await dbInstance.transaction();
    try {
      const clientId = (req as any).user?.clientId;
      const { password, token } = req.body;

      if (!clientId) {
        await t.rollback();
        unauthorized(res, "Client authentication required.");
        return;
      }

      if (!password && !token) {
        await t.rollback();
        res.status(400).json({
          success: false,
          message: "Password or 2FA token is required to disable 2FA.",
        });
        return;
      }

      const client: any = await Clients.findByPk(clientId, { transaction: t });

      if (!client) {
        await t.rollback();
        res.status(404).json({
          success: false,
          message: "Client not found.",
        });
        return;
      }

      if (!client.twofactorEnabled) {
        await t.rollback();
        res.status(400).json({
          success: false,
          message: "2FA is not enabled.",
        });
        return;
      }

      // Verify password if provided
      if (password) {
        const isValidPassword = client.validatePassword(password);
        if (!isValidPassword) {
          await t.rollback();
          res.status(401).json({
            success: false,
            message: "Invalid password.",
          });
          return;
        }
      }

      // Verify 2FA token if provided
      if (token) {
        const verified = speakeasy.totp.verify({
          secret: client.twofactorSecret,
          encoding: "base32",
          token: String(token),
          window: 2,
        });

        if (!verified) {
          await t.rollback();
          res.status(400).json({
            success: false,
            message: "Invalid 2FA token.",
          });
          return;
        }
      }

      // Disable 2FA
      await client.update(
        {
          twofactorEnabled: false,
          twofactorVerified: false,
          twofactorSecret: null,
          twofactorBackupCodes: null,
        },
        { transaction: t }
      );

      await t.commit();

      res.status(200).json({
        success: true,
        message: "2FA disabled successfully.",
      });
    } catch (error: any) {
      await t.rollback();
      console.error("[POST /clients/2fa/disable] ERROR:", error);
      ErrorLogger.write({ type: "2fa disable error", error });
      serverError(res, error.message || "Failed to disable 2FA.");
    }
  }
);

/**
 * POST /clients/2fa/regenerate-backup-codes
 * Generate new backup codes
 * Requires authentication and 2FA token
 */
router.post(
  "/clients/2fa/regenerate-backup-codes",
  tokenMiddleWare,
  async (req: Request, res: Response): Promise<void> => {
    const t = await dbInstance.transaction();
    try {
      const clientId = (req as any).user?.clientId;
      const { token } = req.body;

      if (!clientId) {
        await t.rollback();
        unauthorized(res, "Client authentication required.");
        return;
      }

      if (!token) {
        await t.rollback();
        res.status(400).json({
          success: false,
          message: "2FA token is required.",
        });
        return;
      }

      const client: any = await Clients.findByPk(clientId, { transaction: t });

      if (!client) {
        await t.rollback();
        res.status(404).json({
          success: false,
          message: "Client not found.",
        });
        return;
      }

      if (!client.twofactorEnabled || !client.twofactorVerified) {
        await t.rollback();
        res.status(400).json({
          success: false,
          message: "2FA is not enabled.",
        });
        return;
      }

      // Verify 2FA token
      const verified = speakeasy.totp.verify({
        secret: client.twofactorSecret,
        encoding: "base32",
        token: String(token),
        window: 2,
      });

      if (!verified) {
        await t.rollback();
        res.status(400).json({
          success: false,
          message: "Invalid 2FA token.",
        });
        return;
      }

      // Generate new backup codes
      const backupCodes = Array.from({ length: 10 }, () =>
        crypto.randomBytes(4).toString("hex").toUpperCase()
      );

      await client.update(
        {
          twofactorBackupCodes: backupCodes,
        },
        { transaction: t }
      );

      await t.commit();

      res.status(200).json({
        success: true,
        message: "Backup codes regenerated successfully. Please save them.",
        data: {
          backupCodes,
        },
      });
    } catch (error: any) {
      await t.rollback();
      console.error("[POST /clients/2fa/regenerate-backup-codes] ERROR:", error);
      ErrorLogger.write({ type: "2fa regenerate backup codes error", error });
      serverError(res, error.message || "Failed to regenerate backup codes.");
    }
  }
);

/**
 * GET /clients/2fa/status
 * Get 2FA status for client
 * Requires authentication
 */
router.get(
  "/clients/2fa/status",
  tokenMiddleWare,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const clientId = (req as any).user?.clientId;

      if (!clientId) {
        unauthorized(res, "Client authentication required.");
        return;
      }

      const client: any = await Clients.findByPk(clientId, {
        attributes: ["id", "email", "twofactorEnabled", "twofactorVerified"],
      });

      if (!client) {
        res.status(404).json({
          success: false,
          message: "Client not found.",
        });
        return;
      }

      res.status(200).json({
        success: true,
        message: "2FA status fetched successfully.",
        data: {
          twofactorEnabled: client.twofactorEnabled || false,
          twofactorVerified: client.twofactorVerified || false,
        },
      });
    } catch (error: any) {
      console.error("[GET /clients/2fa/status] ERROR:", error);
      ErrorLogger.write({ type: "2fa status error", error });
      serverError(res, error.message || "Failed to fetch 2FA status.");
    }
  }
);

export default router;

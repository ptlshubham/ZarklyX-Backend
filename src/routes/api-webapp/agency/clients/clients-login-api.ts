import express from "express";
import { Request, Response } from "express";
import * as speakeasy from "speakeasy";
import dbInstance from "../../../../db/core/control-db";
import { Clients } from "./clients-model";
import { serverError, unauthorized } from "../../../../utils/responseHandler";
import { generateToken } from "../../../../services/jwtToken-service";
import ErrorLogger from "../../../../db/core/logger/error-logger";

const router = express.Router();

/**
 * POST /clients/login
 * Client login with email/password
 * Returns requires2FA flag if 2FA is enabled
 */
router.post(
  "/clients/login",
  async (req: Request, res: Response): Promise<void> => {
    const t = await dbInstance.transaction();
    try {
      const { email, password, twofactorToken, backupCode } = req.body;

      if (!email || !password) {
        await t.rollback();
        res.status(400).json({
          success: false,
          message: "Email and password are required.",
        });
        return;
      }

      // Find client by email
      const client: any = await Clients.findOne({
        where: { email, isDeleted: false },
        transaction: t,
      });

      if (!client) {
        await t.rollback();
        res.status(401).json({
          success: false,
          message: "Invalid email or password.",
        });
        return;
      }

      // Verify password
      const isValidPassword = client.validatePassword(password);
      if (!isValidPassword) {
        await t.rollback();
        res.status(401).json({
          success: false,
          message: "Invalid email or password.",
        });
        return;
      }

      // Check if account is active
      if (!client.isActive) {
        await t.rollback();
        res.status(403).json({
          success: false,
          message: "Your account is deactivated. Please contact support.",
        });
        return;
      }

      // Check if 2FA is enabled
      if (client.twofactorEnabled && client.twofactorVerified) {
        // 2FA is enabled - require token or backup code
        if (!twofactorToken && !backupCode) {
          await t.rollback();
          res.status(200).json({
            success: false,
            requires2FA: true,
            message: "2FA is enabled. Please provide 2FA token or backup code.",
            tempData: {
              email: client.email,
              clientId: client.id,
            },
          });
          return;
        }

        // Verify 2FA token
        if (twofactorToken) {
          const verified = speakeasy.totp.verify({
            secret: client.twofactorSecret,
            encoding: "base32",
            token: String(twofactorToken),
            window: 2,
          });

          if (!verified) {
            await t.rollback();
            res.status(401).json({
              success: false,
              requires2FA: true,
              message: "Invalid 2FA token. Please try again.",
            });
            return;
          }
        }

        // Verify backup code
        if (backupCode) {
          const backupCodes = client.twofactorBackupCodes || [];
          const codeIndex = backupCodes.findIndex(
            (code: string) => code === String(backupCode).toUpperCase()
          );

          if (codeIndex === -1) {
            await t.rollback();
            res.status(401).json({
              success: false,
              requires2FA: true,
              message: "Invalid backup code.",
            });
            return;
          }

          // Remove used backup code
          const updatedBackupCodes = backupCodes.filter(
            (_: string, index: number) => index !== codeIndex
          );
          await client.update(
            { twofactorBackupCodes: updatedBackupCodes },
            { transaction: t }
          );
        }
      }

      // Check if first login
      const isFirstLogin = client.isFirstLogin || false;

      // Update isFirstLogin to false after successful login
      if (isFirstLogin) {
        await client.update({ isFirstLogin: false }, { transaction: t });
      }

      // Generate JWT token
      const tokenPayload: any = {
        clientId: client.id,
        email: client.email,
        role: "client",
      };

      if (client.userId) tokenPayload.userId = client.userId;
      if (client.companyId) tokenPayload.companyId = client.companyId;

      const token = await generateToken(tokenPayload, "7d");

      // Log login history (optional - if model exists)
      // try {
      //   await LoginHistory.create(
      //     {
      //       userId: client.userId || null,
      //       clientId: client.id,
      //       email: client.email,
      //       contact: client.contact || null,
      //       loginTime: new Date(),
      //       ipAddress: req.ip || req.headers["x-forwarded-for"] || "Unknown",
      //       userAgent: req.headers["user-agent"] || "Unknown",
      //       status: "success",
      //       loginType: "client",
      //       isDeleted: false,
      //     } as any,
      //     { transaction: t }
      //   );
      // } catch (logError) {
      //   console.error("Failed to log login history:", logError);
      //   // Don't fail login if history logging fails
      // }

      await t.commit();

      res.status(200).json({
        success: true,
        message: isFirstLogin
          ? "Login successful! Welcome to ZarklyX. Please update your password."
          : "Login successful!",
        data: {
          clientId: client.id,
          userId: client.userId,
          companyId: client.companyId,
          email: client.email,
          businessName: client.businessName,
          clientfirstName: client.clientfirstName,
          clientLastName: client.clientLastName,
          isFirstLogin,
          token,
          twofactorEnabled: client.twofactorEnabled || false,
        },
      });
    } catch (error: any) {
      await t.rollback();
      console.error("[POST /clients/login] ERROR:", error);
      ErrorLogger.write({ type: "client login error", error });
      serverError(res, error.message || "Login failed.");
    }
  }
);

/**
 * POST /clients/verify-2fa
 * Standalone endpoint to verify 2FA during login
 * Used when login returns requires2FA: true
 */
router.post(
  "/clients/verify-2fa",
  async (req: Request, res: Response): Promise<void> => {
    const t = await dbInstance.transaction();
    try {
      const { email, twofactorToken, backupCode } = req.body;

      if (!email) {
        await t.rollback();
        res.status(400).json({
          success: false,
          message: "Email is required.",
        });
        return;
      }

      if (!twofactorToken && !backupCode) {
        await t.rollback();
        res.status(400).json({
          success: false,
          message: "2FA token or backup code is required.",
        });
        return;
      }

      // Find client
      const client: any = await Clients.findOne({
        where: { email, isDeleted: false },
        transaction: t,
      });

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
          message: "2FA is not enabled for this account.",
        });
        return;
      }

      // Verify 2FA token
      if (twofactorToken) {
        const verified = speakeasy.totp.verify({
          secret: client.twofactorSecret,
          encoding: "base32",
          token: String(twofactorToken),
          window: 2,
        });

        if (!verified) {
          await t.rollback();
          res.status(401).json({
            success: false,
            message: "Invalid 2FA token.",
          });
          return;
        }
      }

      // Verify backup code
      if (backupCode) {
        const backupCodes = client.twofactorBackupCodes || [];
        const codeIndex = backupCodes.findIndex(
          (code: string) => code === String(backupCode).toUpperCase()
        );

        if (codeIndex === -1) {
          await t.rollback();
          res.status(401).json({
            success: false,
            message: "Invalid backup code.",
          });
          return;
        }

        // Remove used backup code
        const updatedBackupCodes = backupCodes.filter(
          (_: string, index: number) => index !== codeIndex
        );
        await client.update(
          { twofactorBackupCodes: updatedBackupCodes },
          { transaction: t }
        );
      }

      // Check if first login
      const isFirstLogin = client.isFirstLogin || false;
      if (isFirstLogin) {
        await client.update({ isFirstLogin: false }, { transaction: t });
      }

      // Generate token
      const tokenPayload: any = {
        clientId: client.id,
        email: client.email,
        role: "client",
      };

      if (client.userId) tokenPayload.userId = client.userId;
      if (client.companyId) tokenPayload.companyId = client.companyId;

      const token = await generateToken(tokenPayload, "7d");

      // Log login history (optional - if model exists)
      // try {
      //   await LoginHistory.create(
      //     {
      //       userId: client.userId || null,
      //       clientId: client.id,
      //       email: client.email,
      //       contact: client.contact || null,
      //       loginTime: new Date(),
      //       ipAddress: req.ip || req.headers["x-forwarded-for"] || "Unknown",
      //       userAgent: req.headers["user-agent"] || "Unknown",
      //       status: "success",
      //       loginType: "client-2fa",
      //       isDeleted: false,
      //     } as any,
      //     { transaction: t }
      //   );
      // } catch (logError) {
      //   console.error("Failed to log login history:", logError);
      // }

      await t.commit();

      res.status(200).json({
        success: true,
        message: "2FA verification successful!",
        data: {
          clientId: client.id,
          userId: client.userId,
          companyId: client.companyId,
          email: client.email,
          businessName: client.businessName,
          clientfirstName: client.clientfirstName,
          clientLastName: client.clientLastName,
          isFirstLogin,
          token,
          twofactorEnabled: client.twofactorEnabled,
        },
      });
    } catch (error: any) {
      await t.rollback();
      console.error("[POST /clients/verify-2fa] ERROR:", error);
      ErrorLogger.write({ type: "client 2fa verification error", error });
      serverError(res, error.message || "2FA verification failed.");
    }
  }
);

export default router;

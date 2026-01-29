import express, { Request, Response } from "express";
import speakeasy from "speakeasy";
import QRCode from "qrcode";
import bcrypt from "bcrypt";
import { ZarklyXUser } from "../../../../api-webapp/superAdmin/authentication/user/user-model";
import { zarklyXAuthMiddleware } from "../../../../../middleware/zarklyX-auth.middleware";
import { sendEmail } from "../../../../../services/mailService";
import { sequelize } from "../../../../../config/dbSQL";
import ErrorLogger from "../../../../../db/core/logger/error-logger";
import { completeLoginAfter2FA } from "../../../../api-webapp/superAdmin/authentication/auth-handler";

const router = express.Router();

// ========================= TWO-FACTOR AUTHENTICATION ENDPOINTS FOR ZARKLYX =========================

/**
 * POST /api/zarklyx/2fa/setup/step1
 * Step 1: Send confirmation code via email
 * Protected - requires authentication
 */
router.post("/setup/step1", zarklyXAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const authUser = req.zarklyXUser;

    if (!authUser || !authUser.id) {
      res.status(401).json({
        success: false,
        message: "Invalid or missing token user.",
      });
      return;
    }

    const user = await ZarklyXUser.findByPk(authUser.id);
    if (!user) {
      res.status(404).json({
        success: false,
        message: "User not found",
      });
      return;
    }

    // Generate 6-digit confirmation code
    const confirmationCode = Math.floor(100000 + Math.random() * 900000).toString();
    const codeExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Store temporarily in user table
    user.temp2FACode = confirmationCode;
    user.temp2FACodeExpiry = codeExpiry;
    await user.save();

    // Send confirmation code via email
    const emailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; padding: 30px; }
          .header { background-color: #4CAF50; color: white; padding: 20px; text-align: center; border-radius: 8px; }
          .code { font-size: 32px; font-weight: bold; color: #4CAF50; text-align: center; letter-spacing: 5px; padding: 20px 0; }
          .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>ZarklyX Platform - 2FA Setup</h1>
          </div>
          <p>Hi ${user.firstName || 'User'},</p>
          <p>You have initiated 2-Factor Authentication setup for your ZarklyX platform account.</p>
          <p>Please enter the confirmation code below to proceed:</p>
          <div class="code">${confirmationCode}</div>
          <p><strong>This code will expire in 10 minutes.</strong></p>
          <p>If you did not request this, please contact the platform administrator immediately.</p>
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} ZarklyX Platform. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    await sendEmail({
      to: user.email,
      subject: "ZarklyX Platform - 2FA Setup Confirmation Code",
      html: emailHtml,
      text: `Your 2FA confirmation code is: ${confirmationCode}. This code will expire in 10 minutes.`,
      from: "" as any,
      replacements: null,
      htmlFile: "" as any,
      attachments: null,
      cc: null,
      replyTo: null,
    });

    res.status(200).json({
      success: true,
      message: "Confirmation code sent to your email. Please check your inbox.",
      data: {
        step: 1,
        email: user.email,
        codeExpiry: codeExpiry,
      },
    });
  } catch (error: any) {
    ErrorLogger.write({ type: "zarklyx-2fa/setup/step1 error", error });
    res.status(500).json({
      success: false,
      message: error.message || "Failed to send confirmation code.",
    });
  }
});

/**
 * POST /api/zarklyx/2fa/setup/step2
 * Step 2: Verify email confirmation code and generate QR code
 * Protected - requires authentication
 */
router.post("/setup/step2", zarklyXAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const authUser = req.zarklyXUser;
    const { confirmationCode } = req.body;

    if (!authUser || !authUser.id) {
      res.status(401).json({
        success: false,
        message: "Invalid or missing token user.",
      });
      return;
    }

    if (!confirmationCode) {
      res.status(400).json({
        success: false,
        message: "Confirmation code is required.",
      });
      return;
    }

    const user = await ZarklyXUser.findByPk(authUser.id);
    if (!user) {
      res.status(404).json({
        success: false,
        message: "User not found",
      });
      return;
    }

    // Verify confirmation code
    if (user.temp2FACode !== String(confirmationCode)) {
      res.status(400).json({
        success: false,
        message: "Invalid confirmation code.",
      });
      return;
    }

    // Check expiry
    if (user.temp2FACodeExpiry && user.temp2FACodeExpiry < new Date()) {
      res.status(400).json({
        success: false,
        message: "Confirmation code has expired. Please request a new one.",
      });
      return;
    }

    // Code verified, now generate 2FA secret for QR code
    const secret = speakeasy.generateSecret({
      name: `ZarklyX Platform (${user.email})`,
      issuer: 'ZarklyX Platform',
      length: 32
    });

    // Generate QR code
    const qrCode = await QRCode.toDataURL(secret.otpauth_url || '');

    // Store temp secret for step 3 verification
    user.temp2FASecret = secret.base32;
    user.temp2FASecretExpiry = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes
    await user.save();

    res.status(200).json({
      success: true,
      message: "Email confirmed. Please download an authenticator app and scan the QR code.",
      data: {
        step: 2,
        qrCode: qrCode,
        manualEntryKey: secret.base32,
        authenticatorApps: [
          {
            name: "Google Authenticator",
            icon: "google",
            downloadUrl: "https://play.google.com/store/apps/details?id=com.google.android.apps.authenticator2",
          },
          {
            name: "Authy",
            icon: "authy",
            downloadUrl: "https://authy.com/download/",
          },
          {
            name: "Microsoft Authenticator",
            icon: "microsoft",
            downloadUrl: "https://www.microsoft.com/en-us/security/mobile-authenticator-app",
          },
        ],
      },
    });
  } catch (error: any) {
    ErrorLogger.write({ type: "zarklyx-2fa/setup/step2 error", error });
    res.status(500).json({
      success: false,
      message: error.message || "Failed to verify confirmation code.",
    });
  }
});

/**
 * POST /api/zarklyx/2fa/setup/step3
 * Step 3: Verify TOTP code and generate backup codes
 * Protected - requires authentication
 */
router.post("/setup/step3", zarklyXAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  const t = await sequelize.transaction();
  try {
    const authUser = req.zarklyXUser;
    const { totpCode } = req.body;

    if (!authUser || !authUser.id) {
      await t.rollback();
      res.status(401).json({
        success: false,
        message: "Invalid or missing token user.",
      });
      return;
    }

    if (!totpCode) {
      await t.rollback();
      res.status(400).json({
        success: false,
        message: "TOTP code is required.",
      });
      return;
    }

    const user = await ZarklyXUser.findByPk(authUser.id, { transaction: t });
    if (!user) {
      await t.rollback();
      res.status(404).json({
        success: false,
        message: "User not found",
      });
      return;
    }

    // Check if temp secret exists
    if (!user.temp2FASecret) {
      await t.rollback();
      res.status(400).json({
        success: false,
        message: "2FA setup not initiated. Please start from step 1.",
      });
      return;
    }

    // Check temp secret expiry
    if (user.temp2FASecretExpiry && user.temp2FASecretExpiry < new Date()) {
      await t.rollback();
      res.status(400).json({
        success: false,
        message: "2FA setup session expired. Please start from step 1.",
      });
      return;
    }

    // Verify the TOTP code against the temp secret
    const verified = speakeasy.totp.verify({
      secret: user.temp2FASecret,
      encoding: 'base32',
      token: String(totpCode),
      window: 2 // Allow 2 time windows (±30 seconds)
    });

    if (!verified) {
      await t.rollback();
      res.status(400).json({
        success: false,
        message: "Invalid TOTP code. Please try again.",
      });
      return;
    }

    // Generate backup codes (10 codes with format XXXX-XXXX)
    const backupCodes: string[] = [];
    for (let i = 0; i < 10; i++) {
      const code = speakeasy.generateSecret({ length: 8 }).base32;
      const formattedCode = `${code.slice(0, 4)}-${code.slice(4, 8)}`;
      backupCodes.push(formattedCode);
    }

    // Update user with 2FA enabled
    user.twofactorSecret = user.temp2FASecret;
    user.twofactorEnabled = true;
    user.twofactorVerified = true;
    user.twofactorBackupCodes = backupCodes;

    // Clear temp fields
    user.temp2FACode = null;
    user.temp2FACodeExpiry = null;
    user.temp2FASecret = null;
    user.temp2FASecretExpiry = null;

    await user.save({ transaction: t });

    await t.commit();

    res.status(200).json({
      success: true,
      message: "2FA has been enabled successfully.",
      data: {
        step: 3,
        twofactorEnabled: true,
        backupCodes: backupCodes,
        warning: "Save these backup codes in a safe place. You will need them if you lose access to your authenticator app. Each code can only be used once.",
      },
    });
  } catch (error: any) {
    await t.rollback();
    ErrorLogger.write({ type: "zarklyx-2fa/setup/step3 error", error });
    res.status(500).json({
      success: false,
      message: error.message || "Failed to verify TOTP code.",
    });
  }
});

/**
 * POST /api/zarklyx/2fa/disable
 * Disable 2FA
 * Protected - requires authentication and password confirmation
 */
router.post("/disable", zarklyXAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  const t = await sequelize.transaction();
  try {
    const authUser = req.zarklyXUser;
    const { password } = req.body;

    if (!authUser || !authUser.id) {
      await t.rollback();
      res.status(401).json({
        success: false,
        message: "Invalid or missing token user.",
      });
      return;
    }

    if (!password) {
      await t.rollback();
      res.status(400).json({
        success: false,
        message: "Password is required to disable 2FA.",
      });
      return;
    }

    const user = await ZarklyXUser.findByPk(authUser.id, { transaction: t });
    if (!user) {
      await t.rollback();
      res.status(404).json({
        success: false,
        message: "User not found",
      });
      return;
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      await t.rollback();
      res.status(401).json({
        success: false,
        message: "Invalid password.",
      });
      return;
    }

    // Disable 2FA
    user.twofactorEnabled = false;
    user.twofactorVerified = false;
    user.twofactorSecret = null;
    user.twofactorBackupCodes = null;
    await user.save({ transaction: t });

    await t.commit();

    res.status(200).json({
      success: true,
      message: "2FA has been disabled successfully.",
      data: {
        twofactorEnabled: false,
      },
    });
  } catch (error: any) {
    await t.rollback();
    ErrorLogger.write({ type: "zarklyx-2fa/disable error", error });
    res.status(500).json({
      success: false,
      message: error.message || "Failed to disable 2FA.",
    });
  }
});

/**
 * POST /api/zarklyx/2fa/verify-login
 * Verify 2FA code during login
 * Public endpoint - called after password verification
 */
router.post("/verify-login", async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId, totpCode, backupCode } = req.body;

    if (!userId || (!totpCode && !backupCode)) {
      res.status(400).json({
        success: false,
        message: "userId and either totpCode or backupCode are required",
      });
      return;
    }

    const user = await ZarklyXUser.findByPk(userId);
    if (!user) {
      res.status(404).json({
        success: false,
        message: "User not found",
      });
      return;
    }

    if (!user.twofactorEnabled || !user.twofactorSecret) {
      res.status(400).json({
        success: false,
        message: "2FA is not enabled for this user.",
      });
      return;
    }

    let isValid = false;

    // Check TOTP code if provided
    if (totpCode) {
      isValid = speakeasy.totp.verify({
        secret: user.twofactorSecret,
        encoding: 'base32',
        token: totpCode,
        window: 2
      });
    }

    // Check backup code if TOTP failed or not provided
    if (!isValid && backupCode && user.twofactorBackupCodes) {
      const backupCodes = Array.isArray(user.twofactorBackupCodes)
        ? user.twofactorBackupCodes
        : JSON.parse(user.twofactorBackupCodes);

      const codeIndex = backupCodes.indexOf(backupCode);
      if (codeIndex !== -1) {
        isValid = true;
        // Remove used backup code
        backupCodes.splice(codeIndex, 1);
        user.twofactorBackupCodes = backupCodes;
        await user.save();
      }
    }

    if (!isValid) {
      res.status(400).json({
        success: false,
        message: "Invalid 2FA code or backup code.",
      });
      return;
    }

    // 2FA verified successfully - complete the login
    const loginResult = await completeLoginAfter2FA(user.id);

    if (!loginResult.success) {
      res.status(500).json({
        success: false,
        message: loginResult.message,
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: "2FA verified successfully. Login complete.",
      data: {
        user: loginResult.user,
        token: loginResult.token,
      },
    });
  } catch (error: any) {
    ErrorLogger.write({ type: "zarklyx-2fa/verify-login error", error });
    res.status(500).json({
      success: false,
      message: error.message || "Failed to verify 2FA code.",
    });
  }
});

/**
 * GET /api/zarklyx/2fa/status
 * Get 2FA status for current user
 * Protected - requires authentication
 */
router.get("/status", zarklyXAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  try {
    const authUser = req.zarklyXUser;

    if (!authUser || !authUser.id) {
      res.status(401).json({
        success: false,
        message: "Invalid or missing token user.",
      });
      return;
    }

    const user = await ZarklyXUser.findByPk(authUser.id, {
      attributes: ['id', 'email', 'twofactorEnabled', 'twofactorVerified']
    });

    if (!user) {
      res.status(404).json({
        success: false,
        message: "User not found",
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: "2FA status retrieved successfully.",
      data: {
        twofactorEnabled: user.twofactorEnabled,
        twofactorVerified: user.twofactorVerified,
      },
    });
  } catch (error: any) {
    ErrorLogger.write({ type: "zarklyx-2fa/status error", error });
    res.status(500).json({
      success: false,
      message: error.message || "Failed to get 2FA status.",
    });
  }
});

/**
 * POST /api/zarklyx/2fa/regenerate-backup-codes
 * Regenerate backup codes
 * Protected - requires authentication and password confirmation
 */
router.post("/regenerate-backup-codes", zarklyXAuthMiddleware, async (req: Request, res: Response): Promise<void> => {
  const t = await sequelize.transaction();
  try {
    const authUser = req.zarklyXUser;
    const { password } = req.body;

    if (!authUser || !authUser.id) {
      await t.rollback();
      res.status(401).json({
        success: false,
        message: "Invalid or missing token user.",
      });
      return;
    }

    if (!password) {
      await t.rollback();
      res.status(400).json({
        success: false,
        message: "Password is required to regenerate backup codes.",
      });
      return;
    }

    const user = await ZarklyXUser.findByPk(authUser.id, { transaction: t });
    if (!user) {
      await t.rollback();
      res.status(404).json({
        success: false,
        message: "User not found",
      });
      return;
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      await t.rollback();
      res.status(401).json({
        success: false,
        message: "Invalid password.",
      });
      return;
    }

    if (!user.twofactorEnabled) {
      await t.rollback();
      res.status(400).json({
        success: false,
        message: "2FA is not enabled for this user.",
      });
      return;
    }

    // Generate new backup codes
    const backupCodes: string[] = [];
    for (let i = 0; i < 10; i++) {
      const code = speakeasy.generateSecret({ length: 8 }).base32;
      const formattedCode = `${code.slice(0, 4)}-${code.slice(4, 8)}`;
      backupCodes.push(formattedCode);
    }

    user.twofactorBackupCodes = backupCodes;
    await user.save({ transaction: t });

    await t.commit();

    res.status(200).json({
      success: true,
      message: "Backup codes regenerated successfully.",
      data: {
        backupCodes: backupCodes,
        warning: "Save these new backup codes in a safe place. The old codes are no longer valid.",
      },
    });
  } catch (error: any) {
    await t.rollback();
    ErrorLogger.write({ type: "zarklyx-2fa/regenerate-backup-codes error", error });
    res.status(500).json({
      success: false,
      message: error.message || "Failed to regenerate backup codes.",
    });
  }
});

export default router;

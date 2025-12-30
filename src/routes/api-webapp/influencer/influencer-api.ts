import express, { Request, Response } from "express";
import { addInfluencer, updateInfluencer } from "./influencer-handler";
import { OAuth2Client } from "google-auth-library";
import dbInstance from "../../../db/core/control-db";
import { Influencer } from "./influencer-model";
import * as speakeasy from "speakeasy";
import { generateToken } from "../../../services/jwtToken-service";
import QRCode from "qrcode";
import bcrypt from "bcryptjs";
import { getOtpByEmail } from "../otp/otp-handler";
import { Otp } from "../otp/otp-model";
const router = express.Router();

// Initialize Google OAuth2 Client
const googleClient = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID || ""
);

// Signup API for Influencer
// Google Client Signup - Creates new client account
router.post("/auth/google-signup", async (req: Request, res: Response): Promise<void> => {
  const t = await dbInstance.transaction();

  try {
    const { token } = req.body;

    if (!token) {
      await t.rollback();
      res.status(400).json({
        success: false,
        message: "Google token is required.",
      });
      return;
    }

    // Verify Google Token
    let ticket;
    try {
      ticket = await googleClient.verifyIdToken({
        idToken: token,
        audience: process.env.GOOGLE_CLIENT_ID,
      });
    } catch (err) {
      await t.rollback();
      res.status(400).json({
        success: false,
        message: "Invalid or expired Google token.",
      });
      return;
    }

    const payload = ticket.getPayload();
    if (!payload) {
      await t.rollback();
      res.status(400).json({
        success: false,
        message: "Failed to extract Google user data.",
      });
      return;
    }

    const googleId = payload.sub;
    const googleEmail = payload.email;
    const firstName = payload.given_name || "User";
    const lastName = payload.family_name || "";
    const emailVerified = payload.email_verified || false;

    if (!googleId || !googleEmail) {
      await t.rollback();
      res.status(400).json({
        success: false,
        message: "Google email or ID missing.",
      });
      return;
    }

    // Check if influencer already exists
    const existingInfluencer = await Influencer.findOne({
      where: { email: googleEmail },
      transaction: t,
    });

    if (existingInfluencer) {
      await t.rollback();
      res.status(409).json({
        success: false,
        message: "Influencer already exists with this email. Please use signin instead.",
        data: {
          email: googleEmail,
          needsSignin: true,
        },
      });
      return;
    }

    // Create new influencer
    const influencer = await addInfluencer(
      {
        firstName,
        lastName,
        email: googleEmail,
        contact: undefined,
        password: undefined,
        isfirstlogin: true,
        createddate: new Date(),
        updateddate: new Date(),
        authProvider: "google",
      },
      t
    );

    await t.commit();

    res.status(201).json({
      success: true,
      message: "Influencer account created successfully!",
      data: {
        id: influencer.id,
        firstName: influencer.firstName,
        lastName: influencer.lastName,
        email: influencer.email,
        authProvider: influencer.authProvider,
        isFirstLogin: influencer.isfirstlogin,
      },
    });
  } catch (error: any) {
    await t.rollback();
    console.error("[auth/google-signup ERROR]", error);
    res.status(500).json({
      success: false,
      message: error.message || "Google signup failed.",
    });
  }
});

// Google Influencer Signin - Logs in existing Influencer account
router.post("/auth/google-signin", async (req: Request, res: Response): Promise<void> => {
  try {
    const { token } = req.body;

    if (!token) {
      res.status(400).json({
        success: false,
        message: "Google token is required.",
      });
      return;
    }

    // Verify Google Token
    let ticket;
    try {
      ticket = await googleClient.verifyIdToken({
        idToken: token,
        audience: process.env.GOOGLE_CLIENT_ID,
      });
    } catch (err) {
      res.status(400).json({
        success: false,
        message: "Invalid or expired Google token.",
      });
      return;
    }

    const payload = ticket.getPayload();
    if (!payload) {
      res.status(400).json({
        success: false,
        message: "Failed to extract Google user data.",
      });
      return;
    }

    const googleEmail = payload.email;

    if (!googleEmail) {
      res.status(400).json({
        success: false,
        message: "Google email is missing.",
      });
      return;
    }

    // Check if influencer exists
    const influencer = await Influencer.findOne({ where: { email: googleEmail } });

    if (!influencer) {
      res.status(404).json({
        success: false,
        message: "Influencer not found. Please sign up first.",
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: "Login successful.",
      data: {
        id: influencer.id,
        firstName: influencer.firstName,
        lastName: influencer.lastName,
        email: influencer.email,
        authProvider: influencer.authProvider,
        isFirstLogin: influencer.isfirstlogin,
      },
    });
  } catch (error: any) {
    console.error("[auth/google-signin ERROR]", error);
    res.status(500).json({
      success: false,
      message: error.message || "Google signin failed.",
    });
  }
});

// Verify Google Token (utility endpoint) for influencer
router.post("/auth/google-verify", async (req: Request, res: Response): Promise<void> => {
  try {
    const { token } = req.body;

    if (!token) {
      res.status(400).json({
        success: false,
        message: "Google token is required.",
      });
      return;
    }

    // Verify Google Token
    let ticket;
    try {
      ticket = await googleClient.verifyIdToken({
        idToken: token,
        audience: process.env.GOOGLE_CLIENT_ID,
      });
    } catch (err) {
      res.status(400).json({
        success: false,
        message: "Invalid or expired Google token.",
      });
      return;
    }

    const payload = ticket.getPayload();
    if (!payload) {
      res.status(400).json({
        success: false,
        message: "Failed to extract Google user data.",
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: "Google token verified successfully.",
      data: payload,
    });
  } catch (error: any) {
    console.error("[auth/google-verify ERROR]", error);
    res.status(500).json({
      success: false,
      message: error.message || "Google token verification failed.",
    });
  }
});

// Influencer Signup API
router.post("/influencerSignup", async (req: Request, res: Response): Promise<void> => {
  const t = await dbInstance.transaction();

  try {
    const { firstName, lastName, email, password, contact } = req.body;

    console.log("[influencerSignup] Email:", email);

    if (!firstName || !lastName || !email || !password || !contact) {
      await t.rollback();
      res.status(400).json({
        success: false,
        message: "firstName, lastName, email, contact, and password are required.",
      });
      return;
    }

    // Check if influencer already exists
    const existingInfluencer = await Influencer.findOne({
      where: { email },
      transaction: t,
    });

    if (existingInfluencer) {
      await t.rollback();
      res.status(409).json({
        success: false,
        message: "Influencer already exists with this email. Please use signin instead.",
      });
      return;
    }

    // Generate OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000); // OTP valid for 10 minutes

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Store influencer data temporarily in OTP table
    await Otp.create({
      email,
      contact: contact || null,
      otp,
      mbOTP: null,
      loginOTP: null,
      otpVerify: false,
      otpExpiresAt,
      mbOTPExpiresAt: null,
      isDeleted: false,
      isEmailVerified: false,
      isMobileVerified: false,
      isActive: true,
      tempUserData: JSON.stringify({
        firstName,
        lastName,
        password: hashedPassword,
        contact,
      }),
      createdAt: new Date(),
      updatedAt: new Date(),
    }, { transaction: t });

    console.log("[influencerSignup] Generated OTP:", otp);

    await t.commit();

    res.status(201).json({
      success: true,
      message: "Influencer data stored temporarily. Please verify OTP to complete registration.",
    });
  } catch (error: any) {
    await t.rollback();
    console.error("[influencerSignup ERROR]", error);
    res.status(500).json({
      success: false,
      message: error.message || "Influencer signup failed.",
    });
  }
});

// Influencer Verify OTP API
router.post("/influencerSignup/verify-otp", async (req: Request, res: Response): Promise<void> => {
  const t = await dbInstance.transaction();

  try {
    const { email, otp } = req.body;

    console.log("[verify-otp] Email:", email, "OTP:", otp);

    if (!email || !otp) {
      res.status(400).json({
        success: false,
        message: "Email and OTP are required.",
      });
      return;
    }

    // Fetch OTP entry by email
    const otpEntry = await Otp.findOne({ where: { email }, transaction: t });

    if (!otpEntry) {
      res.status(404).json({
        success: false,
        message: "No OTP found for this email.",
      });
      return;
    }

    // Check if OTP matches and is not expired
    const isOtpValid = otpEntry.otp === otp && otpEntry.otpExpiresAt && new Date() < new Date(otpEntry.otpExpiresAt);

    if (!isOtpValid) {
      res.status(400).json({
        success: false,
        message: "Invalid or expired OTP.",
      });
      return;
    }

    // Parse temporary data and create influencer
    const tempUserData = JSON.parse(otpEntry.tempUserData);

    const influencer = await addInfluencer({
      firstName: tempUserData.firstName || "", // Ensure non-null values
      lastName: tempUserData.lastName || "", // Ensure non-null values
      email,
      password: tempUserData.password || "", // Ensure non-null values
      contact: tempUserData.contact || null, // Corrected to store contact
      isfirstlogin: true,
      createddate: new Date(),
      updateddate: new Date(),
    }, t);

    // Delete OTP entry after successful registration
    await otpEntry.destroy({ transaction: t });

    await t.commit();

    res.status(201).json({
      success: true,
      message: "Influencer registered successfully!",
      data: {
        id: influencer.id,
        firstName: influencer.firstName,
        lastName: influencer.lastName,
        email: influencer.email,
        contact: influencer.contact,
      },
    });
  } catch (error: any) {
    await t.rollback();
    console.error("[influencerSignup/verify-otp ERROR]", error);
    res.status(500).json({
      success: false,
      message: error.message || "OTP verification failed.",
    });
  }
});

// Influencer 2FA Setup
router.post("/influencer/2fa/setup", async (req: Request, res: Response): Promise<void> => {
  try {
    const { email } = req.body;

    if (!email) {
      res.status(400).json({
        success: false,
        message: "Email is required for 2FA setup.",
      });
      return;
    }

    const secret = speakeasy.generateSecret({ length: 20 });
    const otpAuthUrl = speakeasy.otpauthURL({
      secret: secret.ascii,
      label: `Influencer (${email})`,
      issuer: "ZarklyX",
    });

    const qrCodeDataUrl = await QRCode.toDataURL(otpAuthUrl);

    res.status(200).json({
      success: true,
      message: "2FA setup successful.",
      data: {
        secret: secret.base32,
        qrCodeDataUrl,
      },
    });
  } catch (error: any) {
    console.error("[2FA Setup Error]", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to setup 2FA.",
    });
  }
});

// Influencer Login API with 2FA
router.post("/influencer/login", async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password, otp } = req.body;

    if (!email || !password || !otp) {
      res.status(400).json({
        success: false,
        message: "Email, password, and OTP are required.",
      });
      return;
    }

    const influencer = await Influencer.findOne({ where: { email } });

    if (!influencer) {
      res.status(404).json({
        success: false,
        message: "Influencer not found.",
      });
      return;
    }

    const isPasswordValid = await bcrypt.compare(password, influencer.password || "");
    if (!isPasswordValid) {
      res.status(401).json({
        success: false,
        message: "Invalid password.",
      });
      return;
    }

    const isOtpValid = speakeasy.totp.verify({
      secret: influencer.twoFactorSecret || "", // Corrected property name
      encoding: "base32",
      token: otp,
    });

    if (!isOtpValid) {
      res.status(401).json({
        success: false,
        message: "Invalid or expired OTP.",
      });
      return;
    }

    const token = generateToken({ id: influencer.id, email: influencer.email });

    res.status(200).json({
      success: true,
      message: "Login successful.",
      data: {
        token,
        influencer: {
          id: influencer.id,
          firstName: influencer.firstName,
          lastName: influencer.lastName,
          email: influencer.email,
        },
      },
    });
  } catch (error: any) {
    console.error("[Influencer Login Error]", error);
    res.status(500).json({
      success: false,
      message: error.message || "Login failed.",
    });
  }
});

// Add role assignment during influencer registration
router.post("/influencer/register", async (req: Request, res: Response): Promise<void> => {
  const t = await dbInstance.transaction();

  try {
    const { firstName, lastName, email, password, contact } = req.body;

    if (!firstName || !lastName || !email || !password || !contact) {
      await t.rollback();
      res.status(400).json({
        success: false,
        message: "All fields are required.",
      });
      return;
    }

    const existingInfluencer = await Influencer.findOne({ where: { email }, transaction: t });

    if (existingInfluencer) {
      await t.rollback();
      res.status(409).json({
        success: false,
        message: "Influencer already exists.",
      });
      return;
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const influencer = await Influencer.create(
      {
        firstName,
        lastName,
        email,
        password: hashedPassword,
        contact,
        role: "influencer",
        isfirstlogin: true,
        isActive: true,
        isDeleted: false,
      },
      { transaction: t }
    );

    await t.commit();

    res.status(201).json({
      success: true,
      message: "Influencer registered successfully.",
      data: {
        id: influencer.id,
        firstName: influencer.firstName,
        lastName: influencer.lastName,
        email: influencer.email,
        role: influencer.role,
      },
    });
  } catch (error: any) {
    await t.rollback();
    console.error("[Influencer Registration Error]", error);
    res.status(500).json({
      success: false,
      message: error.message || "Registration failed.",
    });
  }
});

export default router;
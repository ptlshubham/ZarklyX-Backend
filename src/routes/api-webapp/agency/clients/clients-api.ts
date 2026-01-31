import express from "express";
import { Request, Response } from "express";
import { notFound } from "../../../../services/response";
import dbInstance from "../../../../db/core/control-db";
import { clientProfilePhotoUpload } from "../../../../services/multer";
import {
  serverError,
  unauthorized,
} from "../../../../utils/responseHandler";
import {
  generateOTP
} from "../../../../services/password-service";
import { sendOTP } from "../../../../services/otp-service";
import { generateToken, tokenMiddleWare } from "../../../../services/jwtToken-service";
import { generateRandomPassword } from "../../../../services/password-service";
import { sendEmail } from "../../../../services/mailService";
import { Op } from "sequelize";
import ErrorLogger from "../../../../db/core/logger/error-logger";
import { Otp } from "../../../../routes/api-webapp/otp/otp-model";
import { Clients } from "../../../../routes/api-webapp/agency/clients/clients-model";
import {
  addAgencyClient,
  getClientsByMbMo,
  getClientsByEmail,
  getagencyClientByid,
  getAllAgencyClient,
  getAgencyClientByUserId,
  getClientDataWithCounts,
  validateCompanyUrlAndBranding,
} from "../../../../routes/api-webapp/agency/clients/clients-handler";
import { User } from "../../../../routes/api-webapp/authentication/user/user-model";
import { generateUniqueSecretCode } from "../../../../routes/api-webapp/authentication/user/user-handler";
import { detectCountryCode, } from "../../../../services/phone-service";
import { BusinessType } from "../../../../routes/api-webapp/superAdmin/generalSetup/businessType/businessType-model";
import { BusinessSubcategory } from "../../../../routes/api-webapp/superAdmin/generalSetup/businessType/businessSubcategory-model";
import { Company } from "../../../../routes/api-webapp/company/company-model";
import { sendMobileOTP } from "../../../../services/otp-service";
import { OAuth2Client } from "google-auth-library";
import * as speakeasy from "speakeasy";
import QRCode from "qrcode";

const router = express.Router();

// Initialize Google OAuth2 Client
const googleClient = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID || ""
);
// Google Client Signup - Creates new client account
router.post("/auth/google-signup", async (req: Request, res: Response): Promise<void> => {
  const t = await dbInstance.transaction();

  try {
    const { code, companyId } = req.body;

    if (!code) {
      await t.rollback();
      res.status(400).json({
        success: false,
        message: "Google authorization code is required.",
      });
      return;
    }

    // Exchange authorization code for ID token
    let tokenResponse;
    try {
      const tokenParams = new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        code: code,
        grant_type: 'authorization_code',
        redirect_uri: 'postmessage' // For popup flow
      });

      const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: tokenParams.toString()
      });

      tokenResponse = await response.json();

      if (!response.ok || !tokenResponse.id_token) {
        await t.rollback();
        res.status(400).json({
          success: false,
          message: "Failed to exchange authorization code for token.",
        });
        return;
      }
    } catch (err) {
      await t.rollback();
      res.status(400).json({
        success: false,
        message: "Invalid or expired Google authorization code.",
      });
      return;
    }

    const token = tokenResponse.id_token;

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

    // Validate company if companyId is provided
    let validatedCompanyId = null;
    let companyIsdCode = null;
    let companyIsoCode = null;
    if (companyId) {
      const company = await Company.findByPk(companyId, { transaction: t });
      if (!company) {
        await t.rollback();
        res.status(400).json({
          success: false,
          message: "Invalid companyId. Company not found.",
        });
        return;
      }
      validatedCompanyId = companyId;
      companyIsdCode = company.isdCode;
      companyIsoCode = company.isoCode;
    }

    // Check if client already exists
    const existingClient = await Clients.findOne({
      where: { email: googleEmail },
      transaction: t,
    });

    if (existingClient) {
      await t.rollback();
      res.status(409).json({
        success: false,
        message: "Client already exists with this email. Please use signin instead.",
        data: {
          email: googleEmail,
          needsSignin: true,
        },
      });
      return;
    }

    // Create new user
    const secretCode = await generateUniqueSecretCode();
    const user = await User.create(
      {
        firstName,
        lastName,
        email: googleEmail,
        contact: null,
        isdCode: companyIsdCode,
        isoCode: companyIsoCode,
        password: generateRandomPassword(),
        userType: "client",
        isEmailVerified: emailVerified,
        isMobileVerified: false,
        isDeleted: false,
        isActive: true,
        authProvider: "google",
        googleId,
        secretCode,
        companyId: validatedCompanyId,
      } as any,
      { transaction: t }
    );

    // Create client record with comprehensive field mapping
    const client = await Clients.create(
      {
        userId: user.id,
        companyId: validatedCompanyId,
        userName: `${firstName} ${lastName}`.trim(),
        clientfirstName: firstName,
        clientLastName: lastName,
        email: googleEmail,
        contact: null,
        businessName: `${firstName} ${lastName}`.trim(),
        businessBase: "service",
        businessTypeId: null,
        businessSubCategory: null,
        businessWebsite: null,
        businessEmail: null,
        businessContact: null,
        businessExecutive: null,
        isoBusinessCode: null,
        isdBusinessCode: null,
        businessDescription: null,
        countryCode: null,
        isoCode: companyIsoCode,
        isdCode: companyIsdCode,
        country: null,
        state: null,
        city: null,
        postcode: null,
        address: null,
        password: null,
        accounteHolderName: null,
        accountNumber: null,
        bankName: null,
        branchName: null,
        ifscCode: null,
        swiftCode: null,
        accountType: null,
        currency: null,
        taxVatId: null,
        isVip: false,
        isActive: true,
        isDeleted: false,
        isStatus: true,
        isApprove: false,
        isCredential: false,
        profileStatus: false,
        logo: null,
        payment: null,
        isEmailVerified: emailVerified,
        isRegistering: false,
        registrationStep: 1,
        isMobileVerified: false,
        isFirstLogin: true,
        isassigned: false,
        twofactorEnabled: false,
        twofactorSecret: null,
        twofactorVerified: false,
        twofactorBackupCodes: null,
        authProvider: "google",
        googleId,
      } as any,
      { transaction: t }
    );

    // Send welcome email
    const welcomeEmailHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; background-color: #f4f4f4; }
          .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
          .header { background-color: #4CAF50; color: white; padding: 30px; text-align: center; }
          .header h1 { margin: 0; font-size: 28px; }
          .content { padding: 30px; }
          .content h2 { color: #4CAF50; margin-top: 0; }
          .content p { margin: 10px 0; }
          .footer { text-align: center; padding: 20px; background-color: #f4f4f4; color: #666; font-size: 12px; border-top: 1px solid #ddd; }
          .footer p { margin: 5px 0; }
          .highlight { color: #4CAF50; font-weight: bold; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Welcome to ZarklyX!</h1>
          </div>
          <div class="content">
            <h2>Hi ${firstName} ${lastName},</h2>
            <p>Welcome to <strong>ZarklyX</strong>! Your client account has been successfully created via Google authentication.</p>
            <p><span class="highlight">✓</span> Your email is verified and ready to use.</p>
            <p>You can now access all the features and services available on our platform.</p>
            <p><strong>Need help?</strong> If you have any questions or need assistance, feel free to reach out to our support team.</p>
            <p>Best regards,<br><strong>The ZarklyX Team</strong></p>
          </div>
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} ZarklyX. All rights reserved.</p>
            <p>This is an automated message, please do not reply to this email.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    await sendEmail({
      to: googleEmail,
      subject: "Welcome to ZarklyX - Account Created!",
      html: welcomeEmailHtml,
      text: `Hi ${firstName} ${lastName}, Welcome to ZarklyX! Your account has been created via Google. You're all set to get started!`,
      from: "" as any,
      replacements: null,
      htmlFile: "" as any,
      attachments: null,
      cc: null,
      replyTo: null,
    });

    // Generate JWT token
    const tokenPayload: any = {
      clientId: client.id,
      userId: user.id,
      email: googleEmail,
      role: "client",
    };

    const jwtToken = await generateToken(tokenPayload, "7d");

    await t.commit();

    console.log(`[Google Signup] New client created: ${googleEmail}`);

    res.status(201).json({
      success: true,
      message: "Client account created successfully!",
      data: {
        id: client.id,
        userId: user.id,
        clientfirstName: client.clientfirstName,
        clientLastName: client.clientLastName,
        email: client.email,
        businessName: client.businessName,
        userName: client.userName,
        authProvider: "google",
        token: jwtToken,
        isFirstLogin: client.isFirstLogin,
        companyId: validatedCompanyId,
      },
    });
  } catch (error: any) {
    await t.rollback();
    console.error("[auth/google-signup ERROR]", error);
    ErrorLogger.write({ type: "google signup error", error });
    serverError(res, error.message || "Google signup failed.");
  }
});

// Google Client Signin - Logs in existing client account
router.post("/auth/google-signin", async (req: Request, res: Response): Promise<void> => {
  const t = await dbInstance.transaction();

  try {
    const { code } = req.body;

    if (!code) {
      await t.rollback();
      res.status(400).json({
        success: false,
        message: "Google authorization code is required.",
      });
      return;
    }

    // Exchange authorization code for ID token
    let tokenResponse;
    try {
      const tokenParams = new URLSearchParams({
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        code: code,
        grant_type: 'authorization_code',
        redirect_uri: 'postmessage' // For popup flow
      });

      const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: tokenParams.toString()
      });

      tokenResponse = await response.json();

      if (!response.ok || !tokenResponse.id_token) {
        await t.rollback();
        res.status(400).json({
          success: false,
          message: "Failed to exchange authorization code for token.",
        });
        return;
      }
    } catch (err) {
      await t.rollback();
      res.status(400).json({
        success: false,
        message: "Invalid or expired Google authorization code.",
      });
      return;
    }

    const token = tokenResponse.id_token;

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

    // Check if client exists
    let client: any = await Clients.findOne({
      where: { email: googleEmail },
      transaction: t,
    });

    if (!client) {
      await t.rollback();
      res.status(404).json({
        success: false,
        message: "Client not found. Please signup first.",
        data: {
          email: googleEmail,
          needsSignup: true,
        },
      });
      return;
    }

    // Get associated user
    let user: any = await User.findByPk(client.userId, { transaction: t });

    if (!user) {
      await t.rollback();
      res.status(404).json({
        success: false,
        message: "User associated with client not found.",
      });
      return;
    }

    // Update User Google info if missing
    let userNeedsUpdate = false;
    if (!user.googleId) {
      user.googleId = googleId;
      userNeedsUpdate = true;
    }
    if (!user.isEmailVerified && emailVerified) {
      user.isEmailVerified = emailVerified;
      userNeedsUpdate = true;
    }
    if (userNeedsUpdate) {
      await user.update(
        { googleId, isEmailVerified: user.isEmailVerified || emailVerified, authProvider: "google" },
        { transaction: t }
      );
    }

    // Update Client Google info if missing
    let clientNeedsUpdate = false;
    if (!client.googleId) {
      client.googleId = googleId;
      clientNeedsUpdate = true;
    }
    if (!client.isEmailVerified && emailVerified) {
      client.isEmailVerified = emailVerified;
      clientNeedsUpdate = true;
    }
    if (clientNeedsUpdate) {
      await client.update(
        { googleId, isEmailVerified: client.isEmailVerified || emailVerified, authProvider: "google" },
        { transaction: t }
      );
    }

    // Generate JWT token
    const tokenPayload: any = {
      clientId: client.id,
      userId: user.id,
      email: googleEmail,
      role: "client",
    };

    const jwtToken = await generateToken(tokenPayload, "7d");

    await t.commit();

    console.log(`[Google Signin] Client logged in: ${googleEmail}`);

    res.status(200).json({
      success: true,
      message: "Signin successful!",
      data: {
        id: client.id,
        userId: user.id,
        clientfirstName: client.clientfirstName,
        clientLastName: client.clientLastName,
        email: client.email,
        businessName: client.businessName,
        userName: client.userName,
        authProvider: "google",
        token: jwtToken,
        isFirstLogin: client.isFirstLogin,
      },
    });
  } catch (error: any) {
    await t.rollback();
    console.error("[auth/google-signin ERROR]", error);
    ErrorLogger.write({ type: "google signin error", error });
    serverError(res, error.message || "Google signin failed.");
  }
});

// Verify Google Token (utility endpoint)
router.post("/auth/verify-google", async (req: Request, res: Response): Promise<void> => {
  try {
    const { credential } = req.body;

    if (!credential) {
      res.status(400).json({
        success: false,
        message: "Google credential (idToken) is required",
      });
      return;
    }

    const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();

    if (!payload) {
      res.status(401).json({
        success: false,
        message: "Invalid Google token",
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: "Token verified successfully",
      data: {
        googleId: payload.sub,
        email: payload.email,
        emailVerified: payload.email_verified,
        firstName: payload.given_name,
        lastName: payload.family_name,
        picture: payload.picture,
      },
    });
    return;
  } catch (error: any) {
    console.error("[/client/auth/verify-google] ERROR:", error);
    res.status(401).json({
      success: false,
      message: error.message || "Token verification failed",
    });
    return;
  }
});

// signup for client (Agency)
router.post("/clientSignup/start",
  async (req: Request, res: Response): Promise<void> => {
    const t = await dbInstance.transaction();

    try {
      const {
        companyId,
        businessName,
        clientfirstName,
        clientLastName,
        email,
        contact,
        isdCode,
        isoCode,
        password,
        confirmPassword,
        userName: userNameFromFE, // optional from FE
      } = req.body;

      // 1) Basic required validation
      if (
        !companyId ||
        !clientfirstName ||
        !clientLastName ||
        !businessName ||
        !email ||
        !contact ||
        !password ||
        !confirmPassword
      ) {
        await t.rollback();
        res.status(400).json({
          success: false,
          message: "All fields required.",
        });
        return;
      }

      if (password !== confirmPassword) {
        await t.rollback();
        res.status(400).json({
          success: false,
          message: "Passwords do not match.",
        });
        return;
      }

      // 2) Validate COMPANY
      const parentCompany: any = await Company.findByPk(companyId, {
        transaction: t,
      });

      if (!parentCompany) {
        await t.rollback();
        res.status(400).json({
          success: false,
          message: "Invalid companyId. Company not found.",
        });
        return;
      }

      // Build safe userName from client details
      const actualUserName =
        `${clientfirstName} ${clientLastName}`.trim();

      //  userName only for logging 
      if (userNameFromFE && userNameFromFE !== actualUserName) {
        console.warn("[clientSignup/start] userName mismatch, using client names:", {
          fromFE: userNameFromFE,
          fromDB: actualUserName,
        });
      }

      // Auto-detect countryCode from contact
      const rawContact: string = String(contact).trim();
      const digitsOnly = rawContact.replace(/\D/g, "");

      let detectionNumber = rawContact;
      if (!rawContact.startsWith("+")) {
        if (digitsOnly.length === 10) {
          detectionNumber = `+91${digitsOnly}`;
        } else {
          detectionNumber = `+${digitsOnly}`;
        }
      }

      const autoCountryCode = detectCountryCode(detectionNumber);
      const finalIsdCode = isdCode || autoCountryCode || null;
      const finalIsoCode = isoCode || null;

      if (!finalIsdCode) {
        await t.rollback();
        res.status(400).json({
          success: false,
          message: "Invalid contact. Could not detect country code.",
        });
        return;
      }

      //  Duplicate client check
      // const existsByEmail = await getClientsByEmail({ email });
      // const existsByContact = await getClientsByMbMo({ contact });

      // if (existsByEmail || existsByContact) {
      //   await t.rollback();
      //   res.status(409).json({
      //     success: false,
      //     message: "Email or Contact already registered.",
      //   });
      //   return;
      // }

      //  Remove any previous OTP for this email
      await Otp.destroy({
        where: { [Op.or]: [{ email }, { contact }] },
        transaction: t,
      });
      // await Otp.destroy({ where: { email }, transaction: t });

      // Generate OTP + save tempUserData (with safe userName + userId + companyId)
      const emailOtp = generateOTP().toString();
      const mobileOtp = generateOTP().toString();
      const expiry = new Date(Date.now() + 10 * 60 * 1000); // 10 min
      // const otp = Math.floor(100000 + Math.random() * 900000).toString();

      await Otp.create(
        {
          userId: 'null', // No parent user for client signup
          email,
          contact,
          // otp,
          otp: emailOtp,
          mbOTP: mobileOtp,
          otpVerify: false,
          // otpExpiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 min
          otpExpiresAt: expiry,
          mbOTPExpiresAt: expiry,
          tempUserData: {
            companyId: parentCompany.id,
            userName: actualUserName, // validated userName store
            businessName,
            clientLastName,
            clientfirstName,
            email,
            contact,
            isdCode: finalIsdCode,
            isoCode: finalIsoCode,
            password, // in hashed Clients model 
          },
        } as any,
        { transaction: t }
      );

      // Send OTP to Email
      const emailResult = await sendOTP({ email, otp: emailOtp }, "client-signup");
      if (!emailResult || !emailResult.success) {
        await t.rollback();
        res.status(500).json({
          success: false,
          message: emailResult?.message || "Failed to send Email OTP.",
        });
        return;
      }

      // Send OTP to Mobile
      const mobileResult = await sendOTP({ contact, mbOTP: mobileOtp }, "client-signup");
      if (!mobileResult || !mobileResult.success) {
        await t.rollback();
        res.status(500).json({
          success: false,
          message: mobileResult?.message || "Failed to send Mobile OTP.",
        });
        return;
      }
      // Send OTP
      // await sendOTP({ email, otp }, "register");

      await t.commit();
      res.status(200).json({
        success: true,
        message: "OTP sent to email. Please verify to complete signup.",
        data: {
          companyId: parentCompany.id,
          userName: actualUserName,
          email,
          contact
        },
      });
    } catch (err) {
      await t.rollback();
      console.error("[clients/signup/start] ERROR:", err);
      res.status(500).json({ success: false, message: "Server error" });
    }
  }
);

// verify otp for client signup (Agency)
router.post("/clientSignup/verify-otp",
  async (req: Request, res: Response): Promise<void> => {
    const t = await dbInstance.transaction();

    try {
      const { email, otp, mbOTP } = req.body;

      // Require email and at least one OTP
      if (!email || (!otp && !mbOTP)) {
        await t.rollback();
        res
          .status(400)
          .json({ success: false, message: "Email and either Email OTP or Mobile OTP are required." });
        return;
      }

      // Build where conditions for EITHER email OTP OR mobile OTP
      const whereConditions: any[] = [];

      if (otp) {
        whereConditions.push({
          otp: String(otp),
          otpExpiresAt: { [Op.gt]: new Date() },
        });
      }

      if (mbOTP) {
        whereConditions.push({
          mbOTP: String(mbOTP),
          mbOTPExpiresAt: { [Op.gt]: new Date() },
        });
      }

      // Find valid OTP record (verify with EITHER email or mobile OTP)
      const otpRecord = await Otp.findOne({
        where: {
          email,
          otpVerify: false,
          [Op.or]: whereConditions,
        },
        transaction: t,
      });

      if (!otpRecord) {
        await t.rollback();
        res
          .status(400)
          .json({ success: false, message: "Invalid / expired OTP (email or mobile)." });
        return;
      }

      // Determine which OTP was verified
      let isEmailVerified = false;
      let isMobileVerified = false;

      if (otp && otpRecord.otp === String(otp)) {
        isEmailVerified = true;
      }

      if (mbOTP && otpRecord.mbOTP === String(mbOTP)) {
        isMobileVerified = true;
      }

      // Read + parse tempUserData safely
      let temp: any = (otpRecord as any).tempUserData;

      if (typeof temp === "string") {
        try {
          temp = JSON.parse(temp);
        } catch {
          temp = null;
        }
      }

      if (
        !temp ||
        !temp.email ||
        !temp.contact ||
        !temp.businessName ||
        !temp.clientfirstName ||
        !temp.clientLastName
      ) {
        await t.rollback();
        res.status(400).json({
          success: false,
          message:
            "Signup data missing or invalid. Please restart signup.",
        });
        return;
      }

      const tempUserId = temp.userId || null;
      const tempCompanyId = temp.companyId || null;

      // Validate parent Company (FK safety)
      let parentCompany: Company | null = null;
      if (tempCompanyId) {
        parentCompany = await Company.findByPk(tempCompanyId, {
          transaction: t,
        });
        if (!parentCompany) {
          await t.rollback();
          res.status(400).json({
            success: false,
            message: "Invalid companyId in signup data.",
          });
          return;
        }
      }

      // Re-check if client already exists
      // const existsByEmail = await getClientsByEmail({ email: temp.email });
      // const existsByContact = await getClientsByMbMo({
      //   contact: temp.contact,
      // });

      // if (existsByEmail || existsByContact) {
      //   await t.rollback();
      //   res.status(409).json({
      //     success: false,
      //     message: "Email or Contact already registered.",
      //   });
      //   return;
      // }

      //  Create User in user table (OTP verified successfully)
      // ALWAYS create NEW user with userType: "client" for each client signup
      const secretCode = await generateUniqueSecretCode();
      const clientUser = await User.create(
        {
          firstName: temp.clientfirstName,
          lastName: temp.clientLastName,
          email: temp.email,
          contact: temp.contact,
          isdCode: temp.isdCode,
          isoCode: temp.isoCode,
          password: temp.password,
          userType: "client", // Always set as client
          isEmailVerified: isEmailVerified, // true if email OTP was verified
          isMobileVerified: isMobileVerified, // true if mobile OTP was verified
          isDeleted: false,
          isActive: true,
          authProvider: "email",
          secretCode,
          companyId: tempCompanyId || null,
        } as any,
        { transaction: t }
      );

      console.log(`[OTP Verification] New client user created: ${clientUser.id} with email: ${temp.email}`);

      // Create client (after OTP success)
      const client: any = await Clients.create(
        {
          // FKs — only if valid
          userId: clientUser ? clientUser.id : null,
          companyId: parentCompany ? parentCompany.id : null,
          userName: temp.userName || null,
          businessName: temp.businessName,
          clientfirstName: temp.clientfirstName,
          clientLastName: temp.clientLastName,
          email: temp.email,
          contact: temp.contact,
          isdCode: temp.isdCode,
          isoCode: temp.isoCode,
          // password: temp.password, // hashed by Clients model setter
          password: temp.password || null,
          // minimum required fields
          businessBase: temp.businessBase || "",
          country: temp.country || null,
          state: temp.state || null,
          city: temp.city || null,
          postcode: temp.postcode || null,
          address: temp.address || "",
          isEmailVerified: isEmailVerified, // true if email OTP was verified
          isMobileVerified: isMobileVerified, // true if mobile OTP was verified
          isActive: true,
          isDeleted: false,
          isVip: false,
          isRegistering: false,
          registrationStep: 0,
          isStatus: false,
          isApprove: false,
          isCredential: false,
          profileStatus: false,
          isFirstLogin: true,
          isassigned: false,
          // twofactorEnabled: false,
          // twofactorSecret: null,
          // twofactorVerified: false,
          // twofactorBackupCodes: null,
        },
        { transaction: t }
      );

      // Mark OTP as used & clear temp data
      otpRecord.set({
        otpVerify: true,
        isEmailVerified: true,
        isActive: false,
        otp: null,
        mbOTP: null,
        otpExpiresAt: null,
        tempUserData: null,
      });
      await otpRecord.save({ transaction: t });
      await otpRecord.destroy({ transaction: t });

      // Build token payload
      const tokenPayload: any = {
        clientId: client.id,
        userId: clientUser.id,
        email: client.email,
        role: "client",
      };
      if (parentCompany) tokenPayload.companyId = parentCompany.id;

      const token = await generateToken(tokenPayload, "7d");

      await t.commit();

      res.status(201).json({
        success: true,
        message: "Client signup successful!",
        data: {
          id: client.id,
          userId: clientUser.id,
          businessName: client.businessName,
          clientfirstName: client.clientfirstName,
          clientLastName: client.clientLastName,
          email: client.email,
          contact: client.contact,
          isdCode: client.isdCode,
          isoCode: client.isoCode,
          companyId: parentCompany ? parentCompany.id : null,
          token,
        },
      });
    } catch (err: any) {
      await t.rollback();
      console.error("[clients/signup/verify] ERROR:", err);
      ErrorLogger.write({ type: "clients/signup/verify error", error: err });
      res.status(500).json({ success: false, message: err.message || "Server error" });
    }
  }
);

// add agency client 
router.post("/clients/add", async (req: Request, res: Response): Promise<void> => {
  const t = await dbInstance.transaction();

  try {
    const {
      companyId,
      businessTypeId,
      businessSubCategoryIds,
      clientfirstName,
      clientLastName,
      email,
      contact,
      businessName,
      businessBase,
      businessWebsite,
      businessEmail,
      businessContact,
      businessExecutive,
      businessDescription,
      isoBusinessCode,
      isdBusinessCode,
      isoCode,
      isdCode,
      isVip,
      country,
      state,
      city,
      postcode,
      address,
      accounteHolderName,
      accountNumber,
      bankName,
      branchName,
      ifscCode,
      swiftCode,
      accountType,
      currency,
      taxVatId,
    } = req.body;

    //  Required fields
    if (!clientfirstName || !clientLastName || !email || !contact || !businessName || !address) {
      await t.rollback();
      res.status(400).json({
        success: false,
        message: "Required fields are missing.",
      });
      return;
    }

    //  Detect country codes for contact
    const finalIsdCode = detectCountryCode("+" + contact.replace(/\D/g, "")) || isdCode || null;
    const finalIsoCode = isoCode || null;

    //  Detect codes for business contact
    const finalIsdBusinessCode = businessContact
      ? detectCountryCode("+" + businessContact.replace(/\D/g, "")) || isdBusinessCode || null
      : isdBusinessCode || null;

    const finalIsoBusinessCode = isoBusinessCode || null;

    // Validate BusinessType + Subcategories
    let finalBusinessTypeId: number | null = null;
    let finalBusinessSubCategoryIds: number[] | null = null;

    if (businessTypeId) {
      const bt = await BusinessType.findByPk(businessTypeId, { transaction: t });
      if (!bt) {
        await t.rollback();
        res.status(400).json({ success: false, message: "Invalid businessTypeId." });
        return;
      }
      finalBusinessTypeId = bt.id;
    }

    if (Array.isArray(businessSubCategoryIds) && businessSubCategoryIds.length > 0) {
      const subcats = await BusinessSubcategory.findAll({
        where: { id: businessSubCategoryIds },
        transaction: t,
      });

      if (subcats.length !== businessSubCategoryIds.length) {
        await t.rollback();
        res.status(400).json({ success: false, message: "Invalid businessSubCategoryIds." });
        return;
      }

      if (finalBusinessTypeId) {
        const mismatch = subcats.some((s: any) => s.businessTypeId !== finalBusinessTypeId);
        if (mismatch) {
          await t.rollback();
          res.status(400).json({
            success: false,
            message: "Subcategories do not belong to the given businessTypeId.",
          });
          return;
        }
      }
      finalBusinessSubCategoryIds = businessSubCategoryIds;
    }

    // USER TABLE: Always create new user for each client (even with duplicate email/contact)
    const plainPassword = generateRandomPassword();
    const secretCode = await generateUniqueSecretCode();

    const clientUser = await User.create(
      {
        firstName: clientfirstName,
        lastName: clientLastName,
        email,
        contact,
        isdCode: finalIsdCode,
        isoCode: finalIsoCode,
        password: plainPassword,
        userType: "client", // Always set as client role
        isEmailVerified: true, // Email from admin is pre-verified
        isMobileVerified: false,
        isDeleted: false,
        isActive: true,
        authProvider: "email",
        secretCode,
        companyId: companyId || null,
      } as any,
      { transaction: t }
    );

    console.log(`[clients/add] New client user created: ${clientUser.id} with email: ${email}, contact: ${contact}`);

    // Create CLIENT record
    const payload = {
      userId: clientUser.id,
      companyId: companyId || clientUser.companyId || null,
      userName: null,
      clientfirstName,
      clientLastName,
      email,
      contact,
      isdCode: finalIsdCode,
      isoCode: finalIsoCode,
      password: plainPassword, // only useful when new user created
      businessName,
      businessBase: businessBase || "service",
      businessTypeId: finalBusinessTypeId,
      businessSubCategory: finalBusinessSubCategoryIds,
      businessWebsite,
      businessEmail,
      businessContact,
      businessExecutive,
      businessDescription,
      isoBusinessCode: finalIsoBusinessCode,
      isdBusinessCode: finalIsdBusinessCode,
      isVip: !!isVip,
      country,
      state,
      city,
      postcode,
      address,
      accounteHolderName,
      accountNumber,
      bankName,
      branchName,
      ifscCode,
      swiftCode,
      accountType,
      currency,
      taxVatId,
      profile: req.body.profile || null,
      isActive: true,
      isDeleted: false,
      isApprove: true,
      isCredential: false,
      profileStatus: false,
      isEmailVerified: true,
      isFirstLogin: true,
      isassigned: true,
    };

    const client = await addAgencyClient(payload, t);

    await t.commit();

    console.log(`[clients/add] Client added successfully with clientId: ${client.id}, userId: ${clientUser.id}`);

    // Send welcome email AFTER successful
    try {
      const welcomeEmailHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; background-color: #f4f4f4; }
            .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; }
            .header { background-color: #4CAF50; color: white; padding: 30px; text-align: center; }
            .header h1 { margin: 0; font-size: 28px; }
            .content { padding: 30px; }
            .content h2 { color: #4CAF50; margin-top: 0; }
            .credentials { background-color: #f9f9f9; padding: 20px; border-left: 4px solid #4CAF50; margin: 20px 0; }
            .credentials p { margin: 10px 0; }
            .credentials strong { color: #333; }
            .button { display: inline-block; padding: 12px 30px; background-color: #4CAF50; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
            .footer { text-align: center; padding: 20px; background-color: #f4f4f4; color: #666; font-size: 12px; }
            .footer p { margin: 5px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Welcome to ZarklyX!</h1>
            </div>
            <div class="content">
              <h2>Hi ${clientfirstName} ${clientLastName},</h2>
              <p>Congratulations! Your client account has been successfully created on <strong>ZarklyX</strong>.</p>
              <p>We're excited to have you on board. Your account is now ready to use.</p>
              
              <div class="credentials">
                <p><strong>Your Login Credentials:</strong></p>
                <p><strong>Email:</strong> ${email}</p>
                <p><strong>Password:</strong> ${plainPassword}</p>
                <p><strong>Business Name:</strong> ${businessName}</p>
              </div>
              
              <p>For security reasons, we strongly recommend that you change your password after your first login.</p>
              <p>You can update your password from your profile settings.</p>
              
              <p>If you have any questions or need assistance, feel free to reach out to our support team.</p>
              
              <p>Best regards,<br><strong>The ZarklyX Team</strong></p>
            </div>
            <div class="footer">
              <p>&copy; ${new Date().getFullYear()} ZarklyX. All rights reserved.</p>
              <p>This is an automated message. Please do not reply to this email.</p>
            </div>
          </div>
        </body>
        </html>
      `;

      await sendEmail({
        to: email,
        subject: "Welcome to ZarklyX - Your Account is Ready!",
        html: welcomeEmailHtml,
        text: `Hi ${clientfirstName} ${clientLastName}, Welcome to ZarklyX! Your account has been created. Email: ${email}, Password: ${plainPassword}. Please login and change your password from profile settings.`,
        from: "" as any,
        replacements: null,
        htmlFile: "" as any,
        attachments: null,
        cc: null,
        replyTo: null,
      });

      console.log(`[clients/add] Welcome email sent to ${email}`);
    } catch (emailError: any) {
      console.error("[clients/add] Failed to send welcome email:", emailError);
      ErrorLogger.write({ type: "clients/add email error", error: emailError });
      // Don't fail the response if email fails - client is already created
    }

    res.status(201).json({
      success: true,
      message: "Client added successfully.",
      data: {
        id: client.id,
        userId: clientUser.id, // Include the newly created user ID
        companyId: client.companyId,
        clientfirstName,
        clientLastName,
        email,
        contact,
        userType: "client", // Confirm user type
      },
    });
  } catch (error: any) {
    await t.rollback();
    console.error("[clients/add ERROR]", error);
    serverError(res, error.message || "Failed to create client.");
  }
});

// GET /clients
// Pagination + filters 
router.get("/clients/getAll", async (req: Request, res: Response): Promise<void> => {
  try {
    // query: ?limit=10&offset=0&search=abc&isActive=true&businessType=marketing&city=Surat
    const {
      search,
      ...restQuery
    } = req.query as { [key: string]: any; search?: string };

    // base result using generic handler (MakeQuery)
    const result: any = await getAllAgencyClient(restQuery);

    let rows = result.rows || result; // in case handler returns rows+count
    const count = result.count ?? rows.length;

    // optional "search" filter on name/email
    if (search) {
      const s = String(search).toLowerCase();
      rows = rows.filter((r: any) => {
        const fullName = `${r.clientfirstName || ""} ${r.clientLastName || ""}`.toLowerCase();
        const email = (r.email || "").toLowerCase();
        const businessName = (r.businessName || "").toLowerCase();
        return (
          fullName.includes(s) ||
          email.includes(s) ||
          businessName.includes(s)
        );
      });
    }

    const limit = Number(req.query.limit) || 10;
    const offset = Number(req.query.offset) || 0;

    res.status(200).json({
      success: true,
      message: "Clients fetched successfully.",
      data: rows,
      pagination: {
        total: count,
        limit,
        offset,
      },
    });
  } catch (error: any) {
    console.error("[GET /clients] ERROR:", error);
    ErrorLogger.write({ type: "get clients error", error });
    serverError(res, error.message || "Failed to fetch clients.");
  }
});

// GET /clients/:id
// Single client detail (edit form)
router.get("/clients/getById/:id",
  async (req: Request, res: Response): Promise<void> => {
    try {
      let id = req.params.id;
      if (Array.isArray(id)) id = id[0];
      console.log(id)
      if (!id || id.trim() === '') {
        res.status(400).json({
          success: false,
          message: "Invalid client id.",
        });
        return;
      }

      const client = await getagencyClientByid(id);

      if (!client) {
        notFound(res, "Client not found.");
        return;
      }

      res.status(200).json({
        success: true,
        message: "Client details fetched.",
        data: client,
      });
    } catch (error: any) {
      console.error("[GET /clients/:id] ERROR:", error);
      ErrorLogger.write({ type: "get client by id error", error });
      serverError(res, error.message || "Failed to fetch client details.");
    }
  }
);

router.get("/clients/by-user/:userId",
  async (req: Request, res: Response): Promise<void> => {
    console.log(req.params.userId);
    try {
      let { userId } = req.params;
      if (Array.isArray(userId)) userId = userId[0];

      if (!userId || userId.trim() === "") {
        res.status(400).json({
          success: false,
          message: "Invalid user id.",
        });
        return;
      }

      const client = await getAgencyClientByUserId(userId);

      if (!client) {
        notFound(res, "Client not found.");
        return;
      }

      res.status(200).json({
        success: true,
        message: "Client fetched by user id.",
        data: client,
      });
    } catch (error: any) {
      console.error("[GET /clients/by-user/:userId] ERROR:", error);
      ErrorLogger.write({ type: "get client by user id error", error });
      serverError(res, error.message || "Failed to fetch client.");
    }
  }
);

// PUT /clients/:id
// Full update (same fields as create)
router.put("/clients/updateById/:id", async (req: Request, res: Response): Promise<void> => {
  const t = await dbInstance.transaction();
  try {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) {
      await t.rollback();
      res.status(400).json({
        success: false,
        message: "Invalid client id.",
      });
      return;
    }

    const existing: any = await Clients.findByPk(id, { transaction: t });
    if (!existing) {
      await t.rollback();
      notFound(res, "Client not found.");
      return;
    }

    const {
      userId,
      companyId,

      // Personal
      clientfirstName,
      clientLastName,
      email,
      contact,
      isdCode,
      isoCode,

      // Business
      businessName,
      businessBase,

      businessTypeId,
      businessSubCategoryIds,
      businessWebsite,
      businessEmail,
      businessContact,
      isoBusinessCode,
      isdBusinessCode,
      businessDescription,
      isVip,

      // Address
      country,
      state,
      city,
      postcode,
      address,

      // Accounting
      accounteHolderName,
      accountNumber,
      bankName,
      branchName,
      ifscCode,
      swiftCode,
      accountType,
      currency,
      taxVatId,
    } = req.body;

    // validations (same as create)
    if (
      !clientfirstName ||
      !clientLastName ||
      !email ||
      !contact ||
      !businessName ||
      !country ||
      !state ||
      !city ||
      !postcode ||
      !address
    ) {
      await t.rollback();
      res.status(400).json({
        success: false,
        message: "Required fields are missing.",
      });
      return;
    }

    // Auto-detect country code again from contact
    const rawContact: string = String(contact).trim();
    const digitsOnly = rawContact.replace(/\D/g, "");
    let detectionNumber = rawContact;

    if (!rawContact.startsWith("+")) {
      if (digitsOnly.length === 10) {
        detectionNumber = `+91${digitsOnly}`;
      } else {
        detectionNumber = `+${digitsOnly}`;
      }
    }

    const autoCountryCode = detectCountryCode(detectionNumber);
    const finalIsdCode = isdCode || autoCountryCode || existing.isdCode || null;
    const finalIsoCode = isoCode || existing.isoCode || null;

    // Auto-detect business contact codes if businessContact is provided
    let finalIsdBusinessCode = existing.isdBusinessCode || null;
    let finalIsoBusinessCode = existing.isoBusinessCode || null;

    if (businessContact) {
      const rawBusinessContact: string = String(businessContact).trim();
      const digitsOnlyBusiness = rawBusinessContact.replace(/\D/g, "");
      let detectionNumberBusiness = rawBusinessContact;

      if (!rawBusinessContact.startsWith("+")) {
        if (digitsOnlyBusiness.length === 10) {
          detectionNumberBusiness = `+91${digitsOnlyBusiness}`;
        } else {
          detectionNumberBusiness = `+${digitsOnlyBusiness}`;
        }
      }

      const autoBusinessCountryCode = detectCountryCode(detectionNumberBusiness);
      finalIsdBusinessCode = isdBusinessCode || autoBusinessCountryCode || existing.isdBusinessCode || null;
      finalIsoBusinessCode = isoBusinessCode || existing.isoBusinessCode || null;
    }

    // Duplicate check for email/contact excluding self
    // const emailDup = await Clients.findOne({
    //   where: {
    //     email,
    //     id: { [Op.ne]: id },
    //   },
    //   transaction: t,
    // });

    // if (emailDup) {
    //   await t.rollback();
    //   res.status(409).json({
    //     success: false,
    //     message: "Email already used by another client.",
    //   });
    //   return;
    // }

    // const contactDup = await Clients.findOne({
    //   where: {
    //     contact,
    //     id: { [Op.ne]: id },
    //   },
    //   transaction: t,
    // });

    // if (contactDup) {
    //   await t.rollback();
    //   res.status(409).json({
    //     success: false,
    //     message: "Contact number already used by another client.",
    //   });
    //   return;
    // }

    //  BusinessType + Subcategory Logic
    let finalBusinessTypeId: number | null = existing.businessTypeId;
    let finalBusinessSubCategoryIds: number[] | null = existing.businessSubCategory;

    // Validate BusinessTypeId
    if (businessTypeId !== undefined && businessTypeId !== null) {
      const bt = await BusinessType.findByPk(businessTypeId, { transaction: t });
      if (!bt) {
        await t.rollback();
        res.status(400).json({ success: false, message: "Invalid businessTypeId." });
        return;
      }
      finalBusinessTypeId = bt.id;
    }

    // Validate BusinessSubCategoryIds
    if (businessSubCategoryIds !== undefined) {
      if (!Array.isArray(businessSubCategoryIds) || businessSubCategoryIds.length === 0) {
        finalBusinessSubCategoryIds = null;
      } else {
        const subcats = await BusinessSubcategory.findAll({
          where: { id: businessSubCategoryIds },
          transaction: t,
        });

        if (subcats.length !== businessSubCategoryIds.length) {
          await t.rollback();
          res.status(400).json({
            success: false,
            message: "One or more businessSubCategoryIds are invalid.",
          });
          return;
        }

        // Ensure subcategories belong to selected BusinessType
        const mismatch = subcats.some((s: any) => s.businessTypeId !== finalBusinessTypeId);
        if (mismatch) {
          await t.rollback();
          res.status(400).json({
            success: false,
            message: "Selected subcategories do not belong to given businessType.",
          });
          return;
        }

        finalBusinessSubCategoryIds = businessSubCategoryIds;
      }
    }

    // Update Payload
    const updatePayload: any = {
      userId: userId ?? existing.userId,
      companyId: companyId ?? existing.companyId,
      clientfirstName,
      clientLastName,
      email,
      contact,
      isdCode: finalIsdCode,
      isoCode: finalIsoCode,
      businessName,
      businessBase: businessBase ?? existing.businessBase,
      businessTypeId: finalBusinessTypeId,
      businessSubCategory: finalBusinessSubCategoryIds,
      businessWebsite: businessWebsite ?? existing.businessWebsite,
      businessEmail: businessEmail ?? existing.businessEmail,
      businessContact: businessContact ?? existing.businessContact,
      isoBusinessCode: finalIsoBusinessCode,
      isdBusinessCode: finalIsdBusinessCode,
      businessDescription: businessDescription ?? existing.businessDescription,
      isVip: typeof isVip === "boolean" ? isVip : existing.isVip,
      country,
      state,
      city,
      postcode,
      address,
      accounteHolderName: accounteHolderName ?? existing.accounteHolderName,
      accountNumber: accountNumber ?? existing.accountNumber,
      bankName: bankName ?? existing.bankName,
      branchName: branchName ?? existing.branchName,
      ifscCode: ifscCode ?? existing.ifscCode,
      swiftCode: swiftCode ?? existing.swiftCode,
      accountType: accountType ?? existing.accountType,
      currency: currency ?? existing.currency,
      taxVatId: taxVatId ?? existing.taxVatId,
      profile: req.body.profile ?? existing.profile,
    };

    await existing.update(updatePayload, { transaction: t });
    await t.commit();

    res.status(200).json({
      success: true,
      message: "Client updated successfully.",
      data: updatePayload,
    });
  } catch (error: any) {
    await t.rollback();
    console.error("[PUT /clients/updateById/:id] ERROR:", error);
    ErrorLogger.write({ type: "update client error", error });
    serverError(res, error.message || "Failed to update client.");
  }
}
);

// soft- delete
router.delete("/clients/deleteById/:id",
  async (req: Request, res: Response): Promise<void> => {
    const t = await dbInstance.transaction();
    try {
      const id = Number(req.params.id);
      if (Number.isNaN(id)) {
        await t.rollback();
        res.status(400).json({
          success: false,
          message: "Invalid client id.",
        });
        return;
      }

      const client = await Clients.findByPk(id, { transaction: t });

      if (!client) {
        await t.rollback();
        notFound(res, "Client not found.");
        return;
      }

      await client.update(
        { isActive: false, isDeleted: true },
        { transaction: t }
      );

      await t.commit();

      res.status(200).json({
        success: true,
        message: "Client deleted (soft delete) successfully.",
        data: { id: client.id },
      });
    } catch (error: any) {
      await t.rollback();
      console.error("[DELETE /clients/:id] ERROR:", error);
      ErrorLogger.write({ type: "delete client error", error });
      serverError(res, error.message || "Failed to delete client.");
    }
  }
);


// 1) Get only active (not deleted) clients
router.get("/clients/isNotDeleted",
  async (req: Request, res: Response): Promise<void> => {
    try {
      // Optional: pagination / query filters can be added here
      const clients = await Clients.findAll({
        where: { isDeleted: false }, // <- only not-deleted
        order: [["id", "DESC"]],
      });

      res.status(200).json({
        success: true,
        message: "Active clients fetched successfully.",
        data: clients,
      });
    } catch (error: any) {
      console.error("[GET /clients] ERROR:", error);
      ErrorLogger.write({ type: "fetch clients error", error });
      serverError(res, error.message || "Failed to fetch clients.");
    }
  }
);

// 2) Get only soft-deleted clients
router.get("/clients/isDeleted",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const deletedClients = await Clients.findAll({
        where: { isDeleted: true }, // <- only deleted
        order: [["id", "DESC"]],
      });

      res.status(200).json({
        success: true,
        message: "Soft-deleted clients fetched successfully.",
        data: deletedClients,
      });
    } catch (error: any) {
      console.error("[GET /clients/deleted] ERROR:", error);
      ErrorLogger.write({ type: "fetch deleted clients error", error });
      serverError(res, error.message || "Failed to fetch deleted clients.");
    }
  }
);

// 3) Restore (undo soft-delete)
router.patch("/clients/restore/:id",
  async (req: Request, res: Response): Promise<void> => {
    const t = await dbInstance.transaction();
    try {
      const id = Number(req.params.id);
      if (Number.isNaN(id)) {
        await t.rollback();
        res.status(400).json({
          success: false,
          message: "Invalid client id.",
        });
        return;
      }

      const client = await Clients.findByPk(id, { transaction: t });

      if (!client) {
        await t.rollback();
        notFound(res, "Client not found.");
        return;
      }

      await client.update(
        { isDeleted: false, isActive: true }, // restore flags
        { transaction: t }
      );

      await t.commit();

      res.status(200).json({
        success: true,
        message: "Client restored successfully.",
        data: { id: client.id },
      });
    } catch (error: any) {
      await t.rollback();
      console.error("[PATCH /clients/restore/:id] ERROR:", error);
      ErrorLogger.write({ type: "restore client error", error });
      serverError(res, error.message || "Failed to restore client.");
    }
  }
);

// get clients by companyid 
router.get("/clients/by-company/:companyId", async (req: Request, res: Response): Promise<void> => {
  try {
    const { companyId } = req.params;
    const { search } = req.query as { search?: string };

    if (!companyId) {
      res.status(400).json({
        success: false,
        message: "Company ID is required.",
      });
      return;
    }

    const limit = Number(req.query.limit) || 10;
    const offset = Number(req.query.offset) || 0;

    // OPTIMIZED: Single database query with parallel counts
    const result = await getClientDataWithCounts(companyId as string, "approved", { search }, limit, offset);

    res.status(200).json({
      success: true,
      message: "Approved and assigned clients fetched successfully for the company.",
      count: result.count,
      counts: result.counts,
      data: result.data,
      pagination: {
        total: result.count,
        limit,
        offset,
      },
    });
  } catch (error: any) {
    console.error("[GET /clients/by-company/:companyId] ERROR:", error);

    ErrorLogger.write({
      type: "get clients by company error",
      error,
    });

    res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch clients.",
    });
  }
});

// get unassigned clients by companyId (OPTIMIZED: Single efficient query)
router.get("/clients/unassigned/:companyId", async (req: Request, res: Response): Promise<void> => {
  try {
    const { companyId } = req.params;
    const { search } = req.query as { search?: string };

    if (!companyId) {
      res.status(400).json({
        success: false,
        message: "Company ID is required.",
      });
      return;
    }

    const limit = Number(req.query.limit) || 10;
    const offset = Number(req.query.offset) || 0;

    // OPTIMIZED: Single database query with parallel counts
    const result = await getClientDataWithCounts(companyId as string, "unassigned", { search }, limit, offset);

    res.status(200).json({
      success: true,
      message: "Unassigned clients fetched successfully for the company.",
      count: result.count,
      counts: result.counts,
      data: result.data,
      pagination: {
        total: result.count,
        limit,
        offset,
      },
    });
  } catch (error: any) {
    console.error("[GET /clients/unassigned/:companyId] ERROR:", error);

    ErrorLogger.write({
      type: "get unassigned clients by company error",
      error,
    });

    res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch unassigned clients.",
    });
  }
});

// get unapproved clients by companyId (OPTIMIZED: Single efficient query)
router.get("/clients/pending/:companyId", async (req: Request, res: Response): Promise<void> => {
  try {
    const { companyId } = req.params;
    const { search } = req.query as { search?: string };

    if (!companyId) {
      res.status(400).json({
        success: false,
        message: "Company ID is required.",
      });
      return;
    }

    const limit = Number(req.query.limit) || 10;
    const offset = Number(req.query.offset) || 0;

    // OPTIMIZED: Single database query with parallel counts
    const result = await getClientDataWithCounts(companyId as string, "pending", { search }, limit, offset);

    res.status(200).json({
      success: true,
      message: "Pending (unapproved) clients fetched successfully for the company.",
      count: result.count,
      counts: result.counts,
      data: result.data,
      pagination: {
        total: result.count,
        limit,
        offset,
      },
    });
  } catch (error: any) {
    console.error("[GET /clients/pending/:companyId] ERROR:", error);

    ErrorLogger.write({
      type: "get pending clients by company error",
      error,
    });

    res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch pending clients.",
    });
  }
});

// Approve client (set isApprove = 1)
router.post("/approve/:clientId", async (req: Request, res: Response): Promise<void> => {
  const t = await dbInstance.transaction();
  try {
    let { clientId } = req.params;
    if (Array.isArray(clientId)) clientId = clientId[0];

    if (!clientId || clientId.trim() === "") {
      await t.rollback();
      res.status(400).json({
        success: false,
        message: "Invalid client ID.",
      });
      return;
    }

    const client = await Clients.findByPk(clientId, { transaction: t });

    if (!client) {
      await t.rollback();
      res.status(404).json({
        success: false,
        message: "Client not found.",
      });
      return;
    }

    await client.update(
      { isApprove: true },
      { transaction: t }
    );

    await t.commit();

    res.status(200).json({
      success: true,
      message: "Client approved successfully.",
      data: {
        id: client.id,
        clientfirstName: client.clientfirstName,
        clientLastName: client.clientLastName,
        email: client.email,
        isApprove: true,
      },
    });
  } catch (error: any) {
    await t.rollback();
    console.error("[POST /clients/approve/:clientId] ERROR:", error);
    ErrorLogger.write({ type: "approve client error", error });
    res.status(500).json({
      success: false,
      message: error.message || "Failed to approve client.",
    });
  }
});

// Reject client (soft delete)
router.post("/reject/:clientId", async (req: Request, res: Response): Promise<void> => {
  const t = await dbInstance.transaction();
  try {
    let { clientId } = req.params;
    if (Array.isArray(clientId)) clientId = clientId[0];

    if (!clientId || clientId.trim() === "") {
      await t.rollback();
      res.status(400).json({
        success: false,
        message: "Invalid client ID.",
      });
      return;
    }

    const client = await Clients.findByPk(clientId, { transaction: t });

    if (!client) {
      await t.rollback();
      res.status(404).json({
        success: false,
        message: "Client not found.",
      });
      return;
    }

    await client.destroy({ transaction: t });

    await t.commit();

    res.status(200).json({
      success: true,
      message: "Client rejected and deleted successfully.",
      data: {
        id: clientId,
        clientfirstName: client.clientfirstName,
        clientLastName: client.clientLastName,
        email: client.email,
        isDeleted: true,
      },
    });
  } catch (error: any) {
    await t.rollback();
    console.error("[POST /clients/reject/:clientId] ERROR:", error);
    ErrorLogger.write({ type: "reject client error", error });
    res.status(500).json({
      success: false,
      message: error.message || "Failed to reject client.",
    });
  }
});


// check the user exists for the company
router.post("/clients/validate-company-user", async (req: Request, res: Response): Promise<void> => {
  try {
    console.log(req.body, 'jdhew');
    const { companyId, email, contact } = req.body;
    console.log(companyId, email, contact, 'jdhew2');

    if (!companyId || (!email && !contact)) {
      res.status(400).json({
        success: false,
        message: "companyId and email or contact is required",
      });
      return;
    }

    // 🔍 check user belongs to company
    const user = await User.findOne({
      where: {
        companyId,
        ...(email ? { email } : {}),
        ...(contact ? { contact } : {}),
        isDeleted: false,
        isActive: true,
      },
      attributes: ["id", "email", "contact", "userType", "companyId"],
    });

    if (!user) {
      res.status(404).json({
        success: false,
        message: "No user information available",
        data: {
          isValid: false,
        },
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: "User is valid for this company",
      data: {
        isValid: true,
        userId: user.id,
        email: user.email,
        contact: user.contact,
        userType: user.userType,
        companyId: user.companyId,
      },
    });
  } catch (error: any) {
    console.error("[validate-user ERROR]", error);
    res.status(500).json({
      success: false,
      message: "Failed to validate user",
    });
  }
}
);
// Add this after the existing Google auth endpoints

/**
 * POST /clients/login
 * Client login with:
 * 1. email + OTP (no 2FA required)
 * 2. email/contact + password (2FA required if enabled)
 */
router.post("/clients/login", async (req: Request, res: Response): Promise<void> => {

  const t = await dbInstance.transaction();

  try {
    const { email, contact, password, otp, twofactorToken, backupCode } = req.body;

    // ===============================
    // EMAIL + OTP LOGIN (user table)
    // ===============================
    if (email && otp) {
      const user: any = await User.findOne({
        where: { email, isDeleted: false },
        transaction: t,
      });

      // Ensure OTP record exists and is valid (not used and not expired)
      const otpRecord: any = await Otp.findOne({
        where: {
          email,
          otp: String(otp),
          otpVerify: false,
          otpExpiresAt: { [Op.gt]: new Date() },
        },
        transaction: t,
      });

      if (!user || !otpRecord) {
        await t.rollback();
        res.status(401).json({ success: false, message: "Invalid email or OTP." });
        return;
      }

      if (!user.isActive) {
        await t.rollback();
        res.status(403).json({
          success: false,
          message: "Your account is deactivated. Please contact support.",
        });
        return;
      }

      // Mark OTP as used
      otpRecord.set({ otpVerify: true, otp: null, otpExpiresAt: null });
      await otpRecord.save({ transaction: t });

      // Ensure user's email verified flag is set
      if (!user.isEmailVerified) {
        await user.update({ isEmailVerified: true }, { transaction: t });
      }

      const isFirstLogin = user.isFirstLogin || false;
      if (isFirstLogin) {
        await user.update({ isFirstLogin: false }, { transaction: t });
      }

      const token = await generateToken(
        { userId: user.id, email: user.email, role: "client", companyId: user.companyId },
        "7d"
      );

      await t.commit();

      res.status(200).json({
        success: true,
        message: "Login successful!",
        data: {
          userId: user.id,
          email: user.email || email,
          contact: user.contact || null,
          companyId: user.companyId,
          firstName: user.firstName,
          lastName: user.lastName,
          isFirstLogin,
          token,
          twofactorEnabled: user.twofactorEnabled || false,
        },
      });
      return;
    }

    // =====================================
    // EMAIL / CONTACT + PASSWORD LOGIN
    // =====================================
    if ((email || contact) && password) {
      const whereClause: any = { isDeleted: false };
      if (email) whereClause.email = email;
      if (contact) whereClause.contact = contact;

      const user: any = await User.findOne({ where: whereClause, transaction: t });

      if (!user || !user.validatePassword(password)) {
        await t.rollback();
        res.status(401).json({ success: false, message: "Invalid credentials." });
        return;
      }

      if (!user.isActive) {
        await t.rollback();
        res.status(403).json({
          success: false,
          message: "Your account is deactivated. Please contact support.",
        });
        return;
      }

      // ==============
      // 2FA HANDLING
      // ==============
      if (user.twofactorEnabled && user.twofactorVerified) {
        if (!twofactorToken && !backupCode) {
          await t.rollback();
          res.status(200).json({
            success: true,
            requires2FA: true,
            message: "Password verified. Please provide 2FA code.",
            data: { userId: user.id, email: user.email, twofactorEnabled: true },
          });
          return;
        }

        if (twofactorToken) {
          const verified = speakeasy.totp.verify({
            secret: user.twofactorSecret,
            encoding: "base32",
            token: String(twofactorToken),
            window: 2,
          });

          if (!verified) {
            await t.rollback();
            res.status(401).json({ success: false, requires2FA: true, message: "Invalid 2FA token." });
            return;
          }
        }

        if (backupCode) {
          const backupCodes = user.twofactorBackupCodes || [];
          const index = backupCodes.findIndex((code: string) => code === String(backupCode).toUpperCase());
          if (index === -1) {
            await t.rollback();
            res.status(401).json({ success: false, requires2FA: true, message: "Invalid backup code." });
            return;
          }
          backupCodes.splice(index, 1);
          await user.update({ twofactorBackupCodes: backupCodes }, { transaction: t });
        }
      }

      const isFirstLogin = user.isFirstLogin || false;
      if (isFirstLogin) await user.update({ isFirstLogin: false }, { transaction: t });

      const token = await generateToken(
        { userId: user.id, email: user.email || email, role: "user", companyId: user.companyId },
        "7d"
      );

      await t.commit();

      res.status(200).json({
        success: true,
        message: "Login successful!",
        data: {
          userId: user.id,
          email: user.email || email || null,
          contact: user.contact || contact || null,
          companyId: user.companyId,
          firstName: user.firstName,
          lastName: user.lastName,
          isFirstLogin,
          token,
          twofactorEnabled: user.twofactorEnabled || false,
        },
      });
      return;
    }

    await t.rollback();
    res.status(400).json({ success: false, message: "Invalid login request." });

  } catch (error: any) {
    await t.rollback();
    console.error("[POST /clients/login] ERROR:", error);
    ErrorLogger.write({ type: "user login error", error });
    serverError(res, error.message || "Login failed.");
  }
});



/**
 * POST /clients/verify-2fa
 * Standalone endpoint to verify 2FA during login
 * Used when login returns requires2FA: true
 */
router.post("/clients/verify-2fa",
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
          secretCode: client.secretCode || null,
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


// Check if client exists (for signup/signin flow)
router.post("/check-client-exists", async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, contact } = req.body;

    // Validation
    if (!email && !contact) {
      serverError(res, "Email or contact is required");
      return;
    }

    // Build search condition
    const whereCondition: any = {
      [Op.or]: [],
    };

    if (email) {
      whereCondition[Op.or].push({ email });
    }
    if (contact) {
      whereCondition[Op.or].push({ contact });
    }

    // Check if client exists
    const client = await Clients.findOne({
      where: whereCondition,
      attributes: ["id", "email", "contact", "isEmailVerified"],
      raw: true,
    });

    if (client) {
      // Client exists
      res.status(200).json({
        success: true,
        exists: true,
        isEmailVerified: client.isEmailVerified,
        message: "Client already registered. Please sign in.",
      });
    } else {
      // Client does not exist
      res.status(200).json({
        success: true,
        exists: false,
        message: "Client not registered. Please sign up first.",
      });
    }
  } catch (error: any) {
    console.error("Error in /check-client-exists:", error);
    serverError(res, "Error checking client existence");
  }
});

// Validate URL by companyId or userName and return branding assets
// Usage: GET /auth/validate-url?companyId=<id>  OR  /auth/validate-url?userName=<name>
router.get("/client/validate-url",
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { companyId, userName } = req.query as { companyId?: string; userName?: string };

      if (!companyId && !userName) {
        res.status(400).json({ success: false, message: "companyId or userName is required" });
        return;
      }

      // Use handler to validate and get branding assets
      const result = await validateCompanyUrlAndBranding(companyId, userName);

      if (!result) {
        res.status(404).json({ success: false, message: "Not found or invalid URL", data: { isValid: false } });
        return;
      }

      // Return company branding assets along with companyId and userName
      res.status(200).json({
        success: true,
        message: "Valid URL",
        data: result,
      });
    } catch (error: any) {
      console.error("[/client/auth/validate-url] ERROR:", error);
      ErrorLogger.write({ type: "validate-url error", error });
      serverError(res, error.message || "Validation failed.");
    }
  }
);

// ========================= CLIENT TWO-FACTOR AUTHENTICATION =========================
// Protected routes require a valid client token

// POST /clients/2fa/setup
// Generate a TOTP secret for the authenticated client and return otpauth URL + QR code
router.post(
  "/clients/2fa/setup",
  tokenMiddleWare,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const authUser: any = (req as any).user;
      if (!authUser || !authUser.clientId) {
        unauthorized(res, "Invalid or missing token client.");
        return;
      }

      const client: any = await Clients.findByPk(authUser.clientId);
      if (!client || client.isDeleted) {
        unauthorized(res, "Client not found.");
        return;
      }

      // Generate secret
      const secret = speakeasy.generateSecret({ name: `ZarklyX (${client.email || client.userName || 'client'})` });

      // Persist secret (not yet verified)
      await client.update({ twofactorSecret: secret.base32, twofactorVerified: false }, { silent: true });

      // Create QR code data URL
      const qrCode = await QRCode.toDataURL(secret.otpauth_url || "");

      res.status(200).json({
        success: true,
        message: "2FA setup initiated. Scan QR with an authenticator app and verify to enable.",
        data: {
          otpauth_url: secret.otpauth_url,
          qrCode,
          secret: secret.base32,
        },
      });
      return;
    } catch (error: any) {
      console.error("[/clients/2fa/setup] ERROR:", error);
      ErrorLogger.write({ type: "clients 2fa setup error", error });
      serverError(res, error.message || "2FA setup failed.");
      return;
    }
  }
);

// POST /clients/2fa/enable
// Verify a TOTP token and enable 2FA; returns one-time backup codes
router.post(
  "/clients/2fa/enable",
  tokenMiddleWare,
  async (req: Request, res: Response): Promise<void> => {
    const t = await dbInstance.transaction();
    try {
      const authUser: any = (req as any).user;
      if (!authUser || !authUser.clientId) {
        await t.rollback();
        unauthorized(res, "Invalid or missing token client.");
        return;
      }

      const { twofactorToken } = req.body;
      if (!twofactorToken) {
        await t.rollback();
        res.status(400).json({ success: false, message: "2FA token is required to enable 2FA." });
        return;
      }

      const client: any = await Clients.findByPk(authUser.clientId, { transaction: t });
      if (!client || client.isDeleted) {
        await t.rollback();
        unauthorized(res, "Client not found.");
        return;
      }

      if (!client.twofactorSecret) {
        await t.rollback();
        res.status(400).json({ success: false, message: "2FA secret not found. Please initiate setup first." });
        return;
      }

      const verified = speakeasy.totp.verify({
        secret: client.twofactorSecret,
        encoding: "base32",
        token: String(twofactorToken),
        window: 2,
      });

      if (!verified) {
        await t.rollback();
        res.status(401).json({ success: false, message: "Invalid 2FA token." });
        return;
      }

      // Generate backup codes (8 codes)
      const backupCodes: string[] = [];
      for (let i = 0; i < 8; i++) {
        const code = Math.random().toString(36).slice(2, 10).toUpperCase();
        backupCodes.push(code);
      }

      await client.update({ twofactorEnabled: true, twofactorVerified: true, twofactorBackupCodes: backupCodes }, { transaction: t });

      await t.commit();

      res.status(200).json({
        success: true,
        message: "Two-factor authentication enabled.",
        data: {
          backupCodes,
        },
      });
      return;
    } catch (error: any) {
      await t.rollback();
      console.error("[/clients/2fa/enable] ERROR:", error);
      ErrorLogger.write({ type: "clients 2fa enable error", error });
      serverError(res, error.message || "Failed to enable 2FA.");
      return;
    }
  }
);

// POST /clients/2fa/disable
// Disable 2FA after verifying the client's password or a valid TOTP/backup code
router.post(
  "/clients/2fa/disable",
  tokenMiddleWare,
  async (req: Request, res: Response): Promise<void> => {
    const t = await dbInstance.transaction();
    try {
      const authUser: any = (req as any).user;
      if (!authUser || !authUser.clientId) {
        await t.rollback();
        unauthorized(res, "Invalid or missing token client.");
        return;
      }

      const { password, twofactorToken, backupCode } = req.body;
      if (!password && !twofactorToken && !backupCode) {
        await t.rollback();
        res.status(400).json({ success: false, message: "Password or 2FA token/backup code is required to disable 2FA." });
        return;
      }

      const client: any = await Clients.findByPk(authUser.clientId, { transaction: t });
      if (!client || client.isDeleted) {
        await t.rollback();
        unauthorized(res, "Client not found.");
        return;
      }

      let authorized = false;

      // Password check (if password exists on client)
      if (password && client.validatePassword && client.validatePassword(password)) {
        authorized = true;
      }

      // TOTP check
      if (!authorized && twofactorToken && client.twofactorSecret) {
        const verified = speakeasy.totp.verify({
          secret: client.twofactorSecret,
          encoding: "base32",
          token: String(twofactorToken),
          window: 2,
        });
        if (verified) authorized = true;
      }

      // Backup code check
      if (!authorized && backupCode) {
        const backupCodes = client.twofactorBackupCodes || [];
        const idx = backupCodes.findIndex((c: string) => c === String(backupCode).toUpperCase());
        if (idx !== -1) {
          // remove used code
          const updated = backupCodes.filter((_: string, i: number) => i !== idx);
          await client.update({ twofactorBackupCodes: updated }, { transaction: t });
          authorized = true;
        }
      }

      if (!authorized) {
        await t.rollback();
        res.status(401).json({ success: false, message: "Unauthorized to disable 2FA." });
        return;
      }

      await client.update({ twofactorEnabled: false, twofactorSecret: null, twofactorVerified: false, twofactorBackupCodes: null }, { transaction: t });

      await t.commit();
      res.status(200).json({ success: true, message: "Two-factor authentication disabled." });
      return;
    } catch (error: any) {
      await t.rollback();
      console.error("[/clients/2fa/disable] ERROR:", error);
      ErrorLogger.write({ type: "clients 2fa disable error", error });
      serverError(res, error.message || "Failed to disable 2FA.");
      return;
    }
  }
);

// POST /clients/2fa/regenerate-backup-codes
// Regenerate backup codes after verifying password or TOTP
router.post(
  "/clients/2fa/regenerate-backup-codes",
  tokenMiddleWare,
  async (req: Request, res: Response): Promise<void> => {
    const t = await dbInstance.transaction();
    try {
      const authUser: any = (req as any).user;
      if (!authUser || !authUser.clientId) {
        await t.rollback();
        unauthorized(res, "Invalid or missing token client.");
        return;
      }

      const { password, twofactorToken } = req.body;
      if (!password && !twofactorToken) {
        await t.rollback();
        res.status(400).json({ success: false, message: "Password or 2FA token is required to regenerate backup codes." });
        return;
      }

      const client: any = await Clients.findByPk(authUser.clientId, { transaction: t });
      if (!client || client.isDeleted) {
        await t.rollback();
        unauthorized(res, "Client not found.");
        return;
      }

      let authorized = false;
      if (password && client.validatePassword && client.validatePassword(password)) authorized = true;
      if (!authorized && twofactorToken && client.twofactorSecret) {
        const verified = speakeasy.totp.verify({ secret: client.twofactorSecret, encoding: "base32", token: String(twofactorToken), window: 2 });
        if (verified) authorized = true;
      }

      if (!authorized) {
        await t.rollback();
        res.status(401).json({ success: false, message: "Unauthorized to regenerate backup codes." });
        return;
      }

      // Generate new backup codes
      const backupCodes: string[] = [];
      for (let i = 0; i < 8; i++) {
        const code = Math.random().toString(36).slice(2, 10).toUpperCase();
        backupCodes.push(code);
      }

      await client.update({ twofactorBackupCodes: backupCodes }, { transaction: t });

      await t.commit();
      res.status(200).json({ success: true, message: "Backup codes regenerated.", data: { backupCodes } });
      return;
    } catch (error: any) {
      await t.rollback();
      console.error("[/clients/2fa/regenerate-backup-codes] ERROR:", error);
      ErrorLogger.write({ type: "clients 2fa regen backup codes error", error });
      serverError(res, error.message || "Failed to regenerate backup codes.");
      return;
    }
  }
);

/**
 * POST /clients/upload-profile/:clientId
 * Upload client profile photo
 */
router.post(
  "/upload-profile/:clientId",
  tokenMiddleWare,
  clientProfilePhotoUpload.single("file"),
  async (req: Request, res: Response): Promise<any> => {
    console.log(res.req.file, 'fileinfo');

    const t = await dbInstance.transaction();
    try {
      let { clientId } = req.params;
      if (Array.isArray(clientId)) clientId = clientId[0];
      const userId: any = (req as any).user?.id;

      if (!clientId || !userId) {
        await t.rollback();
        return serverError(res, "Client ID and User ID are required");
      }

      if (!req.file) {
        await t.rollback();
        return serverError(res, "Profile image file is required");
      }

      // Verify client exists
      const client = await Clients.findByPk(clientId);
      if (!client) {
        await t.rollback();
        return notFound(res, "Client not found");
      }

      // Construct the relative path for storage
      const profilePath = `/client/profile/${req.file.filename}`;

      // Update client with profile image path
      await Clients.update(
        { profile: profilePath },
        { where: { id: clientId }, transaction: t }
      );

      await t.commit();

      return res.status(200).json({
        success: true,
        message: "Profile image uploaded successfully",
        data: {
          clientId,
          profile: profilePath,
          filename: req.file.filename,
        },
      });
    } catch (error: any) {
      await t.rollback();
      ErrorLogger.write({ type: "uploadClientProfile error", error });
      return serverError(
        res,
        error?.message || "Failed to upload profile image"
      );
    }
  }
);

/**
 * PATCH /clients/remove-profile/:clientId
 * Remove client profile photo (Admin/Owner only)
 */
router.patch(
  "/remove-profile/:clientId",
  tokenMiddleWare,
  async (req: Request, res: Response): Promise<any> => {
    const t = await dbInstance.transaction();
    try {
      let { clientId } = req.params;
      if (Array.isArray(clientId)) clientId = clientId[0];
      const userId: any = (req as any).user?.id;

      if (!clientId || !userId) {
        await t.rollback();
        return serverError(res, "Client ID and User ID are required");
      }

      // Get client to verify it exists and get current profile path
      const client = await Clients.findByPk(clientId);
      if (!client) {
        await t.rollback();
        return notFound(res, "Client not found");
      }

      // Get current profile path for file deletion
      const currentProfilePath = client.dataValues.profile;

      // Update client to remove the profile image
      await Clients.update(
        { profile: null },
        { where: { id: clientId }, transaction: t }
      );

      // Delete file from disk if it exists
      if (currentProfilePath) {
        try {
          const fs = require("fs").promises;
          const path = require("path");
          const filePath = path.join(
            process.cwd(),
            "src",
            "public",
            currentProfilePath.replace(/^\//, "")
          );
          await fs.unlink(filePath).catch(() => { }); // Silently ignore if file doesn't exist
        } catch (err) {
          console.warn(`Failed to delete file at ${currentProfilePath}:`, err);
        }
      }

      await t.commit();

      return res.status(200).json({
        success: true,
        message: "Profile image removed successfully",
        data: {
          clientId,
          removed: true,
        },
      });
    } catch (error: any) {
      await t.rollback();
      ErrorLogger.write({ type: "removeClientProfile error", error });
      return serverError(
        res,
        error?.message || "Failed to remove profile image"
      );
    }
  }
);

export default router;

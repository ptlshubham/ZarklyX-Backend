import express from "express";
import { Request, Response } from "express";
import { notFound } from "../../../../services/response";
import dbInstance from "../../../../db/core/control-db";
import {
  alreadyExist,
  serverError,
  unauthorized,
  sendEncryptedResponse,
  other,
} from "../../../../utils/responseHandler";
import {
  generateOTP
} from "../../../../services/password-service";
import { sendOTP } from "../../../../services/otp-service";
import { generateToken, tokenMiddleWare } from "../../../../services/jwtToken-service";
import { hashPassword, checkPassword, generateRandomPassword } from "../../../../services/password-service";
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
} from "../../../../routes/api-webapp/agency/clients/clients-handler";
import { User } from "../../../../routes/api-webapp/authentication/user/user-model";
import { detectCountryCode, } from "../../../../services/phone-service";
import { BusinessType } from "../../../../routes/api-webapp/superAdmin/generalSetup/businessType/businessType-model";
import { BusinessSubcategory } from "../../../../routes/api-webapp/superAdmin/generalSetup/businessType/businessSubcategory-model";
import { Company } from "../../../../routes/api-webapp/company/company-model";
import { sendMobileOTP } from "../../../../services/otp-service";
import { OAuth2Client } from "google-auth-library";

const router = express.Router();

// Initialize Google OAuth2 Client
const googleClient = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID || ""
);

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
    const user = await User.create(
      {
        firstName,
        lastName,
        email: googleEmail,
        contact: null,
        isdCode: null,
        isoCode: null,
        password: generateRandomPassword(),
        userType: "client",
        isEmailVerified: emailVerified,
        isMobileVerified: false,
        isDeleted: false,
        isActive: true,
        authProvider: "google",
        googleId,
        companyId: null,
      } as any,
      { transaction: t }
    );

    // Create client record with comprehensive field mapping
    const client = await Clients.create(
      {
        userId: user.id,
        companyId: null,
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
        isoCode: null,
        isdCode: null,
        country: null,
        state: null,
        city: null,
        postcode: null,
        address: "",
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

// signup for client (Agency)
router.post("/clientSignup/start",
  async (req: Request, res: Response): Promise<void> => {
    const t = await dbInstance.transaction();

    try {
      const {
        userId,
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
        !userId ||
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

      // 2) Validate USER and COMPANY mapping
      const parentUser: any = await User.findByPk(userId, { transaction: t });

      if (!parentUser) {
        await t.rollback();
        res.status(400).json({
          success: false,
          message: "Invalid userId. User not found.",
        });
        return;
      }

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

      // user.companyId must match given companyId
      if (parentUser.companyId && parentUser.companyId !== parentCompany.id) {
        await t.rollback();
        res.status(403).json({
          success: false,
          message:
            "User is not linked with this company. Please check userId / companyId.",
        });
        return;
      }

      // Build safe userName from DB (DB is source of truth)
      const actualUserName =
        `${parentUser.firstName || ""} ${parentUser.lastName || ""}`.trim() ||
        parentUser.email ||
        parentUser.contact ||
        `User-${parentUser.id}`;

      //  userName only for logging 
      if (userNameFromFE && userNameFromFE !== actualUserName) {
        console.warn("[clientSignup/start] userName mismatch, using DB value:", {
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
          userId: parentUser.id, // parent user link
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
            userId: parentUser.id,
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
          userId: parentUser.id,
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

      // 1) Find valid OTP record (verify with EITHER email or mobile OTP)
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

      // 2) Read + parse tempUserData safely
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
      // 3) Validate parent User & Company (FK safety)
      let parentUser: User | null = null;
      if (tempUserId) {
        parentUser = await User.findByPk(tempUserId, { transaction: t });
        if (!parentUser) {
          await t.rollback();
          res.status(400).json({
            success: false,
            message: "Invalid userId in signup data. Please login again.",
          });
          return;
        }
      }

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

      // 4) Re-check if client already exists
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

      // 5) Create User in user table (OTP verified successfully)
      // ALWAYS create NEW user with userType: "client" for each client signup
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
          companyId: tempCompanyId || null,
        } as any,
        { transaction: t }
      );

      console.log(`[OTP Verification] New client user created: ${clientUser.id} with email: ${temp.email}`);

      // 5B) Create client (after OTP success)
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

          // country: temp.country || "",
          // state: temp.state || "",
          // city: temp.city || "",
          // postcode: temp.postcode || "",
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
          twofactorEnabled: false,
          twofactorSecret: null,
          twofactorVerified: false,
          twofactorBackupCodes: null,
        },
        { transaction: t }
      );

      // 6) Mark OTP as used & clear temp data
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

      // 7) Build token payload
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

    const clientUser = await User.create(
      {
        firstName: clientfirstName,
        lastName: clientLastName,
        email,
        contact,
        isdCode: finalIsdCode,
        isoCode: finalIsoCode,
        password: plainPassword,
        userType: "client", // ⭐ Always set as client role
        isEmailVerified: true, // Email from admin is pre-verified
        isMobileVerified: false,
        isDeleted: false,
        isActive: true,
        authProvider: "email",
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
      isActive: true,
      isDeleted: false,
      isApprove: false,
      isCredential: false,
      profileStatus: false,
      isEmailVerified: true,
      isFirstLogin: true,
    };

    const client = await addAgencyClient(payload, t);

    // Send welcome email with credentials
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

    await t.commit();

    console.log(`[clients/add] Client added successfully with clientId: ${client.id}, userId: ${clientUser.id}`);

    res.status(201).json({
      success: true,
      message: "Client added successfully.",
      data: {
        id: client.id,
        userId: clientUser.id, // ✅ Include the newly created user ID
        companyId: client.companyId,
        clientfirstName,
        clientLastName,
        email,
        contact,
        userType: "client", // ✅ Confirm user type
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
      const id = Number(req.params.id);
      if (Number.isNaN(id)) {
        res.status(400).json({
          success: false,
          message: "Invalid client id.",
        });
        return;
      }

      const client = await getagencyClientByid(String(id));

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

// get clients by companyid 
router.get("/clients/by-company/:companyId", async (req: Request, res: Response) : Promise<void>=> {
    try {
        const { companyId } = req.params;
        const { search, ...restQuery } = req.query as {
            [key: string]: any;
            search?: string;
        };

        if (!companyId) {
            res.status(400).json({
                success: false,
                message: "Company ID is required.",
            });
            return;
        }

        const limit = Number(req.query.limit) || 10;
        const offset = Number(req.query.offset) || 0;

        // Pass companyId to your handler
        const queryForHandler = {
            ...restQuery,
            companyId,
        };

        // Fetch from DB using your handler
        const result: any = await getAllAgencyClient(queryForHandler);

        let rows = result.rows || result;    // Might be (rows + count) or only rows
        let count = result.count ?? rows.length;

        // ---------- SEARCH FILTER ----------
    if (search) {
      const s = search.toString().toLowerCase();

      rows = rows.filter((r: any) => {
        const fullName = `${r.clientfirstName || ""} ${r.clientLastName || ""}`
          .trim()
          .toLowerCase();

        const email = (r.email || "").toLowerCase();
        const businessName = (r.businessName || "").toLowerCase();

        return (
          fullName.includes(s) ||
          email.includes(s) ||
          businessName.includes(s)
        );
      });

      count = rows.length; // update count after search
    }

        // ---------- PAGINATION ----------
        const paginatedRows = rows.slice(offset, offset + limit);

        // ---------- RESPONSE ----------
        res.status(200).json({
            success: true,
            message: "Clients fetched successfully for the company.",
            data: paginatedRows,
            pagination: {
                total: count,
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

export default router;

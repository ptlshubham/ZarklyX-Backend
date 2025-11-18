import express from "express";
import jwt from "jsonwebtoken";
import { Request, Response } from "express";
import {
  createOtp,
  getAllOtp,
  OtpType,
  OtpFlow,
} from "./otp-handler";
import {
  alreadyExist,
  serverError,
  unauthorized,
} from "../../../utils/responseHandler";
import { other, notFound } from "../../../services/response"
import { sendEncryptedResponse } from "../../../services/encryptResponse-service";
import dbInstance from "../../../db/core/control-db";
import ErrorLogger from "../../../db/core/logger/error-logger";
import {
  generateOTP
} from "../../../services/password-service";
import { sendEmail } from "../../../services/mailService";
import { generateToken } from "../../../services/jwtToken-service";
import { tokenMiddleWare } from "../../../services/jwtToken-service";
import { Otp } from "../../api-webapp/otp/otp-model";
import { User } from "../../../routes/api-webapp/user/user-model";
import { sendOTP } from "../../../services/otp-service";
// import OtpTempStore  from "./otp-temp-store";

const router = express.Router();
// type Params = { id: string };


// Test route to generate token
// router.get("/test-token", async (req: Request, res: Response) => {
//   try {
//     // Sample payload (you can modify this to whatever you need)
//     const payload = {
//       userId: "12345",  // Example user ID
//       role: "driver",   // Example role
//     };

//     // Generate the token using the payload
//     const token = await generateToken(payload, "1d");  // Expires in 1 day

//     // Send a successful response with the token
//     // return sendEncryptedResponse(
//     //   res,
//     //   { token },
//     //   "Token generated successfully."
//     // );
//     return res.status(200).json({
//       success: true,
//       message: "Token generated successfully.",
//       token: token, 
//     });
//   } catch (error) {
//     console.error("Token Generation Error:", error);
//     return serverError(res, "Something went wrong during token generation.");
//   }
// });


//rinkal : latest send-otp and verify-otp code 
router.post(
  "/send-otp",
  async (req: Request, res: Response) => {
    try {
      const bodyData = req.body;

      const email: string | undefined = bodyData.email;
      const contact: string | undefined =
        bodyData.contact || bodyData.contact;

      const otpFlow: OtpFlow = bodyData.otpFlow || "register";

      // Email or Mobile (provided)
      if (!email && !contact) {
        return serverError(res, "Email or mobile number is required.");
      }

      // User find condition
      const whereCondition: any = {};
      if (email) whereCondition.email = email;
      if (contact) whereCondition.contact = contact;

      // Find user
      const user = await User.findOne({ where: whereCondition });

      if (!user) {
        return serverError(res, "User not found. Please register first.");
      }

      // Generate OTP 
      const otp = generateOTP();

      // OTP expiry time
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 10 * 60 * 1000);

      // Find or create OTP record for this user
      let otpRecord = await Otp.findOne({
        where: { userId: String(user.id) },
      });

      if (!otpRecord) {
        otpRecord = await Otp.create({
          userId: String(user.id),
          email: user.email || email || null,
          contact: (user as any).contact || contact || null,
          otp: null,
          mbOTP: null,
          loginOTP: null,
          otpVerify: false,
          otpExpiresAt: null,
          mbOTPExpiresAt: null,
          isDeleted: false,
          isEmailVerified: false,
          isMobileVerified: false,
          isActive: false,
        } as any);
      }

      // OTP update payload in OTP table
      if (email) {
        otpRecord.otp = String(otp);
        otpRecord.otpExpiresAt = expiresAt;
        otpRecord.otpVerify = false;
      }
      if (contact) {
        otpRecord.mbOTP = String(otp);
        otpRecord.mbOTPExpiresAt = expiresAt;
        otpRecord.otpVerify = false;
      }

      await otpRecord.save();

      // Send OTP - email or mobile
      let sendResult;
      if (email) {
        sendResult = await sendOTP({ email, otp }, otpFlow);
      } else if (contact) {
        sendResult = await sendOTP({ contact, mbOTP: otp }, otpFlow);
      }

      if (!sendResult || !sendResult.success) {
        return serverError(
          res,
          sendResult?.message || "Failed to send OTP."
        );
      }

      const nameData = email || contact;
      return sendEncryptedResponse(
        res,
        { userId: user.id },
        `OTP sent to ${nameData}`
      );
    } catch (error: any) {
      console.error("Error in /send-otp:", error);
      ErrorLogger.write({ type: "send-otp error", error });
      return serverError(
        res,
        error.message || "Something went wrong while sending OTP."
      );
    }
  }
);

/**
 * RESEND OTP
 * Body:
 * {
 *   "email": "abc@test.com"   // OR
 *   "contact": "9876543210"
 *   "otpFlow": "register" | "login" (optional, default "register")
 * }
 */

router.post(
  "/resend-otp",
  tokenMiddleWare,
  async (req: Request, res: Response) => {
    let t = await (Otp as any).sequelize!.transaction();
    try {
      const bodyData = req.body;
      const email: string | undefined = bodyData.email;
      const contact: string | undefined =
        bodyData.contact || bodyData.mobile_number;
      const otpFlow: OtpFlow = bodyData.otpFlow || "register";

      if (!email && !contact) {
        await t.rollback();
        return serverError(res, "Email or mobile number is required.");
      }

      const whereCondition: any = {};
      if (email) whereCondition.email = email;
      if (contact) whereCondition.contact = contact;

      const user = await User.findOne({ where: whereCondition, transaction: t });

      if (!user) {
        await t.rollback();
        return serverError(res, "User not found.");
      }

      let otpRecord = await Otp.findOne({
        where: { userId: String(user.id) },
        transaction: t,
      });

      if (!otpRecord) {
        // If not exists, behave like send-otp
        otpRecord = await Otp.create(
          {
            userId: String(user.id),
            email: user.email || email || null,
            contact: (user as any).contact || contact || null,
            otp: null,
            mbOTP: null,
            loginOTP: null,
            otpVerify: false,
            otpExpiresAt: null,
            mbOTPExpiresAt: null,
            isDeleted: false,
            isEmailVerified: false,
            isMobileVerified: false,
            isActive: false,
          } as any,
          { transaction: t }
        );
      }

      // Generate new OTP
      const otp = generateOTP();
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 10 * 60 * 1000);

      if (email) {
        otpRecord.otp = String(otp);
        otpRecord.otpExpiresAt = expiresAt;
        otpRecord.otpVerify = false;
      }
      if (contact) {
        otpRecord.mbOTP = String(otp);
        otpRecord.mbOTPExpiresAt = expiresAt;
        otpRecord.otpVerify = false;
      }

      await otpRecord.save({ transaction: t });

      // Send new OTP
      let sendResult;
      if (email) {
        sendResult = await sendOTP({ email, otp }, otpFlow);
      } else if (contact) {
        sendResult = await sendOTP({ contact, mbOTP: otp }, otpFlow);
      }

      if (!sendResult || !sendResult.success) {
        await t.rollback();
        return serverError(
          res,
          sendResult?.message || "Failed to resend OTP."
        );
      }

      await t.commit();
      const nameData = email || contact;
      return sendEncryptedResponse(
        res,
        { userId: user.id },
        `OTP resent successfully to ${nameData}`
      );
    } catch (error: any) {
      await t.rollback();
      console.error("Error in /resend-otp:", error);
      ErrorLogger.write({ type: "resend-otp error", error });
      return serverError(
        res,
        error.message || "Something went wrong while resending OTP."
      );
    }
  }
);

/**
 * VERIFY OTP
 * Body:
 * {
 *   "otp": "123456",
 *   "email": "abc@test.com"  // OR
 *   "contact": "9876543210"
 * }
 *
 */
router.post("/verify-otp", async (req: Request, res: Response) => {
  const sequelize = (Otp as any).sequelize;
  const t = await sequelize!.transaction();
  try {
    const bodyData = req.body;
    const { otp } = bodyData;

    const email: string | undefined = bodyData.email;
    const contact: string | undefined =
      bodyData.contact || bodyData.mobile_number;

    if (!otp || (!email && !contact)) {
      await t.rollback();
      return serverError(
        res,
        "OTP and either email or mobile number is required."
      );
    }

    // Build where condition for OTP table
    const whereCondition: any = {};
    if (email) {
      whereCondition.email = email;
      whereCondition.otp = String(otp);
    } else if (contact) {
      whereCondition.contact = contact;
      whereCondition.mbOTP = String(otp);
    }

    const otpRecord = await Otp.findOne({
      where: whereCondition,
      transaction: t,
    });

    if (!otpRecord) {
      await t.rollback();
      return serverError(res, "Invalid or expired OTP.");
    }

    const now = new Date();

    if (email && otpRecord.otpExpiresAt && otpRecord.otpExpiresAt < now) {
      await t.rollback();
      return serverError(res, "Email OTP has expired.");
    }
    if (
      contact &&
      otpRecord.mbOTPExpiresAt &&
      otpRecord.mbOTPExpiresAt < now
    ) {
      await t.rollback();
      return serverError(res, "Mobile OTP has expired.");
    }

    // Get User by email or contact
    const userWhere: any = {};
    if (email) {
      userWhere.email = email;
    } else if (contact) {
      userWhere.contact = contact;
    }

    const user = await User.findOne({
      where: userWhere,
      transaction: t,
    });

    if (!user) {
      await t.rollback();
      return serverError(res, "User not found.");
    }

    // Prepare payloads
    const otpPayload: any = {
      otpVerify: true,
    };
    const userPayload: any = {};

    if (email) {
      otpPayload.otp = null;
      otpPayload.otpExpiresAt = null;
      otpPayload.isEmailVerified = true;

      userPayload.isEmailVerified = true;
    }

    if (contact) {
      otpPayload.mbOTP = null;
      otpPayload.mbOTPExpiresAt = null;
      otpPayload.isMobileVerified = true;

      userPayload.isMobileVerified = true;
    }

    await otpRecord.update(otpPayload, { transaction: t });
    await user.update(userPayload, { transaction: t });

    const updatedUser: any = await User.findOne({
      where: { id: (user as any).id },
      transaction: t,
    });

    const isEmailVerified = updatedUser?.isEmailVerified;
    const isMobileVerified = updatedUser?.isMobileVerified;

    // if both are verified then isActive = true
    if (isEmailVerified && isMobileVerified && !updatedUser.isActive) {
      await updatedUser.update({ isActive: true }, { transaction: t });
    }

    await t.commit();

    const nameData = email || contact || `User ID ${(user as any).id}`;

    return sendEncryptedResponse(
      res,
      {
        userId: (user as any).id,
        isEmailVerified,
        isMobileVerified,
        isActive: updatedUser.isActive,
      },
      `OTP verified successfully for ${nameData}.`
    );
  } catch (error: any) {
    await t.rollback();
    console.error("Error in /verify-otp:", error);
    ErrorLogger.write({ type: "verify-otp error", error });
    return serverError(
      res,
      error.message || "Something went wrong during OTP verification."
    );
  }
});


/**
 * GET ALL OTPs
 * GET /otp/getAllOtp?limit=10&offset=0
 */
router.get("/getAllOtp", async (req: Request, res: Response) => {
  try {
    const result = await getAllOtp(req.query);
    return sendEncryptedResponse(res, result, "Got all OTP records.");
  } catch (error: any) {
    console.error("Error in /getAllOtp:", error);
    ErrorLogger.write({ type: "getAllOtp error", error });
    return serverError(
      res,
      error.message || "Failed to fetch OTP records."
    );
  }
});

export default router;


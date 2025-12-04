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

const router = express.Router();

// signup for client (Agency) - working api 
// router.post("/clientSignup/start",
//     async (req: Request, res: Response): Promise<void> => {
//         const t = await dbInstance.transaction();

//         try {
//             const {
//                 userId,
//                 companyId,
//                 businessName,
//                 clientfirstName,
//                 clientLastName,
//                 email,
//                 contact,
//                 countryCode,
//                 password,
//                 confirmPassword, 
//                 userName: userNameFromFE,
//             } = req.body;

//             // Validate required fields
//             if (
//                 !userId ||
//                 !companyId ||
//                 !clientfirstName ||
//                 !clientLastName ||
//                 !businessName ||
//                 !email ||
//                 !contact ||
//                 !password ||
//                 !confirmPassword
//             ) {
//                 await t.rollback();
//                 res
//                     .status(400)
//                     .json({ success: false, message: "All fields required." });
//                 return;
//             }

//             if (password !== confirmPassword) {
//                 await t.rollback();
//                 res
//                     .status(400)
//                     .json({ success: false, message: "Passwords do not match." });
//                 return;
//             }

//             //  Auto-detect countryCode from contact
//             const rawContact: string = String(contact).trim();
//             const digitsOnly = rawContact.replace(/\D/g, "");

//             // create detection string 
//             let detectionNumber = rawContact;

//             if (!rawContact.startsWith("+")) {
//                 // if only digits
//                 if (digitsOnly.length === 10) {
//                     // India 10-digit number
//                     detectionNumber = `+91${digitsOnly}`;
//                 } else {
//                     // fallback: just add + and try
//                     detectionNumber = `+${digitsOnly}`;
//                 }
//             }

//             const autoCountryCode = detectCountryCode(detectionNumber);
//             const finalCountryCode = autoCountryCode || countryCode || null;

//             if (!finalCountryCode) {
//                 await t.rollback();
//                 res.status(400).json({
//                     success: false,
//                     message: "Invalid contact. Could not detect country code.",
//                 });
//                 return;
//             }

//             //  Check if client already exists
//             const existsByEmail = await getClientsByEmail({ email });
//             const existsByContact = await getClientsByMbMo({ contact });

//             if (existsByEmail || existsByContact) {
//                 await t.rollback();
//                 res.status(409).json({
//                     success: false,
//                     message: "Email or Contact already registered.",
//                 });
//                 return;
//             }

//             //  Remove any previous OTP for this email (unique constraint)
//             await Otp.destroy({ where: { email } });

//             // 4. Generate OTP and create OTP record with temp data
//             const otp = Math.floor(100000 + Math.random() * 900000).toString();

//             await Otp.create(
//                 {
//                     userId: null,
//                     //   clientId:null,
//                     email,
//                     contact,
//                     otp,
//                     otpVerify: false,
//                     otpExpiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 min
//                     tempUserData: {
//                         companyId: companyId || null,
//                         userId: userId || null,
//                         businessName,
//                         clientLastName,
//                         clientfirstName,
//                         email,
//                         contact,
//                         countryCode: finalCountryCode,
//                         password, // will be hashed by Clients model
//                     },
//                 } as any,
//                 { transaction: t }
//             );

//             //  Send OTP email using your otp-service
//             await sendOTP({ email, otp }, "register");

//             await t.commit();
//             res.status(200).json({
//                 success: true,
//                 message: "OTP sent to email. Please verify to complete signup.",
//             });
//         } catch (err) {
//             await t.rollback();
//             console.error("[clients/signup/start] ERROR:", err);
//             res.status(500).json({ success: false, message: "Server error" });
//         }
//     }
// );

// new change api 
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
      const existsByEmail = await getClientsByEmail({ email });
      const existsByContact = await getClientsByMbMo({ contact });

      if (existsByEmail || existsByContact) {
        await t.rollback();
        res.status(409).json({
          success: false,
          message: "Email or Contact already registered.",
        });
        return;
      }

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

// signup for client - verify-otp
router.post("/clientSignup/verify-otp",
  async (req: Request, res: Response): Promise<void> => {
    const t = await dbInstance.transaction();

    try {
      const { email, contact, otp, mbOTP } = req.body;

      if (!email || !contact || !otp || !mbOTP) {
        await t.rollback();
        res
          .status(400)
          .json({ success: false, message: "Email, Contact, Email OTP and Mobile OTP are required." });
        return;
      }

      // 1) Find valid OTP record
      const otpRecord = await Otp.findOne({
        where: {
          email,
          contact,
          otp: String(otp),
          mbOTP: String(mbOTP),
          otpVerify: false,
          otpExpiresAt: { [Op.gt]: new Date() },
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
      const existsByEmail = await getClientsByEmail({ email: temp.email });
      const existsByContact = await getClientsByMbMo({
        contact: temp.contact,
      });

      if (existsByEmail || existsByContact) {
        await t.rollback();
        res.status(409).json({
          success: false,
          message: "Email or Contact already registered.",
        });
        return;
      }

      // 5) Create client (after OTP success)
      const client: any = await Clients.create(
        {
          // FKs — only if valid
          userId: parentUser ? parentUser.id : null,
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

          isEmailVerified: true,
          isMobileVerified: true,
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
        email: client.email,
        role: "client",
      };
      if (parentUser) tokenPayload.userId = parentUser.id;
      if (parentCompany) tokenPayload.companyId = parentCompany.id;

      const token = await generateToken(tokenPayload, "7d");

      await t.commit();

      res.status(201).json({
        success: true,
        message: "Client signup successful!",
        data: {
          id: client.id,
          businessName: client.businessName,
          clientfirstName: client.clientfirstName,
          clientLastName: client.clientLastName,
          email: client.email,
          contact: client.contact,
          isdCode: client.isdCode,
          isoCode: client.isoCode,
          userId: parentUser ? parentUser.id : null,
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

//Add new client from “Add Client” form  - old one working api
// router.post("/clients/add", async (req: Request, res: Response): Promise<void> => {
//     const t = await dbInstance.transaction();

//     try {
//         const {
//             userId,
//             companyId,
//             businessTypeId,
//             businessSubCategoryIds,
//             clientfirstName,
//             clientLastName,
//             email,
//             contact,
//             businessName,
//             businessBase,
//             businessType,
//             businessSubCategory,
//             businessWebsite,
//             businessEmail,
//             businessContact,
//             businessDescription,
//             isVip,
//             country,
//             state,
//             city,
//             postcode,
//             address,
//             accounteHolderName,
//             accountNumber,
//             bankName,
//             branchName,
//             ifscCode,
//             swiftCode,
//             accountType,
//             currency,
//             taxVatId,
//         } = req.body;

//         //  Required fields validate
//         if (
//             !clientfirstName ||
//             !clientLastName ||
//             !email ||
//             !contact ||
//             !businessName ||
//             // !country ||
//             // !state ||
//             // !city ||
//             // !postcode ||
//             !address
//         ) {
//             await t.rollback();
//             res.status(400).json({
//                 success: false,
//                 message: "Required fields are missing.",
//             });
//             return;
//         }

//         // Auto country code from contact
//         const rawContact: string = String(contact).trim();
//         const digitsOnly = rawContact.replace(/\D/g, "");
//         let detectionNumber = rawContact;

//         if (!rawContact.startsWith("+")) {
//             if (digitsOnly.length === 10) {
//                 detectionNumber = `+91${digitsOnly}`;
//             } else {
//                 detectionNumber = `+${digitsOnly}`;
//             }
//         }

//         const autoCountryCode = detectCountryCode(detectionNumber);
//         const finalCountryCode = autoCountryCode || null;

//         // Duplicate email/contact check
//         const existsByEmail = await getClientsByEmail({ email });
//         const existsByContact = await getClientsByMbMo({ contact });

//         if (existsByEmail || existsByContact) {
//             await t.rollback();
//             res.status(409).json({
//                 success: false,
//                 message: "Email or Contact already exists.",
//             });
//             return;
//         }

//         // BusinessType + Subcategory validation
//         let finalBusinessTypeId: number | null = null;
//         let finalBusinessSubCategoryIds: number[] | null = null;

//         if (businessTypeId) {
//             const bt = await BusinessType.findByPk(businessTypeId, { transaction: t });
//             if (!bt) {
//                 await t.rollback();
//                 res.status(400).json({
//                     success: false,
//                     message: "Invalid businessTypeId.",
//                 });
//                 return;
//             }
//             finalBusinessTypeId = bt.id;
//         }

//         if (Array.isArray(businessSubCategoryIds) && businessSubCategoryIds.length > 0) {
//             const subcats = await BusinessSubcategory.findAll({
//                 where: { id: businessSubCategoryIds },
//                 transaction: t,
//             });

//             if (subcats.length !== businessSubCategoryIds.length) {
//                 await t.rollback();
//                 res.status(400).json({
//                     success: false,
//                     message: "One or more businessSubCategoryIds are invalid.",
//                 });
//                 return;
//             }

//             if (finalBusinessTypeId) {
//                 const mismatch = subcats.some(
//                     (s: any) => s.businessTypeId !== finalBusinessTypeId
//                 );
//                 if (mismatch) {
//                     await t.rollback();
//                     res.status(400).json({
//                         success: false,
//                         message: "Subcategories do not belong to the given businessTypeId.",
//                     });
//                     return;
//                 }
//             }

//             finalBusinessSubCategoryIds = businessSubCategoryIds;
//         }

//         // payload for DB
//         const payload = {
//             userId: userId || null,
//             companyId: companyId || null,
//             clientfirstName,
//             clientLastName,
//             email,
//             contact,
//             countryCode: finalCountryCode,
//             businessName,
//             businessBase: businessBase || "service",
//             businessTypeId: finalBusinessTypeId,
//             businessSubCategory: finalBusinessSubCategoryIds,
//             businessWebsite: businessWebsite || null,
//             businessEmail: businessEmail || null,
//             businessContact: businessContact || null,
//             businessDescription: businessDescription || null,
//             isVip: !!isVip,
//             country: country || null,
//             state: state || null,
//             city: city || null,
//             postcode,
//             address: address || null,
//             accounteHolderName: accounteHolderName || null,
//             accountNumber: accountNumber || null,
//             bankName: bankName || null,
//             branchName: branchName || null,
//             ifscCode: ifscCode || null,
//             swiftCode: swiftCode || null,
//             accountType: accountType || null,
//             currency: currency || null,
//             taxVatId: taxVatId || null,
//             isActive: true,
//             isDeleted: false,
//             isStatus: true,
//             isApprove: false,
//             isCredential: false,
//             profileStatus: false,
//             isEmailVerified: false,
//             isMobileVerified: false,
//             isRegistering: false,
//             registrationStep: 0,
//         };

//         // add/create client
//         const client = await addAgencyClient(payload, t);

//         await t.commit();

//         res.status(201).json({
//             success: true,
//             message: "Client created successfully.",
//             data: {
//                 id: client.id,
//                 userId: client.userId,
//                 companyId: client.companyId,
//                 clientfirstName: client.clientfirstName,
//                 clientLastName: client.clientLastName,
//                 email: client.email,
//                 contact: client.contact,
//             },
//         });
//     } catch (error: any) {
//         await t.rollback();
//         console.error("[clients/add] ERROR:", error);
//         ErrorLogger.write({ type: "clients/add error", error });
//         serverError(res, error.message || "Failed to create client.");
//     }
// });

//latest api - 2-12-25 - add client
// router.post("/clients/add", async (req: Request, res: Response): Promise<void> => {
//   const t = await dbInstance.transaction();

//   try {
//     const {
//       userId,              // agency user (creator) – optional
//       companyId,
//       businessTypeId,
//       businessSubCategoryIds,
//       clientfirstName,
//       clientLastName,
//       email,
//       contact,
//       businessName,
//       businessBase,
//       businessWebsite,
//       businessEmail,
//       businessContact,
//       businessExecutive,
//       businessDescription,
//       isoBusinessCode,
//       isdBusinessCode,
//       isoCode,
//       isdCode,
//       isVip,
//       country,
//       state,
//       city,
//       postcode,
//       address,
//       accounteHolderName,
//       accountNumber,
//       bankName,
//       branchName,
//       ifscCode,
//       swiftCode,
//       accountType,
//       currency,
//       taxVatId,
//       // emailOtpRefId,       //(verify API )
//     } = req.body;

//     // 1) Required fields
//     if (
//       !clientfirstName ||
//       !clientLastName ||
//       !email ||
//       !contact ||
//       !businessName ||
//       //   !country ||
//       //   !state ||
//       //   !city ||
//       //   !postcode ||
//       !address
//     ) {
//       await t.rollback();
//       res.status(400).json({
//         success: false,
//         message: "Required fields are missing.",
//       });
//       return;
//     }

//     // 2) OTP verification is optional for agency-added clients
//     // The agency is trusted to add clients directly without OTP verification
//     // OTP verification is only required during client self-signup flow

//     // 3) Auto countryCode from contact
//     const rawContact: string = String(contact).trim();
//     const digitsOnly = rawContact.replace(/\D/g, "");
//     let detectionNumber = rawContact;

//     if (!rawContact.startsWith("+")) {
//       if (digitsOnly.length === 10) {
//         detectionNumber = `+91${digitsOnly}`;
//       } else {
//         detectionNumber = `+${digitsOnly}`;
//       }
//     }

//     const autoCountryCode = detectCountryCode(detectionNumber);
//     const finalIsdCode = isdCode || autoCountryCode || null;
//     const finalIsoCode = isoCode || null;

//     // Auto-detect business contact codes if businessContact is provided
//     let finalIsdBusinessCode = isdBusinessCode || null;
//     let finalIsoBusinessCode = isoBusinessCode || null;

//     if (businessContact) {
//       const rawBusinessContact: string = String(businessContact).trim();
//       const digitsOnlyBusiness = rawBusinessContact.replace(/\D/g, "");
//       let detectionNumberBusiness = rawBusinessContact;

//       if (!rawBusinessContact.startsWith("+")) {
//         if (digitsOnlyBusiness.length === 10) {
//           detectionNumberBusiness = `+91${digitsOnlyBusiness}`;
//         } else {
//           detectionNumberBusiness = `+${digitsOnlyBusiness}`;
//         }
//       }

//       const autoBusinessCountryCode = detectCountryCode(detectionNumberBusiness);
//       finalIsdBusinessCode = isdBusinessCode || autoBusinessCountryCode || null;
//       finalIsoBusinessCode = isoBusinessCode || null;
//     }

//     // 4) Duplicate check (client)
//     // const existsByEmail = await getClientsByEmail({ email });
//     // const existsByContact = await getClientsByMbMo({ contact });

//     // if (existsByEmail || existsByContact) {
//     //   await t.rollback();
//     //   res.status(409).json({
//     //     success: false,
//     //     message: "Email or Contact already exists.",
//     //   });
//     //   return;
//     // }

//     // 5) USER TABLE: find or create for this email
//     let clientUser: any = await User.findOne({
//       where: { email },
//       transaction: t,
//     });

//     // 6) BusinessType + Subcategory validation
//     let finalBusinessTypeId: number | null = null;
//     let finalBusinessSubCategoryIds: number[] | null = null;

//     if (businessTypeId) {
//       const bt = await BusinessType.findByPk(businessTypeId, { transaction: t });
//       if (!bt) {
//         await t.rollback();
//         res.status(400).json({
//           success: false,
//           message: "Invalid businessTypeId.",
//         });
//         return;
//       }
//       finalBusinessTypeId = bt.id;
//     }

//     if (Array.isArray(businessSubCategoryIds) && businessSubCategoryIds.length > 0) {
//       const subcats = await BusinessSubcategory.findAll({
//         where: { id: businessSubCategoryIds },
//         transaction: t,
//       });

//       if (subcats.length !== businessSubCategoryIds.length) {
//         await t.rollback();
//         res.status(400).json({
//           success: false,
//           message: "One or more businessSubCategoryIds are invalid.",
//         });
//         return;
//       }

//       if (finalBusinessTypeId) {
//         const mismatch = subcats.some(
//           (s: any) => s.businessTypeId !== finalBusinessTypeId
//         );
//         if (mismatch) {
//           await t.rollback();
//           res.status(400).json({
//             success: false,
//             message: "Subcategories do not belong to the given businessTypeId.",
//           });
//           return;
//         }
//       }

//       finalBusinessSubCategoryIds = businessSubCategoryIds;
//     }

//     // Generate password once for both User and Client
//     const plainPassword = generateRandomPassword();

//     // Create or update User with generated password
//     if (!clientUser) {
//       clientUser = await User.create(
//         {
//           firstName: clientfirstName,
//           lastName: clientLastName,
//           email,
//           contact,
//           isdCode: finalIsdCode,
//           isoCode: finalIsoCode,
//           password: plainPassword,
//           userType: "client",
//           secretCode: null,
//           isThemeDark: false,
//           categories: null,
//           isDeleted: false,
//           isEmailVerified: true,   // OTP verified
//           isMobileVerified: false,
//           isRegistering: false,
//           registrationStep: 0,
//           isActive: true,
//           googleId: null,
//           appleId: null,
//           authProvider: "email",
//           companyId: companyId || null,
//         } as any,
//         { transaction: t }
//       );
//     } else {
//       await clientUser.update(
//         {
//           firstName: clientfirstName || clientUser.firstName,
//           lastName: clientLastName || clientUser.lastName,
//           contact,
//           isdCode: finalIsdCode,
//           isoCode: finalIsoCode,
//           password: plainPassword,
//           userType: "client",
//           isEmailVerified: true,
//           isActive: true,
//           companyId: clientUser.companyId ?? companyId ?? null,
//         },
//         { transaction: t }
//       );
//     }

//     // 7) Payload for CLIENTS
//     const payload = {
//       userId: clientUser.id,        //link with user table
//       companyId: companyId || clientUser.companyId || null,
//       userName: null,
//       clientfirstName,
//       clientLastName,
//       email,
//       contact,
//       isdCode: finalIsdCode,
//       isoCode: finalIsoCode,
//       password: plainPassword,
//       businessName,
//       businessBase: businessBase || "service",
//       businessTypeId: finalBusinessTypeId,
//       businessSubCategory: finalBusinessSubCategoryIds,
//       businessWebsite: businessWebsite || null,
//       businessEmail: businessEmail || null,
//       businessContact: businessContact || null,
//       businessExecutive: businessExecutive || null,
//       businessDescription: businessDescription || null,
//       isoBusinessCode: finalIsoBusinessCode,
//       isdBusinessCode: finalIsdBusinessCode,
//       isVip: !!isVip,
//       country,
//       state,
//       city,
//       postcode,
//       address: address || null,
//       accounteHolderName: accounteHolderName || null,
//       accountNumber: accountNumber || null,
//       bankName: bankName || null,
//       branchName: branchName || null,
//       ifscCode: ifscCode || null,
//       swiftCode: swiftCode || null,
//       accountType: accountType || null,
//       currency: currency || null,
//       taxVatId: taxVatId || null,
//       isActive: true,
//       isDeleted: false,
//       isStatus: true,
//       isApprove: false,
//       isCredential: false,
//       profileStatus: false,
//       isEmailVerified: true,   // verified otp in client record 
//       isMobileVerified: false,
//       isRegistering: false,
//       registrationStep: 0,
//       isFirstLogin: true,
//       twofactorEnabled: false,
//       twofactorSecret: null,
//       twofactorVerified: false,
//       twofactorBackupCodes: null,
//     };

//     const client = await addAgencyClient(payload, t);
//     const mailData: any = {
//       to: email,
//       subject: "Your ZarklyX Client Account Details",
//       html: `
//         <p>Hi ${clientfirstName},</p>
//         <p>Your client account has been created on <b>ZarklyX</b>.</p>
//         <p>You can login using:</p>
//         <ul>
//           <li>Email: <b>${email}</b></li>
//           <li>Password: <b>${plainPassword}</b></li>
//         </ul>
//         <p>For security, please login and change your password from your profile settings.</p>
//       `,
//     };
//     await sendEmail(mailData);
//     await t.commit();

//     res.status(201).json({
//       success: true,
//       message: "Client created successfully.",
//       data: {
//         id: client.id,
//         userId: client.userId,       // user table id
//         companyId: client.companyId,
//         clientfirstName: client.clientfirstName,
//         clientLastName: client.clientLastName,
//         email: client.email,
//         contact: client.contact,
//       },
//     });
//   } catch (error: any) {
//     await t.rollback();
//     console.error("[clients/add] ERROR:", error);
//     ErrorLogger.write({ type: "clients/add error", error });
//     serverError(res, error.message || "Failed to create client.");
//   }
// });


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

    // USER TABLE = ONLY CREATE IF NOT EXISTS (NO UPDATE)
    let clientUser: any = await User.findOne({ where: { email }, transaction: t });

    let plainPassword: string | null = null;

    if (!clientUser) {
      plainPassword = generateRandomPassword();

      clientUser = await User.create(
        {
          firstName: clientfirstName,
          lastName: clientLastName,
          email,
          contact,
          isdCode: finalIsdCode,
          isoCode: finalIsoCode,
          password: plainPassword,
          userType: "client",
          isEmailVerified: true,
          isDeleted: false,
          isActive: true,
          authProvider: "email",
          companyId: companyId || null,
        } as any,
        { transaction: t }
      );
    }
    //  If user already exists → DO NOTHING (no update)

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

    //  Send mail only when new user is created
    if (plainPassword) {
      await sendEmail({
        to: email,
        subject: "Your ZarklyX Account Details",
        html: `
          <p>Hi ${clientfirstName},</p>
          <p>Your account has been created on <b>ZarklyX</b>.</p>
          <ul>
            <li>Email: <b>${email}</b></li>
            <li>Password: <b>${plainPassword}</b></li>
          </ul>
          <p>Please login & change your password from profile settings.</p>
        `,
        from: "" as any,
        text: "" as any,
        replacements: null,
        htmlFile: "" as any,
        attachments: null,
        cc: null,
        replyTo: null,
      });
    }

    await t.commit();

    res.status(201).json({
      success: true,
      message: "Client added successfully.",
      data: {
        id: client.id,
        userId: client.userId,
        companyId: client.companyId,
        clientfirstName,
        clientLastName,
        email,
        contact,
      },
    });
  } catch (error: any) {
    await t.rollback();
    console.error("[clients/add ERROR]", error);
    serverError(res, error.message || "Failed to create client.");
  }
});



// VERIFY OTP on Add Client email
// router.post(
//   "/clients/email-otp/verify",
//   async (req: Request, res: Response): Promise<void> => {
//     const t = await dbInstance.transaction();
//     try {
//       const { email, otp } = req.body;

//       if (!email || !otp) {
//         await t.rollback();
//         res.status(400).json({
//           success: false,
//           message: "Email and OTP are required.",
//         });
//         return;
//       }

//       const otpRecord: any = await Otp.findOne({
//         where: {
//           email,
//           otp: String(otp),
//           otpVerify: false,
//           isDeleted: false,
//           otpExpiresAt: { [Op.gt]: new Date() },
//         },
//         transaction: t,
//       });

//       if (!otpRecord) {
//         await t.rollback();
//         res.status(400).json({
//           success: false,
//           message: "Invalid or expired OTP.",
//         });
//         return;
//       }

//       // mark OTP as used + email verified
//       otpRecord.otpVerify = true;
//       otpRecord.isEmailVerified = true;
//       otpRecord.otp = null;
//       otpRecord.otpExpiresAt = null;
//       await otpRecord.save({ transaction: t });

//       await t.commit();

//       res.status(200).json({
//         success: true,
//         message: "Email verified successfully.",
//         data: {
//           email,
//           emailOtpRefId: otpRecord.id, 
//         },
//       });
//     } catch (err: any) {
//       await t.rollback();
//       console.error("[/clients/email-otp/verify] ERROR:", err);
//       ErrorLogger.write({ type: "clients email-otp verify error", error: err });
//       serverError(res, err.message || "Server error while verifying OTP.");
//     }
//   }
// );

// // SEND OTP on Add Client email
// router.post(
//   "/clients/email-otp/start",
//   async (req: Request, res: Response): Promise<void> => {
//     const t = await dbInstance.transaction();
//     try {
//       const { email } = req.body;

//       if (!email) {
//         await t.rollback();
//         res.status(400).json({
//           success: false,
//           message: "Email is required.",
//         });
//         return;
//       }

//       // (optional) check client duplicate email
//       const existingClient = await getClientsByEmail({ email });
//       if (existingClient) {
//         await t.rollback();
//         res.status(409).json({
//           success: false,
//           message: "This email is already used by another client.",
//         });
//         return;
//       }

//       //reset previous OTPs for this email
//       await Otp.destroy({ where: { email }, transaction: t });

//       const otpCode = generateOTP(); // 6 digit
//       const expiry = new Date(Date.now() + 10 * 60 * 1000); // 10 min

//       const otpRecord: any = await Otp.create(
//         {
//           userId: null,
//           clientId: null,
//           email,
//           contact: null as any,
//           otp: otpCode as string,
//           mbOTP: null,
//           loginOTP: null,
//           otpVerify: false,
//           otpExpiresAt: expiry,
//           mbOTPExpiresAt: null,
//           isDeleted: false,
//           isEmailVerified: false,
//           isMobileVerified: false,
//           isActive: true,
//           tempUserData: {
//             flow: "CLIENT_ADD_EMAIL", // just for debugging
//           },
//         },
//         { transaction: t }
//       );

//       // send OTP email
//       const sendResult = await sendOTP({ email, otp: otpCode }, "client-add");
//       if (!sendResult || !sendResult.success) {
//         await t.rollback();
//         serverError(res, sendResult?.message || "Failed to send OTP.");
//         return;
//       }

//       await t.commit();

//       res.status(200).json({
//         success: true,
//         message: `OTP sent to ${email}.`,
//         data: {
//           emailOtpRefId: otpRecord.id, 
//           email,
//         },
//       });
//     } catch (err: any) {
//       await t.rollback();
//       console.error("[/clients/email-otp/start] ERROR:", err);
//       ErrorLogger.write({ type: "clients email-otp start error", error: err });
//       serverError(res, err.message || "Server error while sending OTP.");
//     }
//   }
// );

// GET /clients
// Pagination + filters 
// Filters support: search, email, isActive, businessType, city, country, isVip, etc.
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

//   GET /clients/:id
//   Single client detail (edit form)
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

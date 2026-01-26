import express from "express";
import { Request, Response } from "express";
import { OAuth2Client } from "google-auth-library";
import { google } from "googleapis";
import speakeasy from "speakeasy";
import QRCode from "qrcode";
import { notFound } from "../../../../services/response";
import dbInstance from "../../../../db/core/control-db";
import {
  alreadyExist,
  serverError,
  unauthorized,
  sendEncryptedResponse,
  other,
} from "../../../../utils/responseHandler";
import { generateOTP } from "../../../../services/password-service";
import { sendOTP } from "../../../../services/otp-service";
import { generateToken } from "../../../../services/jwtToken-service";
import { checkPassword, generateRandomPassword } from "../../../../services/password-service";
import {
  updateUser,
  deleteUser,
  getUserByid,
  getAllUser,
  updateTheme,
  generateUniqueSecretCode,
} from "../../authentication/user/user-handler";
import { sendEmail } from "../../../../services/mailService";
import { createCompany, addUserToCompany } from "../../company/company-handler";
import { Otp } from "../../../../routes/api-webapp/otp/otp-model";
import { User } from "../../../../routes/api-webapp/authentication/user/user-model";
import { Company } from "../../../../routes/api-webapp/company/company-model";
import { Category } from "../../../../routes/api-webapp/superAdmin/generalSetup/category/category-model";
import { PremiumModule } from "../../../../routes/api-webapp/superAdmin/generalSetup/premiumModule/premiumModule-model";
import { Op } from "sequelize";
import ErrorLogger from "../../../../db/core/logger/error-logger";
import { detectCountryCode } from "../../../../services/phone-service";
import { createLoginHistory, recordFailedLogin } from "../../../../services/loginHistory-service";


const ZARKLYX_API_KEY =
  process.env.RESPONSE_ENCRYPTION_KEY || process.env.CRYPTO_KEY || "";

const router = express.Router();
// type Params = { id: string };

// Helper function to safely rollback transaction
async function safeRollback(t: any) {
  if (t && !t.finished) {
    await t.rollback();
  }
}

//signup steps:1 Start Registration
router.post("/register/start",
  async (req: Request, res: Response): Promise<void> => {
    const t = await dbInstance.transaction();

    try {
      const {
        referId,
        firstName,
        lastName,
        email,
        contact,
        password,
        confirmPassword,
        countryCode,
        defaultCountry,
      } = req.body;

      console.log("[register/start] BODY (safe):", {
        referId,
        firstName,
        lastName,
        email,
        contact,
        countryCode,
        defaultCountry
      });

      // Basic field validation 
      if (!firstName || !lastName || !email || !contact) {
        await safeRollback(t);
        res.status(400).json({
          success: false,
          message: "firstName, lastName, email, contact are required",
        });
        return;
      }

      //  Password validations 
      if (!password || !confirmPassword) {
        await safeRollback(t);
        res.status(400).json({
          success: false,
          message: "password and confirmPassword are required",
        });
        return;
      }

      if (password !== confirmPassword) {
        await safeRollback(t);
        res.status(400).json({
          success: false,
          message: "password and confirmPassword must match",
        });
        return;
      }

      if (password.length < 6) {
        await safeRollback(t);
        res.status(400).json({
          success: false,
          message: "Password must be at least 6 characters.",
        });
        return;
      }

      //  Contact with Country Code logic 
      const rawContact: string = String(contact).trim();
      const digitsOnly = rawContact.replace(/\D/g, "");

      if (digitsOnly.length < 10) {
        await safeRollback(t);
        res.status(400).json({
          success: false,
          message: "Invalid contact number.",
        });
        return;
      }

      const isoCountry = (defaultCountry || "IN").toUpperCase();

      // Auto-detect countryCode 
      const autoCountryCode = detectCountryCode(rawContact, isoCountry);
      //    manual countryCode from FE
      //    auto detected
      let finalCountryCode: string | null =
        (countryCode && String(countryCode).trim()) || autoCountryCode || null;

      if (!finalCountryCode) {
        await safeRollback(t);
        res.status(400).json({
          success: false,
          message: "Could not detect country code for given contact.",
        });
        return;
      }

      const localNumber = digitsOnly;

      console.log("[register/start] Parsed contact:", {
        rawContact,
        finalCountryCode,
        localNumber,
      });

      //  Duplicate check 
      const existingUser: any = await User.findOne({
        where: {
          [Op.or]: [{ email }, { contact: localNumber }],
        },
        transaction: t,
      });

      if (existingUser) {
        await safeRollback(t);
        alreadyExist(res, "Email or contact already exists");
        return;
      }

      //  Otp.tempUserData 
      const finalSecretCode = await generateUniqueSecretCode();

      const tempUserData: any = {
        referId: referId || null,
        firstName,
        lastName,
        email,
        contact: localNumber,
        countryCode: finalCountryCode,
        password, // raw – hash in User model
        userType: null,
        secretCode: finalSecretCode,
        isThemeDark: false,
        categories: null,
      };

      // Generate OTP for both email and mobile
      const emailOtp = generateOTP();
      const mobileOtp = generateOTP();
      const expiry = new Date(Date.now() + 10 * 60 * 1000); // 10 min

      // Remove any previous OTP for this email or contact
      await Otp.destroy({
        where: { [Op.or]: [{ email }, { contact: localNumber }] },
        transaction: t,
      });

      // Create new OTP record
      const otpRecord = await Otp.create(
        {
          userId: null,
          email,
          contact: localNumber,
          otp: emailOtp,
          mbOTP: mobileOtp,
          loginOTP: null,
          otpVerify: false,
          otpExpiresAt: expiry,
          mbOTPExpiresAt: expiry,
          isDeleted: false,
          isEmailVerified: false,
          isMobileVerified: false,
          isActive: true,
          tempUserData,
        },
        { transaction: t }
      );

      // Send OTP to email
      const emailResult = await sendOTP({ email, otp: emailOtp }, "register");
      if (!emailResult || !emailResult.success) {
        await safeRollback(t);
        serverError(res, emailResult?.message || "Failed to send Email OTP.");
        return;
      }

      // Send OTP to mobile
      const mobileResult = await sendOTP({ contact: localNumber, mbOTP: mobileOtp }, "register");
      if (!mobileResult || !mobileResult.success) {
        await safeRollback(t);
        serverError(res, mobileResult?.message || "Failed to send Mobile OTP.");
        return;
      }

      await t.commit();

      // No user row yet – only OTP record is inserted/updated
      res.status(200).json({
        success: true,
        message: `Signup step 1 done. OTP sent to ${email} and ${localNumber}.`,
        data: {
          otpRefId: otpRecord.id,
          email,
          contact: localNumber,
          countryCode: finalCountryCode,
        },
      });
      return;
    } catch (error: any) {
      await safeRollback(t);
      ErrorLogger.write({ type: "register/start error", error });
      serverError(res, error?.message || "Failed to start registration.");
      return;
    }
  }
);

// signup steps:2 Verify OTP
router.post("/register/verify-otp",
  async (req: Request, res: Response): Promise<void> => {
    const t = await dbInstance.transaction();
    try {
      const { email, otp, mbOTP } = req.body;

      console.log("[register/verify-otp] Request body:", { email, otp, mbOTP });

      // Require email and at least one OTP (email or mobile)
      if (!email || (!otp && !mbOTP)) {
        await t.rollback();
        res.status(400).json({
          success: false,
          message: "email and either otp (email) or mbOTP (mobile) are required",
        });
        return;
      }

      // Build where clause based on which OTP(s) are provided
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

      // Find OTP record matching email and EITHER email OTP OR mobile OTP
      const otpRecord: any = await Otp.findOne({
        where: {
          email,
          otpVerify: false,
          isDeleted: false,
          [Op.or]: whereConditions,
        },
        transaction: t,
      });

      console.log("[register/verify-otp] OTP Record found:", !!otpRecord);

      if (!otpRecord) {
        await t.rollback();
        res.status(400).json({
          success: false,
          message: "Invalid / expired OTP.",
        });
        return;
      }

      // Determine which OTP was verified
      let isEmailVerified = false;
      let isMobileVerified = false;

      if (otp && otpRecord.otp === String(otp)) {
        // Email OTP was verified
        isEmailVerified = true;
        console.log("[register/verify-otp] Email OTP verified");
      }

      if (mbOTP && otpRecord.mbOTP === String(mbOTP)) {
        // Mobile OTP was verified
        isMobileVerified = true;
        console.log("[register/verify-otp] Mobile OTP verified");
      }

      //  Ensure we still have tempUserData
      if (!otpRecord.tempUserData) {
        await t.rollback();
        serverError(res, "Registration data not found for this OTP.");
        return;
      }

      let tempUserData: any = otpRecord.tempUserData;

      if (typeof tempUserData === "string") {
        try {
          tempUserData = JSON.parse(tempUserData);
        } catch (e) {
          tempUserData = null;
        }
      }

      if (!tempUserData) {
        await t.rollback();
        serverError(res, "Registration data not found for this OTP.");
        return;
      }

      console.log("[register/verify-otp] tempUserData:", tempUserData);

      //  Double-check no user already exists
      const duplicateUser = await User.findOne({
        where: {
          [Op.or]: [{ email: tempUserData.email }, { contact: tempUserData.contact }],
        },
        transaction: t,
      });

      if (duplicateUser) {
        await t.rollback();
        alreadyExist(res, "Email or contact already exists");
        return;
      }

      //  Create User ONLY NOW (after OTP success)
      // Set email verified if email OTP was used, mobile verified if mobile OTP was used
      const user: any = await User.create(
        {
          ...tempUserData,
          isDeleted: false,
          isEmailVerified: isEmailVerified, // true if email OTP verified
          isMobileVerified: isMobileVerified, // true if mobile OTP verified
          isRegistering: true,
          registrationStep: 2,
          isActive: false, // or true if you want auto-activate
        },
        { transaction: t }
      );

      // Update OTP record: userId + mark verified + clear only the verified OTP
      otpRecord.userId = user.id;
      otpRecord.otpVerify = true;
      otpRecord.isEmailVerified = isEmailVerified;
      otpRecord.isMobileVerified = isMobileVerified;

      // Clear only the OTP that was verified
      if (isEmailVerified) {
        otpRecord.otp = null;
        otpRecord.otpExpiresAt = null;
      }
      if (isMobileVerified) {
        otpRecord.mbOTP = null;
        otpRecord.mbOTPExpiresAt = null;
      }

      otpRecord.tempUserData = null;
      await otpRecord.save({ transaction: t });

      // Create login history record for registration
      const loginHistoryResult = await createLoginHistory(
        user.id,
        "OTP",
        req,
        undefined, // No token at registration step
        "SUCCESS",
        undefined
      );

      await t.commit();

      res.status(200).json({
        success: true,
        message: "OTP verified. User created. Proceed to categories selection.",
        data: {
          userId: user.id,
          secretCode: user.secretCode,
          countryCode: user.countryCode,
          email: user.email,
          sessionId: loginHistoryResult.success ? loginHistoryResult.sessionId : null,
        },
      });
    } catch (error: any) {
      await t.rollback();
      ErrorLogger.write({ type: "register/verify-otp error", error });
      serverError(res, error.message || "Failed to verify OTP.");
    }
  }
);

//signup steps:3 Categories api 
router.post("/register/categories",
  async (req: Request, res: Response) => {
    const t = await dbInstance.transaction();

    try {
      console.log("===== [/user/register/categories] HIT =====");
      console.log("Request body:", req.body);

      const { userId } = req.body;
      // support both "category" and "categories"
      let input: any = req.body.category ?? req.body.categories;

      console.log("Raw input (category/categories):", input);

      if (Array.isArray(input)) {
        console.log("Input is array, length:", input.length);

        if (input.length === 0) {
          await t.rollback();
          console.log("Empty category array");
          res.status(400).json({
            success: false,
            message: "userId and a single category are required",
          });
          return;
        }

        if (input.length > 1) {
          await t.rollback();
          console.log("More than one category sent, only one allowed");
          res.status(400).json({
            success: false,
            message: "Only one category can be selected",
          });
          return;
        }

        input = input[0];
        console.log("Normalized single input from array:", input);
      }

      // validation
      if (!userId || input === undefined || input === null) {
        await t.rollback();
        console.log("Missing userId or category value");
        res.status(400).json({
          success: false,
          message: "userId and a single category are required",
        });
        return;
      }

      const user: any = await User.findByPk(userId, { transaction: t });
      console.log(
        "Fetched user:",
        user ? { id: user.id, email: user.email } : null
      );

      if (!user) {
        await t.rollback();
        notFound(res, "User not found");
        return;
      }

      let categoryId: string | null = null;

      //  numeric ID directly
      if (typeof input === "number") {
        console.log("Category input is numeric ID:", input);
        const cat = await Category.findByPk(input, { transaction: t });
        console.log(
          "Category found by ID:",
          cat ? { id: cat.id, name: cat.name } : null
        );

        if (!cat) {
          await t.rollback();
          res.status(400).json({
            success: false,
            message: "Category ID is invalid",
          });
          return;
        }
        categoryId = cat.id;
      }
      // string input: could be a UUID id, a numeric string, or a name.
      else if (typeof input === "string") {
        const raw = input.trim();
        console.log("Category input is string:", raw);

        if (!raw) {
          await t.rollback();
          res.status(400).json({
            success: false,
            message: "Category value cannot be empty",
          });
          return;
        }

        // Detect UUID (v1-v5) pattern and treat it as an ID lookup
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        if (uuidRegex.test(raw)) {
          console.log("Detected UUID string, treating as category ID", raw);
          const cat = await Category.findByPk(raw, { transaction: t });
          console.log("Category found by ID:", cat ? { id: cat.id, name: cat.name } : null);
          if (!cat) {
            await t.rollback();
            res.status(400).json({ success: false, message: "Category ID is invalid" });
            return;
          }
          categoryId = cat.id;
        } else {
          // treat as a name (fallback)
          const name = raw;
          let cat = await Category.findOne({ where: { name }, transaction: t });
          console.log("Category found by name:", cat ? { id: cat.id, name: cat.name } : null);

          if (!cat) {
            console.log("Category not found, creating new master row...");
            cat = await Category.create(
              {
                name,
                icon: null,
                isActive: true,
                isDeleted: false,
              },
              { transaction: t }
            );
            console.log("New category created:", { id: cat.id, name: cat.name });
          }

          categoryId = cat.id;
        }
      }
      //  object { name, icon }
      else if (typeof input === "object" && input !== null) {
        const name = (input.name || "").trim();
        const icon = input.icon || null;

        console.log("Category input is object:", { name, icon });

        if (!name) {
          await t.rollback();
          res.status(400).json({
            success: false,
            message: "Category name is required",
          });
          return;
        }

        let cat = await Category.findOne({
          where: { name },
          transaction: t,
        });
        console.log(
          "Category found by object name:",
          cat ? { id: cat.id, name: cat.name } : null
        );

        if (!cat) {
          console.log(
            "Category not found, creating new master row from object..."
          );
          cat = await Category.create(
            {
              name,
              icon,
              isActive: true,
              isDeleted: false
            },
            { transaction: t }
          );
          console.log("New category created from object:", {
            id: cat.id,
            name: cat.name,
          });
        }

        categoryId = cat.id;
      } else {
        await t.rollback();
        console.log("Invalid category format, type:", typeof input);
        res.status(400).json({
          success: false,
          message: "Invalid category format",
        });
        return;
      }

      console.log("Resolved categoryId:", categoryId);

      if (!categoryId) {
        await t.rollback();
        console.log("categoryId is null after processing");
        res.status(400).json({
          success: false,
          message: "Could not resolve category",
        });
        return;
      }

      // single value store in user.categories
      user.categories = categoryId;
      user.registrationStep = 3;

      console.log("Saving user with new category:", {
        userId: user.id,
        categoryId,
        registrationStep: user.registrationStep,
      });

      await user.save({ transaction: t });

      // If user has a company, update the businessArea field with the category ID
      if (user.companyId) {
        const company: any = await Company.findByPk(user.companyId, { transaction: t });
        if (company) {
          company.businessArea = categoryId;
          await company.save({ transaction: t });
          console.log("Company businessArea updated with categoryId:", {
            companyId: company.id,
            businessArea: categoryId,
          });
        }
      }

      await t.commit();

      console.log("Category saved successfully for user:", user.id);

      const responsePayload = {
        success: true,
        message: "Category saved. Proceed to user type selection.",
        data: { categoryId },
      };

      console.log("Response payload:", responsePayload);

      res.status(200).json(responsePayload);
      return;
    } catch (error: any) {
      await t.rollback();
      console.error("Error in /user/register/categories:", error);
      ErrorLogger.write({ type: "register/categories error", error });

      serverError(res, error.message || "Failed to save category.");
      return;
    }
  }
);

// signup steps:4 User Type selection
router.post("/register/user-type", async (req: Request, res: Response): Promise<void> => {
  const t = await dbInstance.transaction();
  try {
    const { userId, userType } = req.body;

    //validation
    if (!userId || !userType) {
      await t.rollback();
      res.status(400).json({
        success: false,
        message: "userId and userType are required",
      });
    }

    // Only these two are allowed
    const allowedTypes = ["freelancer", "agency", "client"];
    if (!allowedTypes.includes(userType)) {
      await t.rollback();
      res.status(400).json({
        success: false,
        message: "Invalid userType. Use 'freelancer' or 'agency'.",
      });
    }

    // Find user
    const user: any = await User.findByPk(userId, { transaction: t });
    if (!user) {
      await t.rollback();
      notFound(res, "User not found");
    }

    if (!user.isRegistering) {
      await t.rollback();
      res.status(400).json({
        success: false,
        message: "User is not in registration flow.",
      });
    }

    // Set user type 
    user.userType = userType;
    user.registrationStep = 4;
    await user.save({ transaction: t });

    await t.commit();

    res.status(200).json({
      success: true,
      message: "User type saved. Proceed to company details.",
    });
  } catch (error: any) {
    await t.rollback();
    ErrorLogger.write({ type: "register/user-type error", error });
    serverError(res, error.message || "Failed to save user type.");
    return;
  }
});

// signup steps: 5 company creation
router.post("/register/company", async (req: Request, res: Response): Promise<void> => {
  const t = await dbInstance.transaction();
  try {
    const {
      userId,
      companyId,
      companyName,
      website,
      country,
      timezone,
      description,
      accountType,
      businessArea,
      email,
      contact,
      address,
      city,
      state,
      zipcode,
      registrationNumber,
    } = req.body;

    console.log("[/register/company] BODY:", req.body);

    // required fields
    if (!userId) {
      await t.rollback();
      res.status(400).json({
        success: false,
        message: "userId is required",
      });
    }

    if (!companyName || !country || !timezone) {
      await t.rollback();
      res.status(400).json({
        success: false,
        message:
          "companyName, country and timezone are required for company registration.",
      });
    }

    // Load user
    const user: any = await User.findByPk(userId, { transaction: t });

    console.log("[/register/company] Loaded user:", {
      userId,
      companyId: user?.companyId,
      found: !!user,
      registrationStep: user?.registrationStep,
      isRegistering: user?.isRegistering,
      userType: user?.userType,
      isEmailVerified: user?.isEmailVerified,
    });

    if (!user) {
      await t.rollback();
      notFound(res, "User not found");
    }

    // Strict signup-flow validations
    // user MUST be in signup flow
    if (!user.isRegistering) {
      await t.rollback();
      res.status(400).json({
        success: false,
        message:
          "This user is not in registration flow. Company registration is only allowed during signup.",
      });
    }

    // complete (OTP + categories + user-type)
    // if (user.registrationStep !== 4) {
    //   await t.rollback();
    //   res.status(400).json({
    //     success: false,
    //     message:
    //       "Company step is only allowed after user type selection.",
    //   });
    // }

    // only agency users can have a company in this flow
    if (user.userType !== "agency") {
      await t.rollback();
      res.status(400).json({
        success: false,
        message:
          "Company registration is only allowed for userType = 'agency'.",
      });
    }

    // email should be verified by now
    if (!user.isEmailVerified) {
      await t.rollback();
      res.status(400).json({
        success: false,
        message:
          "Email not verified. Please complete OTP verification before adding company.",
      });
    }
    // CREATE NEW COMPANY  (no companyId in payload)
    if (!companyId) {
      // user must NOT already have a company
      if (user.companyId) {
        await t.rollback();
        res.status(400).json({
          success: false,
          message:
            "User is already linked to a company. Multiple companies are not allowed in this signup flow.",
        });
        return;
      }

      // Check duplicate company name
      const existingCompany = await Company.findOne({
        where: { name: companyName },
        transaction: t,
      });

      if (existingCompany) {
        await t.rollback();
        res.status(400).json({
          success: false,
          message: "Company name already exists. Please use a different name.",
        });
        return;
      }

      // Create company via handler
      const company: any = await createCompany(
        {
          name: companyName,
          description: description || null,
          accountType: accountType || null,
          businessArea: businessArea || user.categories || null,
          website: website || null,
          email: email || user.email || null,
          contact: contact || user.contact || null,
          address: address || null,
          city: city || null,
          state: state || null,
          zipcode: zipcode || null,
          country: country || null,
          logo: null,
          timezone: timezone || null,
          registrationNumber: registrationNumber || null,
          selectedModules: null,
          no_of_clients: null,
          isActive: true,
        },
        t
      );

      console.log("[/register/company] Created company:", {
        companyId: company.id,
        name: company.name,
      });

      // Link user <-> company
      await addUserToCompany(user.id, company.id, "admin", true, t);

      user.companyId = company.id;
      user.registrationStep = 5;
      await user.save({ transaction: t });

      await t.commit();

      res.status(200).json({
        success: true,
        message: "Company details saved. Proceed to clients & modules.",
        data: {
          mode: "created",
          userId: user.id,
          companyId: company.id,
        },
      });
      return;
    }

    //UPDATE EXISTING COMPANY (companyId provided)
    // Load company by id
    const company: any = await Company.findByPk(companyId, { transaction: t });

    if (!company) {
      await t.rollback();
      notFound(res, "Company not found");
      return;
    }

    // Verify user is allowed to update this company
    if (user.companyId && user.companyId !== company.id) {
      await t.rollback();
      res.status(403).json({
        success: false,
        message: "User is not allowed to update this company.",
      });
      return;
    }

    // if user.companyId is null but FE sent companyId,
    // you can link it here in signup flow:
    if (!user.companyId) {
      user.companyId = company.id;
    }

    // Check duplicate name (if name changed, ensure not clashing with another company)
    const duplicateName = await Company.findOne({
      where: {
        name: companyName,
        id: { [Op.ne]: company.id }, // name must be unique across *other* companies
      },
      transaction: t,
    });

    if (duplicateName) {
      await t.rollback();
      res.status(400).json({
        success: false,
        message: "Another company already uses this name. Please choose a different name.",
      });
      return;
    }

    // Update company
    await company.update(
      {
        name: companyName,
        description: description || null,
        accountType: accountType || null,
        businessArea: businessArea || null,
        website: website || null,
        email: email || user.email || null,
        contact: contact || user.contact || null,
        address: address || null,
        city: city || null,
        state: state || null,
        zipcode: zipcode || null,
        country: country || null,
        timezone: timezone || null,
        registrationNumber: registrationNumber || null,
      },
      { transaction: t }
    );

    // Make sure step at least 5 after company saved/updated
    if (user.registrationStep < 5) {
      user.registrationStep = 5;
    }
    await user.save({ transaction: t });

    await t.commit();

    res.status(200).json({
      success: true,
      message: "Company details updated.",
      data: {
        mode: "updated",
        userId: user.id,
        companyId: company.id,
      },
    });
  } catch (error: any) {
    await t.rollback();
    console.error("[/register/company] ERROR:", error);
    ErrorLogger.write({ type: "register/company error", error });
    serverError(res, error.message || "Failed to save company details.");
    return;
  }
});

// signup steps: 6 final
router.post("/register/final", async (req: Request, res: Response): Promise<void> => {
  const t = await dbInstance.transaction();

  try {
    const { userId, noOfClientsRange, selectedModules } = req.body;

    console.log("[/register/final] BODY:", req.body);

    // if (!ZARKLYX_API_KEY) {
    //   await t.rollback();
    //   res.status(500).json({
    //     success: false,
    //     message:
    //       "Server API key not configured. Please set API_KEY or CRYPTO_KEY in .env",
    //   });
    //   return;
    // }

    // 1) Basic validation
    if (!userId || !noOfClientsRange || !Array.isArray(selectedModules) || selectedModules.length === 0) {
      await t.rollback();
      res.status(400).json({
        success: false,
        message: "userId, noOfClientsRange and non-empty selectedModules[] are required",
      });
    }

    // Load user
    const user: any = await User.findByPk(userId, { transaction: t });
    if (!user) {
      await t.rollback();
      notFound(res, "User not found");
      return;
    }

    if (!user.companyId) {
      await t.rollback();
      serverError(res, "Company not linked to this user.");
      return;
    }

    //  Load company
    const company: any = await Company.findByPk(user.companyId, { transaction: t });
    if (!company) {
      await t.rollback();
      notFound(res, "Company not found");
      return;
    }

    //  Parse "0-5" / "15-20" / "50+"
    const rangeStr = String(noOfClientsRange).trim();
    let upperBound: number;

    if (rangeStr.includes("-")) {
      const parts = rangeStr.split("-");
      const upperStr = parts[parts.length - 1];
      upperBound = parseInt(upperStr, 10);
    } else if (rangeStr.endsWith("+")) {
      upperBound = parseInt(rangeStr.replace("+", ""), 10);
    } else {
      upperBound = parseInt(rangeStr, 10);
    }

    if (Number.isNaN(upperBound)) {
      await t.rollback();
      res.status(400).json({
        success: false,
        message:
          "Invalid noOfClientsRange. Expected like '0-5', '5-15', '15-20' or '50+'.",
      });
    }

    //  Build  premium modules
    const moduleIds: number[] = [];

    for (const item of selectedModules) {
      //  numeric ID -> must exist
      if (typeof item === "number") {
        const existing = await PremiumModule.findByPk(item, { transaction: t });
        if (existing) {
          moduleIds.push(existing.id);
        }
        continue;
      }

      let name: string | undefined;
      let icon: string | null = null;

      // string "Campaign"
      if (typeof item === "string") {
        name = item;
      }
      //  object { name, icon }
      else if (typeof item === "object" && item !== null) {
        name = (item as any).name;
        icon = (item as any).icon || null;
      }

      if (!name) continue;
      name = name.trim();
      if (!name) continue;

      // find existing by name
      let module = await PremiumModule.findOne({
        where: { name },
        transaction: t,
      });

      // if not, create new premium module row
      if (!module) {
        module = await PremiumModule.create(
          {
            name,
            icon,
            isActive: true,
            isDeleted: false,
          },
          { transaction: t }
        );
      }

      moduleIds.push(module.id);
    }

    const distinctModuleIds = [...new Set(moduleIds)];

    if (distinctModuleIds.length === 0) {
      await t.rollback();
      res.status(400).json({
        success: false,
        message: "No valid premium provided.",
      });
    }

    //Save on company (only IDs, comma separated)
    company.no_of_clients = upperBound;
    company.selectedModules = distinctModuleIds.join(",");
    company.accountType = user.userType; // Set accountType from user's userType
    await company.save({ transaction: t });

    // Finish user registration
    user.isRegistering = false;
    user.isActive = true;
    user.registrationStep = 6;
    await user.save({ transaction: t });

    // -------- Generate Auth Token (Login Activation) --------
    const token = await generateToken(
      {
        userId: user.id,
        companyId: company.id,
        role: "user",
      },
      "7d"
    );

    // Commit transaction FIRST to save data
    await t.commit();

    console.log("[/register/final] Data saved successfully:", {
      userId: user.id,
      companyId: company.id,
      no_of_clients: company.no_of_clients,
      selectedModules: company.selectedModules,
    });

    // -------- Send Welcome Email AFTER successful save --------
    try {
      const welcomeEmailHtml = `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background-color: #4CAF50; color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; background-color: #f9f9f9; }
            .footer { text-align: center; padding: 20px; font-size: 12px; color: #666; }
            .button { display: inline-block; padding: 10px 20px; background-color: #4CAF50; color: white; text-decoration: none; border-radius: 5px; margin: 10px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Welcome to ZarklyX!</h1>
            </div>
            <div class="content">
              <h2>Hi ${user.firstName} ${user.lastName},</h2>
              <p>Congratulations! Your agency account has been successfully created.</p>
              <p><strong>Company Name:</strong> ${company.name}</p>
              <p><strong>Email:</strong> ${user.email}</p>
              <p><strong>Number of Clients:</strong> Up to ${company.no_of_clients}</p>
              <p>You can now log in to your dashboard and start managing your clients and campaigns.</p>
              <p>If you have any questions or need assistance, feel free to reach out to our support team.</p>
              <p>Best regards,<br>The ZarklyX Team</p>
            </div>
            <div class="footer">
              <p>&copy; ${new Date().getFullYear()} ZarklyX. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `;

      await sendEmail({
        from: "" as any,
        to: user.email,
        subject: "Welcome to ZarklyX - Registration Complete!",
        text: `Welcome ${user.firstName}! Your agency account has been successfully created for ${company.name}.`,
        html: welcomeEmailHtml,
        replacements: null,
        htmlFile: "" as any,
        attachments: null,
        cc: null,
        replyTo: null,
      });

      console.log("[/register/final] Welcome email sent to:", user.email);
    } catch (emailError: any) {
      console.error("[/register/final] Failed to send welcome email:", emailError);
      // Don't fail the registration if email fails - data is already saved
      ErrorLogger.write({ type: "welcome email error", error: emailError });
    }

    res.status(200).json({
      success: true,
      message: "Registration completed. Welcome to dashboard!",
      data: {
        userId: user.id,
        companyId: company.id,
        // apiKey: ZARKLYX_API_KEY,
        token,
      }

    });
  } catch (error: any) {
    await t.rollback();
    console.error("[/register/final] ERROR:", error);
    ErrorLogger.write({ type: "register/final error", error });
    serverError(res, error.message || "Failed to finalize registration.");
    return;
  }
});

// Get user by ID
router.get("/getUserID/:id", async (req: Request, res: Response): Promise<void> => {
  try {

    const { id } = req.params;
    const userId = Array.isArray(id) ? id[0] : id;
    const user: any = await getUserByid(userId);

    if (!user) {
      notFound(res, "User not found");
      return;
    }
    res.status(200).json({
      success: true,
      message: "User retrieved successfully.",
      data: user,
    });
  } catch (error: any) {
    console.error({ type: "getUserById error", error });
    serverError(res, error);
    return;
  }
});

//get all users
router.get("/getAllUser", async (req: Request, res: Response): Promise<void> => {
  try {
    const allUser = await getAllUser(req.query);

    res.status(200).json({
      success: true,
      message: "Got all users",
      data: allUser,
    });

  } catch (error: any) {
    ErrorLogger.write({ type: "getAllUser error", error });
    serverError(res, error);
    return;
  }
});

// Update user 
router.post("/updateById", async (req: Request, res: Response): Promise<void> => {
  const t = await dbInstance.transaction();
  try {
    const user = await updateUser(Number(req.body.id), req.body, t);
    await t.commit();
    res.status(200).json({
      success: true,
      message: "User updated successfully.",
      data: user,
    });
  } catch (error: any) {
    await t.rollback();
    if (
      error.name === 'SequelizeUniqueConstraintError' &&
      error.errors?.some((e: any) => e.path === 'email')
    ) {
      res.status(409).json({
        success: false,
        message: 'This email is already registered.',
        field: 'email'
      });
    }
    console.error("Users update Error:", error);
    serverError(res, "Something went wrong during user update.");
    return;
  }
});

// Delete User
router.delete("/deleteUser/:id", async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;

  // Convert 'id' to number
  const idString = Array.isArray(id) ? id[0] : id;
  const userId = parseInt(idString, 10);

  if (isNaN(userId)) {
    res.status(400).send("Invalid user ID");
  }

  const t = await dbInstance.transaction();

  try {
    const user = await deleteUser(userId, t);

    if (!user) {
      await t.rollback();
      notFound(res, "User not found");
      return;
    }

    await t.commit();
    res.status(200).json({
      success: true,
      message: "User deleted successfully.",
      data: user,
    });
    // return sendEncryptedResponse(res, user, "User deleted successfully (soft delete).");
  } catch (error: any) {
    await t.rollback();
    ErrorLogger.write({ type: "deleteUser error", error });
    serverError(res, error.message || "Something went wrong while deleting user.");
    return;
  }
});

//Update Users Theme
router.post("/updateTheme", async (req, res) => {
  const t = await dbInstance.transaction();
  try {
    const user = await updateTheme(Number(req.body.id), req.body, t);
    await t.commit();

    sendEncryptedResponse(res, user, "User updated successfully");
  } catch (error: any) {
    await t.rollback();
    serverError(res, error);
  }
});

// ========================= TWO-FACTOR AUTHENTICATION ENDPOINTS =========================

// 1. Generate 2FA Secret and QR Code
// POST /user/2fa/setup/step1
// Step 1: Send confirmation code via email
router.post("/2fa/setup/step1", async (req: Request, res: Response): Promise<void> => {
  try {
    const authUser: any = (req as any).user;

    if (!authUser || !authUser.id) {
      unauthorized(res, "Invalid or missing token user.");
      return;
    }

    const user: any = await User.findByPk(authUser.id);
    if (!user) {
      notFound(res, "User not found");
      return;
    }

    // Generate 6-digit confirmation code
    const confirmationCode = Math.floor(100000 + Math.random() * 900000).toString();
    const codeExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Store temporarily in session/cache (or in a temp field in user table)
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
            <h1>2FA Setup Confirmation</h1>
          </div>
          <p>Hi ${user.firstName || 'User'},</p>
          <p>You have initiated 2-Factor Authentication setup for your ZarklyX account.</p>
          <p>Please enter the confirmation code below to proceed:</p>
          <div class="code">${confirmationCode}</div>
          <p><strong>This code will expire in 10 minutes.</strong></p>
          <p>If you did not request this, please ignore this email and contact support.</p>
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} ZarklyX. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    await sendEmail({
      to: user.email,
      subject: "ZarklyX - 2FA Setup Confirmation Code",
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
    console.error("[2fa/setup/step1] ERROR:", error);
    ErrorLogger.write({ type: "2fa/setup/step1 error", error });
    serverError(res, error.message || "Failed to send confirmation code.");
  }
});

// POST /user/2fa/setup/step2
// Step 2: Verify email confirmation code
router.post("/2fa/setup/step2", async (req: Request, res: Response): Promise<void> => {
  try {
    const authUser: any = (req as any).user;
    const { confirmationCode } = req.body;

    if (!authUser || !authUser.id) {
      unauthorized(res, "Invalid or missing token user.");
      return;
    }

    if (!confirmationCode) {
      res.status(400).json({
        success: false,
        message: "Confirmation code is required.",
      });
      return;
    }

    const user: any = await User.findByPk(authUser.id);
    if (!user) {
      notFound(res, "User not found");
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
      name: `ZarklyX (${user.email})`,
      issuer: 'ZarklyX',
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
            name: "NordPass",
            icon: "nordpass",
            downloadUrl: "https://nordpass.com/",
          },
        ],
      },
    });
  } catch (error: any) {
    console.error("[2fa/setup/step2] ERROR:", error);
    ErrorLogger.write({ type: "2fa/setup/step2 error", error });
    serverError(res, error.message || "Failed to verify confirmation code.");
  }
});

// POST /user/2fa/setup (kept for backward compatibility, now calls step 1)
router.post("/2fa/setup", async (req: Request, res: Response): Promise<void> => {
  try {
    const authUser: any = (req as any).user;

    if (!authUser || !authUser.id) {
      unauthorized(res, "Invalid or missing token user.");
      return;
    }

    const user: any = await User.findByPk(authUser.id);
    if (!user) {
      notFound(res, "User not found");
      return;
    }

    // Generate 6-digit confirmation code
    const confirmationCode = Math.floor(100000 + Math.random() * 900000).toString();
    const codeExpiry = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Store temporarily
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
            <h1>2FA Setup Confirmation</h1>
          </div>
          <p>Hi ${user.firstName || 'User'},</p>
          <p>You have initiated 2-Factor Authentication setup for your ZarklyX account.</p>
          <p>Please enter the confirmation code below to proceed:</p>
          <div class="code">${confirmationCode}</div>
          <p><strong>This code will expire in 10 minutes.</strong></p>
          <p>If you did not request this, please ignore this email and contact support.</p>
          <div class="footer">
            <p>&copy; ${new Date().getFullYear()} ZarklyX. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `;

    await sendEmail({
      to: user.email,
      subject: "ZarklyX - 2FA Setup Confirmation Code",
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
    console.error("[2fa/setup] ERROR:", error);
    ErrorLogger.write({ type: "2fa/setup error", error });
    serverError(res, error.message || "Failed to setup 2FA.");
  }
});

// POST /user/2fa/setup/step3
// Step 3: Verify TOTP code and generate backup codes
router.post("/2fa/setup/step3", async (req: Request, res: Response): Promise<void> => {
  const t = await dbInstance.transaction();
  try {
    const authUser: any = (req as any).user;
    const { totpCode } = req.body;

    if (!authUser || !authUser.id) {
      await t.rollback();
      unauthorized(res, "Invalid or missing token user.");
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

    const user: any = await User.findByPk(authUser.id, { transaction: t });
    if (!user) {
      await t.rollback();
      notFound(res, "User not found");
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
        step: 4,
        twofactorEnabled: true,
        backupCodes: backupCodes,
        warning: "Save these backup codes in a safe place. You will need them if you lose access to your authenticator app. Each code can only be used once.",
      },
    });
  } catch (error: any) {
    await t.rollback();
    console.error("[2fa/setup/step3] ERROR:", error);
    ErrorLogger.write({ type: "2fa/setup/step3 error", error });
    serverError(res, error.message || "Failed to verify TOTP code.");
  }
});

// 2. Verify and Enable 2FA
// POST /user/2fa/enable (kept for backward compatibility, now calls step 3)
// Body: { verificationCode }
router.post("/2fa/enable", async (req: Request, res: Response): Promise<void> => {
  const t = await dbInstance.transaction();
  try {
    const authUser: any = (req as any).user;
    const { verificationCode } = req.body;

    if (!authUser || !authUser.id) {
      await t.rollback();
      unauthorized(res, "Invalid or missing token user.");
      return;
    }

    if (!verificationCode) {
      await t.rollback();
      res.status(400).json({
        success: false,
        message: "verificationCode is required",
      });
      return;
    }

    const user: any = await User.findByPk(authUser.id, { transaction: t });
    if (!user) {
      await t.rollback();
      notFound(res, "User not found");
      return;
    }

    // Check if temp secret exists
    if (!user.temp2FASecret) {
      await t.rollback();
      res.status(400).json({
        success: false,
        message: "2FA setup not initiated. Please start from /2fa/setup.",
      });
      return;
    }

    // Verify the code against the temp secret
    const verified = speakeasy.totp.verify({
      secret: user.temp2FASecret,
      encoding: 'base32',
      token: verificationCode,
      window: 2 // Allow 2 time windows (±30 seconds)
    });

    if (!verified) {
      await t.rollback();
      res.status(400).json({
        success: false,
        message: "Invalid verification code. Please try again.",
      });
      return;
    }

    // Generate backup codes
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
        twofactorEnabled: true,
        backupCodes: backupCodes,
        warning: "Save these backup codes in a safe place. You will need them if you lose access to your authenticator app.",
      },
    });
  } catch (error: any) {
    await t.rollback();
    console.error("[2fa/enable] ERROR:", error);
    ErrorLogger.write({ type: "2fa/enable error", error });
    serverError(res, error.message || "Failed to enable 2FA.");
  }
});

// 3. Disable 2FA
// POST /user/2fa/disable
// Body: { password } - require password for security
router.post("/2fa/disable", async (req: Request, res: Response): Promise<void> => {
  const t = await dbInstance.transaction();
  try {
    const authUser: any = (req as any).user;
    const { password } = req.body;

    if (!authUser || !authUser.id) {
      await t.rollback();
      unauthorized(res, "Invalid or missing token user.");
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

    const user: any = await User.findByPk(authUser.id, { transaction: t });
    if (!user) {
      await t.rollback();
      notFound(res, "User not found");
      return;
    }

    // Verify password
    const isPasswordValid = await checkPassword(password, user.password);
    if (!isPasswordValid) {
      await t.rollback();
      unauthorized(res, "Invalid password.");
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
    console.error("[2fa/disable] ERROR:", error);
    ErrorLogger.write({ type: "2fa/disable error", error });
    serverError(res, error.message || "Failed to disable 2FA.");
  }
});

// 4. Verify 2FA Code during Login
// POST /user/2fa/verify-login
// Body: { userId, totpCode, backupCode? }
router.post("/2fa/verify-login", async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId, totpCode, backupCode } = req.body;

    if (!userId || (!totpCode && !backupCode)) {
      res.status(400).json({
        success: false,
        message: "userId and either totpCode or backupCode are required",
      });
      return;
    }

    const user: any = await User.findByPk(userId);
    if (!user) {
      notFound(res, "User not found");
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
      // Record failed login attempt
      await recordFailedLogin(user?.id || null, "OTP", req, "Invalid 2FA code");
      res.status(400).json({
        success: false,
        message: "Invalid 2FA code or backup code.",
      });
      return;
    }

    // 2FA verified, generate token
    const tokenPayload = {
      id: user.id,
      email: user.email,
      contact: user.contact,
      companyId: user.companyId || null,
    };

    const token = await generateToken(tokenPayload, "30d");

    // Create login history for successful 2FA verification
    const loginHistoryResult = await createLoginHistory(
      user.id,
      "OTP",
      req,
      token,
      "SUCCESS"
    );

    const nameData = user.email || user.contact || `User ID ${user.id}`;
    res.status(200).json({
      success: true,
      message: `2FA verified successfully for ${nameData}.`,
      data: {
        userId: user.id,
        companyId: user.companyId || null,
        token: token,
        sessionId: loginHistoryResult.success ? loginHistoryResult.sessionId : null,
      },
    });
  } catch (error: any) {
    console.error("[2fa/verify-login] ERROR:", error);
    ErrorLogger.write({ type: "2fa/verify-login error", error });
    serverError(res, error.message || "Failed to verify 2FA code.");
  }
});

// 5. Get 2FA Status
// GET /user/2fa/status
router.get("/2fa/status", async (req: Request, res: Response): Promise<void> => {
  try {
    const authUser: any = (req as any).user;

    if (!authUser || !authUser.id) {
      unauthorized(res, "Invalid or missing token user.");
      return;
    }

    const user: any = await User.findByPk(authUser.id, {
      attributes: ['id', 'email', 'twofactorEnabled', 'twofactorVerified']
    });

    if (!user) {
      notFound(res, "User not found");
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
    console.error("[2fa/status] ERROR:", error);
    ErrorLogger.write({ type: "2fa/status error", error });
    serverError(res, error.message || "Failed to get 2FA status.");
  }
});

// 6. Regenerate Backup Codes
// POST /user/2fa/regenerate-backup-codes
// Body: { password }
router.post("/2fa/regenerate-backup-codes", async (req: Request, res: Response): Promise<void> => {
  const t = await dbInstance.transaction();
  try {
    const authUser: any = (req as any).user;
    const { password } = req.body;

    if (!authUser || !authUser.id) {
      await t.rollback();
      unauthorized(res, "Invalid or missing token user.");
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

    const user: any = await User.findByPk(authUser.id, { transaction: t });
    if (!user) {
      await t.rollback();
      notFound(res, "User not found");
      return;
    }

    // Verify password
    const isPasswordValid = await checkPassword(password, user.password);
    if (!isPasswordValid) {
      await t.rollback();
      unauthorized(res, "Invalid password.");
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
      backupCodes.push(speakeasy.generateSecret({ length: 8 }).base32);
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
    console.error("[2fa/regenerate-backup-codes] ERROR:", error);
    ErrorLogger.write({ type: "2fa/regenerate-backup-codes error", error });
    serverError(res, error.message || "Failed to regenerate backup codes.");
  }
});

// login
router.post("/login", async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, contact, password, otp, fcmToken } = req.body;

    // validation 
    if (!email && !contact) {
      serverError(res, "Email or mobile number is required for login.");
      return;
    }
    if (!password) {
      serverError(res, "Password is required for login.");
      return;
    }

    // Find user by email / contact 
    const findCondition: any = {};
    if (email) findCondition.email = email;
    if (contact) findCondition.contact = contact;

    const user: any = await User.findOne({ where: findCondition });
    if (!user) {
      serverError(res, "User not found. Please register first.");
      return;
    }

    //Check password 
    const isPasswordValid = await checkPassword(password, user.password);
    if (!isPasswordValid) {
      // Record failed login attempt
      await recordFailedLogin(user?.id || null, "PASSWORD", req, "Invalid password");
      unauthorized(res, "Invalid email/contact or password.");
      return;
    }

    // registration completed & email verified
    if (!user.isEmailVerified) {
      serverError(
        res,
        "Email not verified. Please complete signup first."
      );
      return;
    }

    // ===== AUTO-GENERATE SECRET CODE FOR CLIENTS =====
    if (user.userType === "client" && !user.secretCode) {
      const secretCode = await generateUniqueSecretCode();
      user.secretCode = secretCode;
      await user.save();
      console.log(`[Login] Generated secretCode for client user: ${user.id}`);
    }

    // ===== OTP LOGIN (SKIP 2FA) =====
    // If OTP is provided, verify it and login directly (no 2FA required)
    if (otp) {
      const otpRecord: any = await Otp.findOne({
        where: {
          userId: user.id,
          loginOTP: String(otp),
          isDeleted: false,
        },
      });
      if (!otpRecord) {
        // Record failed login attempt
        await recordFailedLogin(user?.id || null, "OTP", req, "Invalid login OTP");
        unauthorized(res, "Invalid login OTP.");
        return;
      }

      const now = new Date();
      if (otpRecord.otpExpiresAt && otpRecord.otpExpiresAt < now) {
        // Record failed login attempt
        await recordFailedLogin(user?.id || null, "OTP", req, "Login OTP has expired");
        unauthorized(res, "Login OTP has expired. Please try again.");
        return;
      }

      // Mark login OTP as used
      otpRecord.loginOTP = null;
      otpRecord.otpExpiresAt = null;
      otpRecord.otpVerify = true;
      await otpRecord.save();

      // Generate JWT token (FINAL login via OTP - no 2FA required)
      const tokenPayload = {
        id: user.id,
        email: user.email,
        contact: user.contact,
        companyId: user.companyId || null,
      };

      const token = await generateToken(tokenPayload, "30d");

      // Create login history for successful OTP verification
      const loginHistoryResult = await createLoginHistory(
        user.id,
        "OTP",
        req,
        token,
        "SUCCESS"
      );

      const nameData = user.email || user.contact || `User ID ${user.id}`;
      sendEncryptedResponse(
        res,
        {
          userId: user.id,
          token,
          sessionId: loginHistoryResult.success ? loginHistoryResult.sessionId : null,
        },
        `Login successful for ${nameData}.`
      );
      return;
    }

    // ===== PASSWORD-ONLY LOGIN (CHECK 2FA) =====
    // If no OTP provided, check if 2FA is enabled
    if (user.twofactorEnabled && user.twofactorVerified) {
      // 2FA is enabled, request 2FA code instead of generating token
      res.status(200).json({
        success: true,
        message: "Password verified. Please provide 2FA code to complete login.",
        data: {
          userId: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          requires2FA: true,
        },
      });
      return;
    }

    // Password-only login (no 2FA, no OTP) - generate token directly
    const tokenPayload = {
      id: user.id,
      email: user.email,
      contact: user.contact,
      companyId: user.companyId || null,
    };

    const token = await generateToken(tokenPayload, "30d");

    // Create login history for successful password verification
    const loginHistoryResult = await createLoginHistory(
      user.id,
      "PASSWORD",
      req,
      token,
      "SUCCESS"
    );

    const nameData = user.email || user.contact || `User ID ${user.id}`;
    res.status(200).json({
      success: true,
      userId: user.id,
      companyId: user.companyId || null,
      ...(user.isRegistering ? {} : { token }),
      isRegistering: user.isRegistering,
      sessionId: loginHistoryResult.success ? loginHistoryResult.sessionId : null,
      message: `Password verified. ${nameData}.`,
    });
  } catch (error: any) {
    console.error("Error in /login:", error);
    serverError(res, "Something went wrong during login.");
  }
});

//  verify-otp for login 
router.post("/login/verify-otp", async (req: Request, res: Response): Promise<void> => {
  try {
    const { userId, otp } = req.body;

    if (!userId || !otp) {
      res.status(400).json({
        success: false,
        message: "userId and otp are required",
      });
    }

    const user: any = await User.findByPk(userId);
    if (!user) {
      notFound(res, "User not found");
      return;
    }

    const otpRecord: any = await Otp.findOne({
      where: {
        userId: user.id,
        // loginOTP: String(otp),
        isDeleted: false,
        [Op.or]: [{ otp: String(otp) }, { loginOTP: String(otp) }]
      },
    });

    if (!otpRecord) {
      unauthorized(res, "Invalid login OTP.");
      return;
    }

    const now = new Date();
    if (otpRecord.otpExpiresAt && otpRecord.otpExpiresAt < now) {
      unauthorized(res, "Login OTP has expired. Please try again.");
      return;
    }

    otpRecord.loginOTP = null;
    otpRecord.otpExpiresAt = null;
    otpRecord.otpVerify = true;
    await otpRecord.save();

    const tokenPayload = {
      id: user.id,
      email: user.email,
      contact: user.contact,
      companyId: user.companyId || null,
    };

    const token = await generateToken(tokenPayload, "30d");

    const nameData = user.email || user.contact || `User ID ${user.id}`;

    res.status(200).json({
      success: true,
      message: `Login successful for ${nameData}.`,
      data: {
        userId: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        secretCode: user.secretCode || null,
        companyId: user.companyId || null,
        ...(user.isRegistering ? {} : { token }),
        isRegistering: user.isRegistering,
      },
    });
  } catch (error: any) {
    console.error("Error in /login/verify-otp:", error);
    serverError(res, "Something went wrong during login OTP verification.");
    return;
  }
});

//change password 
router.post("/changePassword",
  async (req: Request, res: Response): Promise<void> => {
    const t = await dbInstance.transaction();

    try {
      const { oldPassword, newPassword, confirmPassword } = req.body;

      // validation
      if (!oldPassword || !newPassword || !confirmPassword) {
        await t.rollback();
        res.status(400).json({
          success: false,
          message: "oldPassword, newPassword and confirmPassword are required",
        });
      }

      if (newPassword !== confirmPassword) {
        await t.rollback();
        res.status(400).json({
          success: false,
          message: "newPassword and confirmPassword must match",
        });
      }

      if (newPassword.length < 6) {
        await t.rollback();
        res.status(400).json({
          success: false,
          message: "New password must be at least 6 characters.",
        });
      }

      //  Get logged-in user ID from token
      const authUser: any = (req as any).user;

      if (!authUser || !authUser.id) {
        await t.rollback();
        unauthorized(res, "Invalid or missing token user.");
      }

      const user = await User.findByPk(authUser.id, {
        attributes: ["id", "email", "password"],
        transaction: t,
      });

      if (!user) {
        await t.rollback();
        other(res, 404, "User not found.");
        return;
      }
      // if (!user) return; 
      //  Check old password
      const isOldValid = await checkPassword(oldPassword, user.password);
      if (!isOldValid) {
        await t.rollback();
        other(res, 400, "Your old password is wrong.");
        return;
      }

      // Set new password 
      user.password = newPassword;
      await user.save({ transaction: t });

      await t.commit();

      res.status(200).json({
        success: true,
        message: "Your password has been successfully updated.",
      });
    } catch (error: any) {
      await t.rollback();
      ErrorLogger.write({ type: "changePassword error", error });
      serverError(res, error.message || "Failed to change password.");
      return;
    }
  }
);

// forgot password
router.post("/forgotPassword",
  async (req: Request, res: Response): Promise<void> => {
    const t = await dbInstance.transaction();

    try {
      const { email, contact, password, confirmPassword } = req.body;

      // Validate email 
      if (!email && !contact) {
        await t.rollback();
        res.status(400).json({
          success: false,
          message: "Email or contact is required",
        });
        return;
      }

      if (!password || !confirmPassword) {
        await safeRollback(t);
        res.status(400).json({
          success: false,
          message: "password and confirmPassword are required",
        });
        return;
      }

      if (password !== confirmPassword) {
        await safeRollback(t);
        res.status(400).json({
          success: false,
          message: "password and confirmPassword must match",
        });
        return;
      }

      if (password.length < 6) {
        await safeRollback(t);
        res.status(400).json({
          success: false,
          message: "Password must be at least 6 characters.",
        });
        return;
      }

      const conditions: any[] = [];
      if (email) conditions.push({ email });
      if (contact) conditions.push({ contact });

      //  Find user 
      const user: any = await User.findOne({
        where: {
          [Op.or]: [conditions]
        }
      });

      if (!user) {
        await t.rollback();
        res.status(404).json({
          success: false,
          message: "User not found with this email.",
        });
        return;
      }

      //  Generate new password 
      // const newPWD = generateRandomPassword(); // e.g. "Xyz@1234"

      // //  Send email with new password 
      // const mailData: any = {
      //   to: email,
      //   subject: "ZarklyX - New Password",
      //   html: <p>Your new password is <strong>${newPWD}</strong></p>.,
      // };


      // await sendEmail(mailData);

      //  Update user password (model setter will hash) 
      user.password = password;
      await user.save({ transaction: t });

      await t.commit();

      res.status(200).json({
        success: true,
        message: "Password has been successfully updated. Please login with your new password.",
      });
      return;
    } catch (error: any) {
      await t.rollback();
      ErrorLogger.write({ type: "forgotPassword error", error });

      serverError(res, error?.message || "Something went wrong.");
      return;
    }
  }
);

// LOGIN with Google - checks if user exists
router.post("/auth/google-login", async (req: Request, res: Response): Promise<void> => {
  res.setHeader('Content-Type', 'application/json');
  try {
    const body = req.body || {};
    const { code, credential } = body;

    if (code) {
      await handleAuthorizationCodeLogin(code, req, res);
    } else if (credential) {
      await handleCredentialTokenLogin(credential, req, res);
    } else {
      res.status(400).json({
        success: false,
        message: "Google code or credential is required",
      });
      return;
    }
  } catch (error: any) {
    console.error("[/user/auth/google-login] ERROR:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Google login failed",
    });
    return;
  }
});

// SIGNUP with Google - creates new account
router.post("/auth/google-signup", async (req: Request, res: Response): Promise<void> => {
  res.setHeader('Content-Type', 'application/json');
  try {
    const body = req.body || {};
    const { code, credential } = body;

    if (code) {
      await handleAuthorizationCodeSignup(code, req, res);
    } else if (credential) {
      await handleCredentialTokenSignup(credential, req, res);
    } else {
      res.status(400).json({
        success: false,
        message: "Google code or credential is required",
      });
      return;
    }
  } catch (error: any) {
    console.error("[/user/auth/google-signup] ERROR:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Google signup failed",
    });
    return;
  }
});

// LOGIN: Handle Authorization Code
async function handleAuthorizationCodeLogin(code: string, req: Request, res: Response): Promise<void> {
  try {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      'postmessage'
    );

    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    const oauth2 = google.oauth2({
      auth: oauth2Client,
      version: 'v2'
    });

    const userInfo = await oauth2.userinfo.get();
    const userData = userInfo.data;

    if (!userData || !userData.email) {
      res.setHeader('Content-Type', 'application/json');
      res.status(401).json({
        success: false,
        message: "Failed to get user information from Google",
      });
      return;
    }

    const googleId = userData.id || '';
    const email = userData.email;
    const firstName = userData.given_name || '';
    const lastName = userData.family_name || '';
    const picture = userData.picture || '';
    const emailVerified = userData.verified_email || false;

    await processGoogleUserLogin({
      googleId,
      email,
      firstName,
      lastName,
      picture,
      emailVerified
    }, res);

  } catch (error: any) {
    console.error("[handleAuthorizationCodeLogin] ERROR:", error);
    res.setHeader('Content-Type', 'application/json');
    res.status(401).json({
      success: false,
      message: error.message || "Failed to exchange authorization code",
    });
  }
}

// LOGIN: Handle Credential Token
async function handleCredentialTokenLogin(credential: string, req: Request, res: Response): Promise<void> {
  try {
    const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();

    if (!payload) {
      res.setHeader('Content-Type', 'application/json');
      res.status(401).json({
        success: false,
        message: "Invalid Google token",
      });
      return;
    }

    const googleId = payload.sub;
    const email = payload.email || '';
    const firstName = payload.given_name || '';
    const lastName = payload.family_name || '';
    const picture = payload.picture || '';
    const emailVerified = payload.email_verified || false;

    await processGoogleUserLogin({
      googleId,
      email,
      firstName,
      lastName,
      picture,
      emailVerified
    }, res);

  } catch (error: any) {
    console.error("[handleCredentialTokenLogin] ERROR:", error);
    res.setHeader('Content-Type', 'application/json');
    res.status(401).json({
      success: false,
      message: error.message || "Token verification failed",
    });
  }
}

// SIGNUP: Handle Authorization Code
async function handleAuthorizationCodeSignup(code: string, req: Request, res: Response): Promise<void> {
  try {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      'postmessage'
    );

    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    const oauth2 = google.oauth2({
      auth: oauth2Client,
      version: 'v2'
    });

    const userInfo = await oauth2.userinfo.get();
    const userData = userInfo.data;

    if (!userData || !userData.email) {
      res.status(401).json({
        success: false,
        message: "Failed to get user information from Google",
      });
      return;
    }

    const googleId = userData.id || '';
    const email = userData.email;
    const firstName = userData.given_name || '';
    const lastName = userData.family_name || '';
    const picture = userData.picture || '';
    const emailVerified = userData.verified_email || false;

    await processGoogleUserSignup({
      googleId,
      email,
      firstName,
      lastName,
      picture,
      emailVerified
    }, res);

  } catch (error: any) {
    console.error("[handleAuthorizationCodeSignup] ERROR:", error);
    res.setHeader('Content-Type', 'application/json');
    res.status(401).json({
      success: false,
      message: error.message || "Failed to exchange authorization code",
    });
  }
}

// SIGNUP: Handle Credential Token
async function handleCredentialTokenSignup(credential: string, req: Request, res: Response): Promise<void> {
  try {
    const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();

    if (!payload) {
      res.setHeader('Content-Type', 'application/json');
      res.status(401).json({
        success: false,
        message: "Invalid Google token",
      });
      return;
    }

    const googleId = payload.sub;
    const email = payload.email || '';
    const firstName = payload.given_name || '';
    const lastName = payload.family_name || '';
    const picture = payload.picture || '';
    const emailVerified = payload.email_verified || false;

    await processGoogleUserSignup({
      googleId,
      email,
      firstName,
      lastName,
      picture,
      emailVerified
    }, res);

  } catch (error: any) {
    console.error("[handleCredentialTokenSignup] ERROR:", error);
    res.setHeader('Content-Type', 'application/json');
    res.status(401).json({
      success: false,
      message: error.message || "Token verification failed",
    });
  }
}

// LOGIN: Only logs in existing users
async function processGoogleUserLogin(userData: {
  googleId: string;
  email: string;
  firstName: string;
  lastName: string;
  picture: string;
  emailVerified: boolean;
}, res: Response): Promise<void> {
  try {
    const { googleId, email, firstName, lastName, picture, emailVerified } = userData;

    if (!email) {
      res.setHeader('Content-Type', 'application/json');
      res.status(401).json({
        success: false,
        message: "Email is required from Google account",
      });
      return;
    }

    // Check if user exists
    let user: any = await User.findOne({
      where: {
        [Op.or]: [
          { email: email },
          { googleId: googleId }
        ]
      }
    });

    // User must exist for login
    if (!user) {
      res.setHeader('Content-Type', 'application/json');
      res.status(400).json({
        success: false,
        message: "User not registered. Please sign up first.",
        data: {
          isNew: true,
          needsSignup: true,
        },
      });
      return;
    }

    // Update Google info if missing
    let needsUpdate = false;
    if (!user.googleId) {
      user.googleId = googleId;
      needsUpdate = true;
    }
    if (!user.isEmailVerified && emailVerified) {
      user.isEmailVerified = emailVerified;
      needsUpdate = true;
    }
    if (needsUpdate) {
      await user.save();
    }

    // Generate JWT token
    const token = await generateToken(
      {
        userId: user.id,
        companyId: user.companyId || null,
        role: "user",
      },
      "7d"
    ) as string;

    res.setHeader('Content-Type', 'application/json');
    res.status(200).json({
      success: true,
      message: "Login successful",
      data: {
        userId: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        companyId: user.companyId || null,
        token: token,
        isNew: false,
        isRegistering: user.isRegistering,
      },
    });
  } catch (error: any) {
    console.error("[processGoogleUserLogin] ERROR:", error);
    res.setHeader('Content-Type', 'application/json');
    res.status(500).json({
      success: false,
      message: error.message || "Failed to process Google login",
    });
  }
}

// SIGNUP: Creates new user account
async function processGoogleUserSignup(userData: {
  googleId: string;
  email: string;
  firstName: string;
  lastName: string;
  picture: string;
  emailVerified: boolean;
}, res: Response): Promise<void> {
  try {
    const { googleId, email, firstName, lastName, picture, emailVerified } = userData;

    if (!email) {
      res.setHeader('Content-Type', 'application/json');
      res.status(401).json({
        success: false,
        message: "Email is required from Google account",
      });
      return;
    }

    // Check if user already exists
    let user: any = await User.findOne({
      where: {
        [Op.or]: [
          { email: email },
          { googleId: googleId }
        ]
      }
    });

    let isNew = false;

    // If user exists, just login them
    if (user) {
      // Update Google info if missing
      let needsUpdate = false;
      if (!user.googleId) {
        user.googleId = googleId;
        needsUpdate = true;
      }
      if (!user.isEmailVerified && emailVerified) {
        user.isEmailVerified = emailVerified;
        needsUpdate = true;
      }
      if (needsUpdate) {
        await user.save();
      }
    } else {
      // Create new user
      isNew = true;
      user = await User.create({
        email: email,
        googleId: googleId,
        firstName: firstName || "",
        lastName: lastName || "",
        contact: null as any,
        userType: null as any,
        secretCode: await generateUniqueSecretCode(),
        isThemeDark: false,
        password: null as any,
        countryCode: null as any,
        categories: null as any,
        isDeleted: false,
        deletedAt: null as any,
        isEmailVerified: emailVerified,
        isMobileVerified: false,
        isRegistering: true,  // Mark as incomplete registration
        registrationStep: 1,
        isActive: true,
        companyId: null as any,
        referId: null as any,
        authProvider: "google",
        twofactorEnabled: false,
        twofactorVerified: false,
      });

      console.log(`[Google Signup] New user created: ${email}`);
    }

    // Generate JWT token
    const token = await generateToken(
      {
        userId: user.id,
        companyId: user.companyId || null,
        role: "user",
      },
      "7d"
    ) as string;

    const message = isNew ? "Account created successfully" : "Signup successful";

    res.setHeader('Content-Type', 'application/json');
    res.status(200).json({
      success: true,
      message: message,
      data: {
        userId: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        companyId: user.companyId || null,
        token: token,
        isNew: isNew,
        isRegistering: user.isRegistering,
      },
    });
  } catch (error: any) {
    console.error("[processGoogleUserSignup] ERROR:", error);
    res.setHeader('Content-Type', 'application/json');
    res.status(500).json({
      success: false,
      message: error.message || "Failed to process Google signup",
    });
  }
}
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
    console.error("[/user/auth/verify-google] ERROR:", error);
    res.status(401).json({
      success: false,
      message: error.message || "Token verification failed",
    });
    return;
  }
});

// Check if user exists (for signup/signin flow)
router.post("/check-user-exists", async (req: Request, res: Response): Promise<void> => {
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

    // Check if user exists
    const user = await User.findOne({
      where: whereCondition,
      attributes: ["id", "email", "contact", "isEmailVerified"],
      raw: true,
    });

    if (user) {
      // User exists
      res.status(200).json({
        success: true,
        exists: true,
        isEmailVerified: user.isEmailVerified,
        message: "User already registered. Please sign in.",
      });
    } else {
      // User does not exist
      res.status(200).json({
        success: true,
        exists: false,
        message: "User not registered. Please sign up first.",
      });
    }
  } catch (error: any) {
    console.error("Error in /check-user-exists:", error);
    serverError(res, "Error checking user existence");
  }
});

export default router;
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
import {
  updateUser,
  deleteUser,
  getUserByid,
  getAllUser,
  updateTheme,
  UserData,
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
// import { responseEncoding } from "axios";
// import { verifyGoogleIdToken } from "../../../../services/google-auth-service";

const ZARKLYX_API_KEY =
  process.env.RESPONSE_ENCRYPTION_KEY || process.env.CRYPTO_KEY || "";

const router = express.Router();
// type Params = { id: string };

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
        await t.rollback();
        res.status(400).json({
          success: false,
          message: "firstName, lastName, email, contact are required",
        });
        return;
      }

      //  Password validations 
      if (!password || !confirmPassword) {
        await t.rollback();
        res.status(400).json({
          success: false,
          message: "password and confirmPassword are required",
        });
        return;
      }

      if (password !== confirmPassword) {
        await t.rollback();
        res.status(400).json({
          success: false,
          message: "password and confirmPassword must match",
        });
        return;
      }

      if (password.length < 6) {
        await t.rollback();
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
        await t.rollback();
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
        await t.rollback();
        res.status(400).json({
          success: false,
          message: "Could not detect country code for given contact.",
        });
        return;
      }

      const localNumber = digitsOnly;

      // if (countryCode) {
      //   finalCountryCode = String(countryCode).trim();
      // }

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
        await t.rollback();
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

      // Generate OTP 
      const otpCode = generateOTP();
      const expiry = new Date(Date.now() + 10 * 60 * 1000); // 10 min

      // find existing otp record for this email, else create new
      let otpRecord = await Otp.findOne({
        where: { email },
        transaction: t,
      });

      if (!otpRecord) {
        otpRecord = await Otp.create(
          {
            userId: null,
            email,
            contact: localNumber,
            otp: otpCode,
            mbOTP: null,
            loginOTP: null,
            otpVerify: false,
            otpExpiresAt: expiry,
            mbOTPExpiresAt: null,
            isDeleted: false,
            isEmailVerified: false,
            isMobileVerified: false,
            isActive: true,
            tempUserData,
          },
          { transaction: t }
        );
      } else {
        otpRecord.email = email;
        otpRecord.contact = localNumber;
        otpRecord.otp = otpCode;
        otpRecord.otpExpiresAt = expiry;
        otpRecord.otpVerify = false;
        otpRecord.isDeleted = false;
        otpRecord.tempUserData = tempUserData;
        await otpRecord.save({ transaction: t });
      }

      // / Send OTP on email 
      const sendResult = await sendOTP({ email, otp: otpCode }, "register");
      if (!sendResult || !sendResult.success) {
        await t.rollback();
        serverError(res, sendResult?.message || "Failed to send OTP.");
        return;
      }

      await t.commit();

      // No user row yet – only OTP record is inserted/updated
      res.status(200).json({
        success: true,
        message: `Signup step 1 done. OTP sent to ${email}.`,
        data: {
          otpRefId: otpRecord.id,
          email,
          countryCode: finalCountryCode,
        },
      });
      return;
    } catch (error: any) {
      await t.rollback();
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
      const { email, otp } = req.body;

      if (!email || !otp) {
        await t.rollback();
        res.status(400).json({
          success: false,
          message: "email and otp are required",
        });
        return;
      }

      // Find OTP record
      const otpRecord: any = await Otp.findOne({
        where: {
          email,
          otp: String(otp),
          otpVerify: false,
          isDeleted: false,
        },
        transaction: t,
      });

      if (!otpRecord) {
        await t.rollback();
        unauthorized(res, "Invalid OTP.");
        return;
      }

      // Expiry check
      if (otpRecord.otpExpiresAt && otpRecord.otpExpiresAt < new Date()) {
        await t.rollback();
        unauthorized(res, "OTP has expired.");
        return;
      }

      //  Ensure we still have tempUserData
      if (!otpRecord.tempUserData) {
        await t.rollback();
        serverError(res, "Registration data not found for this OTP.");
        return;
      }

      const tempUserData: any = otpRecord.tempUserData;

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
      const user: any = await User.create(
        {
          ...tempUserData,
          isDeleted: false,
          isEmailVerified: true,
          isMobileVerified: false,
          isRegistering: true,
          registrationStep: 2,
          isActive: false, // or true if you want auto-activate
        },
        { transaction: t }
      );

      // Update OTP record:  userId + mark verified + clear temp data
      otpRecord.userId = user.id;
      otpRecord.otpVerify = true;
      otpRecord.isEmailVerified = true;
      otpRecord.otp = null;
      otpRecord.otpExpiresAt = null;
      otpRecord.tempUserData = null;
      await otpRecord.save({ transaction: t });

      await t.commit();

      res.status(200).json({
        success: true,
        message: "OTP verified. User created. Proceed to categories selection.",
        data: {
          userId: user.id,
          secretCode: user.secretCode,
          countryCode: user.countryCode,
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

      let categoryId: number | null = null;

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
      // string name, e.g. "food"
      else if (typeof input === "string") {
        const name = input.trim();
        console.log("Category input is string name:", name);

        if (!name) {
          await t.rollback();
          res.status(400).json({
            success: false,
            message: "Category name cannot be empty",
          });
          return;
        }

        let cat = await Category.findOne({
          where: { name },
          transaction: t,
        });
        console.log(
          "Category found by name:",
          cat ? { id: cat.id, name: cat.name } : null
        );

        if (!cat) {
          console.log("Category not found, creating new master row...");
          cat = await Category.create(
            {
              name,
              icon: null,
              isActive: true,
              isDeleted: false
            },
            { transaction: t }
          );
          console.log("New category created:", { id: cat.id, name: cat.name });
        }

        categoryId = cat.id;
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
    const allowedTypes = ["freelancer", "organization"];
    if (!allowedTypes.includes(userType)) {
      await t.rollback();
      res.status(400).json({
        success: false,
        message: "Invalid userType. Use 'freelancer' or 'organization'.",
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

// signup steps: 5 final
router.post("/register/final", async (req: Request, res: Response): Promise<void> => {
  const t = await dbInstance.transaction();

  try {
    const { userId, noOfClientsRange, selectedModules } = req.body;

    console.log("[/register/final] BODY:", req.body);
  
    if (!ZARKLYX_API_KEY) {
      await t.rollback();
      res.status(500).json({
        success: false,
        message:
          "Server API key not configured. Please set API_KEY or CRYPTO_KEY in .env",
      });
      return;
    }

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
    await company.save({ transaction: t });

    // Finish user registration
    user.isRegistering = false;
    user.isActive = true;
    user.registrationStep = 6;
    await user.save({ transaction: t });

    await t.commit();

    console.log("[/register/final] DONE:", {
      userId: user.id,
      companyId: company.id,
      no_of_clients: company.no_of_clients,
      selectedModules: company.selectedModules,
    });

    res.status(200).json({
      success: true,
      message: "Registration successful.",
      data: {
        userId: user.id,
        companyId: company.id,
        apiKey: ZARKLYX_API_KEY,
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
router.post("/register/company", async (req: Request, res: Response): Promise<void> => {
  const t = await dbInstance.transaction();
  try {
    const {
      userId,
      companyName,
      website,
      country,
      timezone,
      description,
      accountType,
      businessArea,
      industryType,
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

    if (!companyName || !website || !country || !timezone) {
      await t.rollback();
      res.status(400).json({
        success: false,
        message:
          "companyName, website, country and timezone are required for company registration.",
      });
    }

    // Load user
    const user: any = await User.findByPk(userId, { transaction: t });

    console.log("[/register/company] Loaded user:", {
      userId,
      found: !!user,
      registrationStep: user?.registrationStep,
      isRegistering: user?.isRegistering,
      userType: user?.userType,
      companyId: user?.companyId,
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
    if (user.registrationStep !== 4) {
      await t.rollback();
      res.status(400).json({
        success: false,
        message:
          "Company step is only allowed after user type selection.",
      });
    }

    // only organization users can have a company in this flow
    if (user.userType !== "organization") {
      await t.rollback();
      res.status(400).json({
        success: false,
        message:
          "Company registration is only allowed for userType = 'organization'.",
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

    // user must NOT already have a company
    if (user.companyId) {
      await t.rollback();
      res.status(400).json({
        success: false,
        message:
          "User is already linked to a company. Multiple companies are not allowed in this signup flow.",
      });
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
    }

    // Create company via handler
    const company: any = await createCompany(
      {
        name: companyName,
        description: description || null,
        accountType: accountType || null,
        businessArea: businessArea || null,
        industryType: industryType || null,
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

    //  Link user <-> company
    await addUserToCompany(user.id, company.id, "admin", true, t);

    user.companyId = company.id;
    user.registrationStep = 5;
    await user.save({ transaction: t });

    await t.commit();

    res.status(200).json({
      success: true,
      message: "Company details saved. Proceed to clients & modules.",
      data: {
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
// Get user by ID
router.get("/getUserID/:id", async (req: Request, res: Response): Promise<void> => {
  try {

    const { id } = req.params;
    const user: any = await getUserByid(id);

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
  const userId = parseInt(id, 10);

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

    //  password correct, OTP NOT yet provided 
    if (!otp) {
      const loginOTP = generateOTP();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

      // Find or create OTP row for this user
      let otpRecord: any = await Otp.findOne({
        where: { userId: user.id },
      });

      if (!otpRecord) {
        otpRecord = await Otp.create({
          userId: user.id,
          email: user.email,
          contact: user.contact,
          otp: null,
          mbOTP: null,
          loginOTP: String(loginOTP),
          otpVerify: false,
          otpExpiresAt: expiresAt,
          mbOTPExpiresAt: null,
          isDeleted: false,
          isEmailVerified: user.isEmailVerified,
          isMobileVerified: user.isMobileVerified,
          isActive: true,
        } as any);
      } else {
        otpRecord.loginOTP = String(loginOTP);
        otpRecord.otpExpiresAt = expiresAt;
        otpRecord.otpVerify = false;
        otpRecord.isDeleted = false;
        await otpRecord.save();
      }

      // Send OTP – prefer email, 
      let sendResult: any;
      if (user.email) {
        sendResult = await sendOTP({ email: user.email, otp: loginOTP }, "login");
      } else if (user.contact) {
        sendResult = await sendOTP(
          { contact: user.contact, mbOTP: loginOTP },
          "login"
        );
      }

      if (!sendResult || !sendResult.success) {
        serverError(
          res,
          sendResult?.message || "Failed to send login OTP."
        );
        return;
      }

      const nameData = user.email || user.contact || `User ID ${user.id}`;
      res.status(200).json({
        success: true,
        userId: user.id,
        step: "otp",
        message: `Password verified. Login OTP sent to ${nameData}.`,
      });
    }

    // password + OTP verify
    const otpRecord: any = await Otp.findOne({
      where: {
        userId: user.id,
        loginOTP: String(otp),
        isDeleted: false,
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

    // Mark login OTP as used
    otpRecord.loginOTP = null;
    otpRecord.otpExpiresAt = null;
    otpRecord.otpVerify = true;
    await otpRecord.save();

    // Optional: save FCM token
    // if (fcmToken) {
    //   await user.update({ fcmToken });
    // }

    // ------- Generate JWT token (FINAL login) -------
    // const tokenPayload = {
    //   id: user.id,
    //   email: user.email,
    //   contact: user.contact,
    //   companyId: user.companyId || null,
    //   // roleId: user.roleId, // if you add this later
    // };

    // const token = await generateToken(tokenPayload, "30d");

    const nameData = user.email || user.contact || `User ID ${user.id}`;
    sendEncryptedResponse(
      res,
      {
        userId: user.id,
        // token,
      },
      `Login successful for ${nameData}.`
    );
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
        loginOTP: String(otp),
        isDeleted: false,
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
        token, 
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

//forgot password
// router.post("/forgotPassword", async (req: Request, res: Response): Promise<void> => {
//   let t = await dbInstance.transaction();

//   try {
//     const { email } = req.body;

//     if (!email) {
//       await t.rollback();
//        res.status(400).json({
//         success: false,
//         message: "Email is required",
//       });
//     }

//     // Find user
//     const user = await User.findOne({ where: { email } });

//     if (!user) {
//       await t.rollback();
//        res.status(404).json({
//         success: false,
//         message: "User not found with this email.",
//       });
//     }

//     // Generate new password
//     const newPWD = generateRandomPassword();  // ✔ e.g. "Xyz@1234"

//     // Send email
//     // const mailData = {
//     //   to: email,
//     //   subject: "Your New Password",
//     //   html: `<p>Your new password is <strong>${newPWD}</strong></p>`,
//     // };
//     // await sendEmail(mailData);

//     //     //send email - forgot pass
//     const mailData: any = {
//       to: email,
//       subject: "ZarklyX-New Password",
//       html: `<p> Your new password is <strong>${newPWD}</strong></p>.`,
//     };

//     sendEmail(mailData);

//     // Update new password (hashing enabled)
//     user.password = newPWD;        // ✔ triggers hashing in model setter
//     await user.save({ transaction: t });

//     await t.commit();

//      res.status(200).json({
//       success: true,
//       message: "New password sent to your email.",
//     });
//   } catch (error: any) {
//     await t.rollback();
//     ErrorLogger.write({ type: "forgotPassword error", error });

//      serverError(res, error.message || "Something went wrong.");
//      return;
//   }
// });

router.post("/forgotPassword",
  async (req: Request, res: Response): Promise<void> => {
    const t = await dbInstance.transaction();

    try {
      const { email } = req.body;

      // Validate email 
      if (!email) {
        await t.rollback();
        res.status(400).json({
          success: false,
          message: "Email is required",
        });
        return;
      }

      //  Find user 
      const user: any = await User.findOne({ where: { email } });

      if (!user) {
        await t.rollback();
        res.status(404).json({
          success: false,
          message: "User not found with this email.",
        });
        return;
      }

      //  Generate new password 
      const newPWD = generateRandomPassword(); // e.g. "Xyz@1234"

      //  Send email with new password 
      const mailData: any = {
        to: email,
        subject: "ZarklyX - New Password",
        html: `<p>Your new password is <strong>${newPWD}</strong></p>.`,
      };

 
      await sendEmail(mailData);

      //  Update user password (model setter will hash) 
      user.password = newPWD;
      await user.save({ transaction: t });

      await t.commit();

      res.status(200).json({
        success: true,
        message: "New password sent to your email.",
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
// router.post("/forgotPassword", async (req, res) => {
//   let t = await dbInstance.transaction();
//   try {
//     const { email } = req.body;

//     let user = await UserData(req.body);

//     if (!user) {
//       throw unauthorized(res, "Invalid Email");
//     }
//     const newPWD = generateRandomPassword();

//     //send email - forgot pass
//     const mailData: any = {
//       to: email,
//       subject: "GreenBolt-New Password",
//       html: `<p> Your new password is <strong>${newPWD}</strong></p>.`,
//     };

//     sendEmail(mailData);

//     // update newly generated password
//     const usr = await User.update({ password: newPWD }, { where: { email }, transaction: t });

//     await t.commit();
//     // success(res, user, "New Password Sent via Email");
//     sendEncryptedResponse(res, user, "New Password Sent via Email");
//   } catch (error: any) {
//     ErrorLogger.write({ type: "forgotPassword error", error });
//     await t.rollback();
//     serverError(res, error);
//   }
// });

// router.post("/login", async (req: Request, res: Response) => {
//   try {
//     const bodyData = req.body;
//     const { email, contact, fcmToken } = bodyData;

//     // Validation
//     if (!email && !contact) {
//       return serverError(res, "Email or mobile number is required for login.");
//     }

//     // User Lookup
//     const findCondition: any = {};
//     if (email) findCondition.email = email;
//     if (contact) findCondition.contact = contact;

//     const user = await User.findOne({ where: findCondition });
//     if (!user) {
//       return serverError(res, "User not found. Please register first.");
//     }

//     // OTP Verification Check
//     const isVerified =
//       (email && user.isEmailVerified) ||
//       (contact && user.isMobileVerified);

//     if (!isVerified) {
//       return serverError(
//         res,
//         "OTP not verified. Please verify your email or mobile number before login."
//       );
//     }

//     // JWT Token
//     const authToken = generateToken(user);

//     // Optional: Save/update FCM token
//     // if (fcmToken) {
//     //   await user.update({ fcmToken });
//     // }

//     // Final Response
//     const nameData = user.email || user.contact || `User ID ${user.id}`;
//     return sendEncryptedResponse(
//       res,
//       {
//         userId: user.id,
//         authToken,
//       },
//       `Login successful for ${nameData}.`
//     );
//   } catch (error) {
//     console.error("Error in /login:", error);
//     return serverError(res, "Something went wrong during login.");
//   }
// });

// Google auth api for signin
// router.post("/auth/google",async (req: Request, res: Response): Promise<void> => {
//     const t = await dbInstance.transaction();
//     try {
//       const { idToken } = req.body; // from FE
//       console.log("Received idToken:", idToken);
//       if (!idToken) {
//         await t.rollback();
//         res.status(400).json({
//           success: false,
//           message: "idToken is required",
//         });
//         return;
//       }

//       // Verify with Google
//       const profile = await verifyGoogleIdToken(idToken);
//       console.log(idToken, profile);

//       if (!profile.email) {
//         await t.rollback();
//         res.status(400).json({
//           success: false,
//           message: "Google account has no email.",
//         });
//         return;
//       }

//       // Find or create user
//       let user: any = await User.findOne({
//         where: { email: profile.email },
//         transaction: t,
//       });

//       if (!user) {
//         user = await User.create(
//           {
//             firstName: profile.firstName || "Google",
//             lastName: profile.lastName || "",
//             email: profile.email as string,
//             contact: null,
//             isEmailVerified: profile.emailVerified,
//             loginProvider: "google",
//             isActive: true,
//           } as any,
//           { transaction: t }
//         );
//       }

//       // issue JWT
//       const jwtPayload = {
//         userId: user.id,
//         role: (user as any).role || "user",
//       };
//       const token = await generateToken(jwtPayload, "1d");

//       await t.commit();

//       res.status(200).json({
//         success: true,
//         message: "Google login successful",
//         data: {
//           user,
//           token,
//         },
//       });
//       return;
//     } catch (error: any) {
//       await t.rollback();
//       console.error("[/user/auth/google] ERROR:", error);
//       serverError(res, error.message || "Google login failed.");
//       return;
//     }
//   }
// );
export default router;
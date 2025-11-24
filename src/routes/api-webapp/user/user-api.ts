import express from "express";
import { Request, Response } from "express";
import { notFound } from "../../../services/response"
import { sendEncryptedResponse } from "../../../services/encryptResponse-service";
import dbInstance from "../../../db/core/control-db";
import { alreadyExist, serverError, unauthorized, } from "../../../utils/responseHandler";
import {
  generateOTP
} from "../../../services/password-service";
import { sendOTP } from "../../../services/otp-service";
import { generateToken } from "../../../services/jwtToken-service";
import { hashPassword, checkPassword } from "../../../services/password-service";
import {
  updateUser,
  deleteUser,
  getUserByid,
  getAllUser,
  updateTheme,
  generateUniqueSecretCode,
} from "./user-handler";
import { createCompany, addUserToCompany } from "../company/company-handler";
import { Otp } from "../../../routes/api-webapp/otp/otp-model";
import { User } from "../../api-webapp/user/user-model";
import { Company } from "../../api-webapp/company/company-model";
import { Category } from "../../../routes/api-webapp/category/category-model";
import { PremiumModule } from "../../../routes/api-webapp/premiumModule/premiumModule-model";
import { Op } from "sequelize";
// import { ErrorLogger } from "../../../db/core/logger/error-logger";
import ErrorLogger from "../../../db/core/logger/error-logger";
// import { responseEncoding } from "axios";


const router = express.Router();
// type Params = { id: string };


//signup steps:1 User Registration Start with OTP
// router.post("/register/start", async (req: Request, res: Response) => {
//   const t = await dbInstance.transaction();
//   try {
//     const { referId, companyId, firstName, lastName, email, contact, secretCode } = req.body;

//     if (!firstName || !lastName || !email || !contact) {
//       await t.rollback();
//       return res.status(400).json({
//         success: false,
//         message: "firstName, lastName, email, contact are required",
//       });
//     }

//     // Duplicate check
//     const existingUser: any = await User.findOne({
//       where: { [Op.or]: [{ email }, { contact }] },
//       transaction: t,
//     });

//     if (existingUser) {
//       await t.rollback();
//       return alreadyExist(res, "Email or contact already exists");
//     }

//     const finalSecretCode = secretCode || (await generateUniqueSecretCode());

//     // Create user in registering mode
//     const user: any = await User.create(
//       {
//         referId: referId || null,
//         // companyId: null,
//         firstName,
//         lastName,
//         email,
//         contact,
//         userType: null, 
//         secretCode: finalSecretCode,
//         isthemedark: false,
//         categories: null,
//         isDeleted: false,
//         // deletedAt: null,
//         isEmailVerified: false,
//         isMobileVerified: false,
//         isRegistering: true,
//         registrationStep: 1,
//         isActive: false,
//       },
//       { transaction: t }
//     );

//     // OTP create/update
//     const otpCode = generateOTP();
//     const expiry = new Date(Date.now() + 10 * 60 * 1000);

//     let otpRecord = await Otp.findOne({
//       where: { userId: user.id },
//       transaction: t,
//     });

//     if (!otpRecord) {
//       otpRecord = await Otp.create(
//         {
//           userId: user.id,
//           email: user.email,
//           contact: user.contact,
//           otp: otpCode,
//           mbOTP: null,
//           loginOTP: null,
//           otpVerify: false,
//           otpExpiresAt: expiry,
//           mbOTPExpiresAt: null,
//           isDeleted: false,
//           // deletedAt: null,
//           isEmailVerified: false,
//           isMobileVerified: false,
//           isActive: true,
//         },
//         { transaction: t }
//       );
//     } else {
//       otpRecord.email = user.email;
//       otpRecord.contact = user.contact;
//       otpRecord.otp = otpCode;
//       otpRecord.otpExpiresAt = expiry;
//       otpRecord.otpVerify = false;
//       otpRecord.isDeleted = false;
//       await otpRecord.save({ transaction: t });
//     }

//     // Send Email OTP
//     const sendResult = await sendOTP({ email, otp: otpCode }, "register");
//     if (!sendResult || !sendResult.success) {
//       await t.rollback();
//       return serverError(res, sendResult?.message || "Failed to send OTP.");
//     }

//     await t.commit();

//     return res.status(200).json({
//       success: true,
//       message: `Signup step 1 done. OTP sent to ${email}.`,
//       data: {
//         userId: user.id,
//         secretCode: user.secretCode,
//       },
//     });
//   } catch (error: any) {
//     await t.rollback();
//     ErrorLogger.write({ type: "register/start error", error });
//     return serverError(res, error.message || "Failed to start registration.");
//   }
// });

// password with countrycode api 
router.post("/register/start", async (req: Request, res: Response) => {
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
      countryCode,   // optional from FE
    } = req.body;

    console.log("[register/start] BODY:", req.body);

    // Basic validation
    if (!firstName || !lastName || !email || !contact) {
      await t.rollback();
      return res.status(400).json({
        success: false,
        message: "firstName, lastName, email, contact are required",
      });
    }

    // Password validations
    if (!password || !confirmPassword) {
      await t.rollback();
      return res.status(400).json({
        success: false,
        message: "password and confirmPassword are required",
      });
    }

    if (password !== confirmPassword) {
      await t.rollback();
      return res.status(400).json({
        success: false,
        message: "password and confirmPassword must match",
      });
    }

    if (password.length < 6) {
      await t.rollback();
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters.",
      });
    }

    // 🔐 password hash
    const passwordHash = await hashPassword(password);

    // Contact + Country Code logic
    const rawContact: string = String(contact).trim();
    const digitsOnly = rawContact.replace(/\D/g, ""); // sirf numbers

    if (digitsOnly.length < 10) {
      await t.rollback();
      return res.status(400).json({
        success: false,
        message: "Invalid contact number.",
      });
    }

    let finalCountryCode = "+91"; // default India
    let localNumber = digitsOnly;

    // Case 1: user ne +CCXXXXXXXXXX diya hai
    if (rawContact.startsWith("+")) {
      // assume last 10 digits = local, baaki country code
      if (digitsOnly.length > 10) {
        const ccLen = digitsOnly.length - 10;
        finalCountryCode = "+" + digitsOnly.slice(0, ccLen);
        localNumber = digitsOnly.slice(ccLen);
      }
    }
    // Case 2: koi aur full intl number (91XXXXXXXXXX, 441234567890, etc)
    else if (digitsOnly.length > 10) {
      const ccLen = digitsOnly.length - 10;
      finalCountryCode = "+" + digitsOnly.slice(0, ccLen);
      localNumber = digitsOnly.slice(ccLen);
    }
    // Case 3: sirf 10 digits → assume India
    else if (digitsOnly.length === 10) {
      finalCountryCode = "+91";
      localNumber = digitsOnly;
    }

    // Agar FE ne directly countryCode bheja hai, toh usko override kar sakte ho:
    if (countryCode) {
      finalCountryCode = String(countryCode);
    }

    console.log("[register/start] Parsed contact:", {
      rawContact,
      finalCountryCode,
      localNumber,
    });

    // Duplicate check (email + contact)
    const existingUser: any = await User.findOne({
      where: {
        [Op.or]: [
          { email },
          { contact: localNumber },
        ],
      },
      transaction: t,
    });

    if (existingUser) {
      await t.rollback();
      return alreadyExist(res, "Email or contact already exists");
    }

    const finalSecretCode = await generateUniqueSecretCode();

    // Create user in "registering" mode
    const user: any = await User.create(
      {
        referId: referId || null,
        firstName,
        lastName,
        email,
        contact: localNumber,
        countryCode: finalCountryCode,  // 👈 store here
        password: passwordHash,        // 👈 hashed
        userType: null,                // step 4 pe set hoga
        secretCode: finalSecretCode,
        isthemedark: false,
        categories: null,
        isDeleted: false,
        isEmailVerified: false,
        isMobileVerified: false,
        isRegistering: true,
        registrationStep: 1,
        isActive: false,
      },
      { transaction: t }
    );

    // OTP generate
    const otpCode = generateOTP();
    const expiry = new Date(Date.now() + 10 * 60 * 1000); // 10 mins

    let otpRecord = await Otp.findOne({
      where: { userId: user.id },
      transaction: t,
    });

    if (!otpRecord) {
      otpRecord = await Otp.create(
        {
          userId: user.id,
          email: user.email,
          contact: user.contact,
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
        },
        { transaction: t }
      );
    } else {
      otpRecord.email = user.email;
      otpRecord.contact = user.contact;
      otpRecord.otp = otpCode;
      otpRecord.otpExpiresAt = expiry;
      otpRecord.otpVerify = false;
      otpRecord.isDeleted = false;
      await otpRecord.save({ transaction: t });
    }

    // 📧 Send OTP on email
    const sendResult = await sendOTP({ email, otp: otpCode }, "register");
    if (!sendResult || !sendResult.success) {
      await t.rollback();
      return serverError(res, sendResult?.message || "Failed to send OTP.");
    }

    await t.commit();

    return res.status(200).json({
      success: true,
      message: `Signup step 1 done. OTP sent to ${email}.`,
      data: {
        userId: user.id,
        secretCode: user.secretCode,
        countryCode: finalCountryCode,
      },
    });
  } catch (error: any) {
    await t.rollback();
    ErrorLogger.write({ type: "register/start error", error });
    return serverError(res, error.message || "Failed to start registration.");
  }
});

// signup steps:2 Verify OTP
router.post("/register/verify-otp", async (req: Request, res: Response) => {
  const t = await dbInstance.transaction();
  try {
    const { userId, otp } = req.body;

    if (!userId || !otp) {
      await t.rollback();
      return res.status(400).json({
        success: false,
        message: "userId and otp are required",
      });
    }

    const user: any = await User.findByPk(userId, { transaction: t });
    if (!user) {
      await t.rollback();
      return notFound(res, "User not found");
    }

    const otpRecord: any = await Otp.findOne({
      where: {
        userId,
        otp: String(otp),
        otpVerify: false,
        isDeleted: false,
      },
      transaction: t,
    });

    if (!otpRecord) {
      await t.rollback();
      return unauthorized(res, "Invalid OTP.");
    }

    if (otpRecord.otpExpiresAt && otpRecord.otpExpiresAt < new Date()) {
      await t.rollback();
      return unauthorized(res, "OTP has expired.");
    }

    otpRecord.otpVerify = true;
    otpRecord.isEmailVerified = true;
    otpRecord.otp = null;
    otpRecord.otpExpiresAt = null;
    await otpRecord.save({ transaction: t });

    user.isEmailVerified = true;
    user.registrationStep = 2;
    await user.save({ transaction: t });

    await t.commit();

    return res.status(200).json({
      success: true,
      message: "OTP verified. Proceed to categories selection.",
    });
  } catch (error: any) {
    await t.rollback();
    ErrorLogger.write({ type: "register/verify-otp error", error });
    return serverError(res, error.message || "Failed to verify OTP.");
  }
});

// signup steps:3 Categories selection
// router.post("/register/categories", async (req: Request, res: Response) => {
//   try {
//     const { userId, categories } = req.body;

//     if (!userId || !Array.isArray(categories)) {
//       return res.status(400).json({
//         success: false,
//         message: "userId and categories[] are required",
//       });
//     }

//     const user: any = await User.findByPk(userId);
//     if (!user) {
//       return notFound(res, "User not found");
//     }

//     user.categories = categories;
//     user.registrationStep = 3;
//     await user.save();

//     return res.status(200).json({
//       success: true,
//       message: "Categories saved. Proceed to user type selection.",
//     });
//   } catch (error: any) {
//     ErrorLogger.write({ type: "register/categories error", error });
//     return serverError(res, error.message || "Failed to save categories.");
//   }
// });

// router.post("/register/categories", async (req: Request, res: Response) => {
//   const t = await dbInstance.transaction();
//   try {
//     const { userId, categories } = req.body;

//     if (!userId || !Array.isArray(categories) || categories.length === 0) {
//       await t.rollback();
//       return res.status(400).json({
//         success: false,
//         message: "userId and non-empty categories[] are required",
//       });
//     }

//     const user: any = await User.findByPk(userId, { transaction: t });
//     if (!user) {
//       await t.rollback();
//       return notFound(res, "User not found");
//     }

//     const categoryIds: number[] = [];

//     for (const item of categories) {
//       let name: string | undefined;
//       let icon: string | null = null;

//       // 1) Allow simple string: "food"
//       if (typeof item === "string") {
//         name = item;
//       }
//       // 2) Or object: { name: "food", icon: "fa-burger" }
//       else if (typeof item === "object" && item !== null) {
//         name = item.name;
//         icon = item.icon || null;
//       }

//       if (!name) continue; // skip invalid items

//       // Trim spaces
//       name = name.trim();

//       // Check if category already exists
//       let category = await Category.findOne({
//         where: { name },
//         transaction: t,
//       });

//       // If not, create new category row
//       if (!category) {
//         category = await Category.create(
//           {
//             name,
//             icon,
//             isActive: true,
//           },
//           { transaction: t }
//         );
//       }

//       categoryIds.push(category.id);
//     }

//     if (categoryIds.length === 0) {
//       await t.rollback();
//       return res.status(400).json({
//         success: false,
//         message: "No valid categories provided.",
//       });
//     }

//     // ✅ Save only IDs in user table
//     user.categories = categoryIds;   // [1,2,...] JSON
//     user.registrationStep = 3;
//     await user.save({ transaction: t });

//     await t.commit();

//     return res.status(200).json({
//       success: true,
//       message: "Categories saved. Proceed to user type selection.",
//     });
//   } catch (error: any) {
//     await t.rollback();
//     ErrorLogger.write({ type: "register/categories error", error });
//     return serverError(res, error.message || "Failed to save categories.");
//   }
// });

// final -1
// router.post("/register/categories", async (req: Request, res: Response) => {
//   const t = await dbInstance.transaction();
//   try {
//     const { userId, categories } = req.body;

//     if (!userId || !Array.isArray(categories) || categories.length === 0) {
//       await t.rollback();
//       return res.status(400).json({
//         success: false,
//         message: "userId and non-empty categories[] are required",
//       });
//     }

//     const user: any = await User.findByPk(userId, { transaction: t });
//     if (!user) {
//       await t.rollback();
//       return notFound(res, "User not found");
//     }

//     // 👇 Check: kya sab numeric IDs hi hain?
//     const allNumeric = categories.every(
//       (c: any) => typeof c === "number" || !Number.isNaN(Number(c))
//     );

//     // ==========================
//     // CASE 1: Only numeric IDs
//     // ==========================
//     if (allNumeric) {
//       const distinctIds = [
//         ...new Set(categories.map((c: any) => Number(c))),
//       ];

//       if (distinctIds.length === 0) {
//         await t.rollback();
//         return res.status(400).json({
//           success: false,
//           message: "No valid category IDs provided.",
//         });
//       }

//       user.categories = distinctIds; // e.g. [3,2]
//       user.registrationStep = 3;
//       await user.save({ transaction: t });

//       await t.commit();
//       return res.status(200).json({
//         success: true,
//         message: "Categories saved. Proceed to user type selection.",
//       });
//     }

//     // ==========================
//     // CASE 2: Names / objects
//     // ==========================
//     const categoryIds: number[] = [];

//     for (const item of categories) {
//       let name: string | undefined;
//       let icon: string | null = null;

//       // "food"
//       if (typeof item === "string") {
//         name = item;
//       }
//       // { name: "food", icon: "fa-burger" }
//       else if (typeof item === "object" && item !== null) {
//         name = item.name;
//         icon = item.icon || null;
//       }

//       if (!name) continue;
//       name = name.trim();
//       if (!name) continue;

//       let category = await Category.findOne({
//         where: { name },
//         transaction: t,
//       });

//       // create master if not exist
//       if (!category) {
//         category = await Category.create(
//           {
//             name,
//             icon,
//             isActive: true,
//           },
//           { transaction: t }
//         );
//       }

//       categoryIds.push(category.id);
//     }

//     const distinctIds = [...new Set(categoryIds)];

//     if (distinctIds.length === 0) {
//       await t.rollback();
//       return res.status(400).json({
//         success: false,
//         message: "No valid categories provided.",
//       });
//     }

//     user.categories = distinctIds;
//     user.registrationStep = 3;
//     await user.save({ transaction: t });

//     await t.commit();

//     return res.status(200).json({
//       success: true,
//       message: "Categories saved. Proceed to user type selection.",
//     });
//   } catch (error: any) {
//     await t.rollback();
//     ErrorLogger.write({ type: "register/categories error", error });
//     return serverError(res, error.message || "Failed to save categories.");
//   }
// });

//final -2 single id
router.post("/register/categories", async (req: Request, res: Response) => {
  const t = await dbInstance.transaction();
  try {
    console.log("===== [/user/register/categories] HIT =====");
    console.log("Request body:", req.body);

    const { userId } = req.body;
    // we support both "category" and "categories"
    let input: any = req.body.category ?? req.body.categories;

    console.log("Raw input (category/categories):", input);

    // ❗ Normalize: if array aaya hai, sirf first item allow
    if (Array.isArray(input)) {
      console.log("Input is array, length:", input.length);

      if (input.length === 0) {
        await t.rollback();
        console.log("❌ Empty category array");
        return res.status(400).json({
          success: false,
          message: "userId and a single category are required",
        });
      }
      if (input.length > 1) {
        await t.rollback();
        console.log("❌ More than one category sent, only one allowed");
        return res.status(400).json({
          success: false,
          message: "Only one category can be selected",
        });
      }

      input = input[0]; // sirf 1 value use karenge
      console.log("Normalized single input from array:", input);
    }

    // basic validation
    if (!userId || input === undefined || input === null) {
      await t.rollback();
      console.log("❌ Missing userId or category value");
      return res.status(400).json({
        success: false,
        message: "userId and a single category are required",
      });
    }

    const user: any = await User.findByPk(userId, { transaction: t });
    console.log("Fetched user:", user ? { id: user.id, email: user.email } : null);

    if (!user) {
      await t.rollback();
      return notFound(res, "User not found");
    }

    let categoryId: number | null = null;

    // 👉 CASE 1: numeric ID directly
    if (typeof input === "number") {
      console.log("Category input is numeric ID:", input);
      const cat = await Category.findByPk(input, { transaction: t });
      console.log(
        "Category found by ID:",
        cat ? { id: cat.id, name: cat.name } : null
      );

      if (!cat) {
        await t.rollback();
        return res.status(400).json({
          success: false,
          message: "Category ID is invalid",
        });
      }
      categoryId = cat.id;
    }
    // 👉 CASE 2: string name, e.g. "food"
    else if (typeof input === "string") {
      const name = input.trim();
      console.log("Category input is string name:", name);

      if (!name) {
        await t.rollback();
        return res.status(400).json({
          success: false,
          message: "Category name cannot be empty",
        });
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
          },
          { transaction: t }
        );
        console.log("New category created:", { id: cat.id, name: cat.name });
      }

      categoryId = cat.id;
    }
    // 👉 CASE 3: object { name, icon }
    else if (typeof input === "object" && input !== null) {
      const name = (input.name || "").trim();
      const icon = input.icon || null;

      console.log("Category input is object:", { name, icon });

      if (!name) {
        await t.rollback();
        return res.status(400).json({
          success: false,
          message: "Category name is required",
        });
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
        console.log("Category not found, creating new master row from object...");
        cat = await Category.create(
          {
            name,
            icon,
            isActive: true,
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
      console.log("❌ Invalid category format, type:", typeof input);
      return res.status(400).json({
        success: false,
        message: "Invalid category format",
      });
    }

    console.log("Resolved categoryId:", categoryId);

    if (!categoryId) {
      await t.rollback();
      console.log("❌ categoryId is null after processing");
      return res.status(400).json({
        success: false,
        message: "Could not resolve category",
      });
    }

    // 🔴 SINGLE VALUE store in user.categories
    user.categories = categoryId; // e.g. 2
    user.registrationStep = 3;

    console.log("Saving user with new category:", {
      userId: user.id,
      categoryId,
      registrationStep: user.registrationStep,
    });

    await user.save({ transaction: t });
    await t.commit();

    console.log("✅ Category saved successfully for user:", user.id);

    const responsePayload = {
      success: true,
      message: "Category saved. Proceed to user type selection.",
      data: { categoryId },
    };

    console.log("Response payload:", responsePayload);

    return res.status(200).json(responsePayload);
  } catch (error: any) {
    await t.rollback();
    console.error("❌ Error in /user/register/categories:", error);
    ErrorLogger.write({ type: "register/categories error", error });
    return serverError(res, error.message || "Failed to save category.");
  }
});

// woring 
// router.post("/register/categories", async (req: Request, res: Response) => {
//   const t = await dbInstance.transaction();
//   try {
//     const { userId, categories } = req.body;

//     if (!userId || !Array.isArray(categories) || categories.length === 0) {
//       await t.rollback();
//       return res.status(400).json({
//         success: false,
//         message: "userId and non-empty categories[] are required",
//       });
//     }

//     const user: any = await User.findByPk(userId, { transaction: t });
//     if (!user) {
//       await t.rollback();
//       return notFound(res, "User not found");
//     }

//     const ids: number[] = [];
//     const names: string[] = [];

//     for (const c of categories) {
//       if (typeof c === "number") {
//         ids.push(c);
//       } else if (typeof c === "string") {
//         names.push(c);
//       }
//     }

//     // 🔹 Names ko Category table se IDs me convert karo
//     if (names.length > 0) {
//       const nameCategories = await Category.findAll({
//         where: { name: names },
//         transaction: t,
//       });

//       if (nameCategories.length !== names.length) {
//         await t.rollback();
//         return res.status(400).json({
//           success: false,
//           message:
//             "One or more category names are invalid. Please use valid categories.",
//         });
//       }

//       ids.push(...nameCategories.map((c) => c.id));
//     }

//     if (ids.length === 0) {
//       await t.rollback();
//       return res.status(400).json({
//         success: false,
//         message: "No valid category IDs or names provided.",
//       });
//     }

//     // IDs array user pe save karo
//     user.categories = ids;
//     user.registrationStep = 3;
//     await user.save({ transaction: t });

//     await t.commit();

//     return res.status(200).json({
//       success: true,
//       message: "Categories saved. Proceed to user type selection.",
//     });
//   } catch (error: any) {
//     await t.rollback();
//     ErrorLogger.write({ type: "register/categories error", error });
//     return serverError(res, error.message || "Failed to save categories.");
//   }
// });

// signup steps:4 User Type selection
router.post("/register/user-type", async (req: Request, res: Response) => {
  const t = await dbInstance.transaction();
  try {
    const { userId, userType } = req.body;

    // Basic validation
    if (!userId || !userType) {
      await t.rollback();
      return res.status(400).json({
        success: false,
        message: "userId and userType are required",
      });
    }

    // Only these two are allowed
    const allowedTypes = ["freelancer", "organization"];
    if (!allowedTypes.includes(userType)) {
      await t.rollback();
      return res.status(400).json({
        success: false,
        message: "Invalid userType. Use 'freelancer' or 'organization'.",
      });
    }

    // Find user
    const user: any = await User.findByPk(userId, { transaction: t });
    if (!user) {
      await t.rollback();
      return notFound(res, "User not found");
    }

    // (Optional but nice) – ensure he is in registration flow
    if (!user.isRegistering) {
      await t.rollback();
      return res.status(400).json({
        success: false,
        message: "User is not in registration flow.",
      });
    }

    // Set user type only here
    user.userType = userType;   // before this it should be NULL
    user.registrationStep = 4;
    await user.save({ transaction: t });

    await t.commit();

    return res.status(200).json({
      success: true,
      message: "User type saved. Proceed to company details.",
    });
  } catch (error: any) {
    await t.rollback();
    ErrorLogger.write({ type: "register/user-type error", error });
    return serverError(res, error.message || "Failed to save user type.");
  }
});

// signup steps:5 Finalize Registration
// router.post("/register/company", async (req: Request, res: Response) => {
//   const t = await dbInstance.transaction();
//   try {
//     const {
//       userId,
//       companyName,
//       website,
//       country,
//       timezone,
//       description,
//       accountType,
//       businessArea,
//       industryType,
//       email,
//       contact,
//       address,
//       city,
//       state,
//       zipcode,
//       registrationNumber,
//     } = req.body;

//     if (!userId || !companyName) {
//       await t.rollback();
//       return res.status(400).json({
//         success: false,
//         message: "userId and companyName are required",
//       });
//     }

//     const user: any = await User.findByPk(userId, { transaction: t });
//     if (!user) {
//       await t.rollback();
//       return notFound(res, "User not found");
//     }

//     // company create via handler
//     const company: any = await createCompany(
//       {
//         name: companyName,
//         description: description || null,
//         accountType: accountType || null,
//         businessArea: businessArea || null,
//         industryType: industryType || null,
//         website: website || null,
//         email: email || user.email || null,
//         contact: contact || user.contact || null,
//         address: address || null,
//         city: city || null,
//         state: state || null,
//         zipcode: zipcode || null,
//         country: country || null,
//         logo: null,
//         timezone: timezone || null,
//         registrationNumber: registrationNumber || null,
//         selectedModules: null,
//         no_of_clients: null,
//         isActive: true,
//       },
//       t
//     );

//     await addUserToCompany(user.id, company.id, "admin", true, t);

//     user.companyId = company.id;
//     user.registrationStep = 5;
//     await user.save({ transaction: t });

//     await t.commit();

//     return res.status(200).json({
//       success: true,
//       message: "Company details saved. Proceed to clients & modules.",
//       data: { companyId: company.id },
//     });
//   } catch (error: any) {
//     await t.rollback();
//     ErrorLogger.write({ type: "register/company error", error });
//     return serverError(res, error.message || "Failed to save company details.");
//   }
// });
router.post("/register/company", async (req: Request, res: Response) => {
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

    // 1) Basic required fields
    if (!userId) {
      await t.rollback();
      return res.status(400).json({
        success: false,
        message: "userId is required",
      });
    }

    if (!companyName || !website || !country || !timezone) {
      await t.rollback();
      return res.status(400).json({
        success: false,
        message:
          "companyName, website, country and timezone are required for company registration.",
      });
    }

    // 2) Load user
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
      return notFound(res, "User not found");
    }

    // 3) Strict signup-flow validations

    // user MUST be in signup flow
    if (!user.isRegistering) {
      await t.rollback();
      return res.status(400).json({
        success: false,
        message:
          "This user is not in registration flow. Company registration is only allowed during signup.",
      });
    }

    // step 4 complete (OTP + categories + user-type)
    if (user.registrationStep !== 4) {
      await t.rollback();
      return res.status(400).json({
        success: false,
        message:
          "Company step is only allowed after user type selection (step 4).",
      });
    }

    // only organization users can have a company in this flow
    if (user.userType !== "organization") {
      await t.rollback();
      return res.status(400).json({
        success: false,
        message:
          "Company registration is only allowed for userType = 'organization'.",
      });
    }

    // email should be verified by now
    if (!user.isEmailVerified) {
      await t.rollback();
      return res.status(400).json({
        success: false,
        message:
          "Email not verified. Please complete OTP verification before adding company.",
      });
    }

    // user must NOT already have a company
    if (user.companyId) {
      await t.rollback();
      return res.status(400).json({
        success: false,
        message:
          "User is already linked to a company. Multiple companies are not allowed in this signup flow.",
      });
    }

    // 4) Check duplicate company name
    const existingCompany = await Company.findOne({
      where: { name: companyName },
      transaction: t,
    });

    if (existingCompany) {
      await t.rollback();
      return res.status(400).json({
        success: false,
        message: "Company name already exists. Please use a different name.",
      });
    }

    // 5) Create company via handler
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

    // 6) Link user <-> company
    await addUserToCompany(user.id, company.id, "admin", true, t);

    user.companyId = company.id;
    user.registrationStep = 5; // next step = clients & modules
    await user.save({ transaction: t });

    await t.commit();

    return res.status(200).json({
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
    return serverError(res, error.message || "Failed to save company details.");
  }
});

// signup steps:5 Finalize Registration - working
// router.post("/register/final", async (req: Request, res: Response) => {
//   const t = await dbInstance.transaction();
//   try {
//     const { userId, noOfClientsRange, selectedModules } = req.body;

//     if (!userId || !noOfClientsRange || !Array.isArray(selectedModules)) {
//       await t.rollback();
//       return res.status(400).json({
//         success: false,
//         message: "userId, noOfClientsRange, selectedModules[] are required",
//       });
//     }

//     const user: any = await User.findByPk(userId, { transaction: t });
//     if (!user) {
//       await t.rollback();
//       return notFound(res, "User not found");
//     }

//     if (!user.companyId) {
//       await t.rollback();
//       return serverError(res, "Company not linked to this user.");
//     }

//     const company: any = await Company.findByPk(user.companyId, {
//       transaction: t,
//     });
//     if (!company) {
//       await t.rollback();
//       return notFound(res, "Company not found");
//     }

//     // Parse "0-5" -> 5
//     const parts = (noOfClientsRange as string).split("-");
//     const upperStr = parts[parts.length - 1];
//     const upperBound = parseInt(upperStr, 10);
//     if (isNaN(upperBound)) {
//       await t.rollback();
//       return res.status(400).json({
//         success: false,
//         message: "Invalid noOfClientsRange. Expected like '0-5' or '5-15'.",
//       });
//     }

//     // For now, store module IDs as comma-separated string in company.selectedModules
//     const modulesStr = selectedModules.join(",");
//     company.no_of_clients = upperBound;
//     company.selectedModules = modulesStr;
//     await company.save({ transaction: t });

//     user.isRegistering = false;
//     user.isActive = true;
//     user.registrationStep = 6;
//     await user.save({ transaction: t });

//     await t.commit();

//     return res.status(200).json({
//       success: true,
//       message: "Registration successful.",
//     });
//   } catch (error: any) {
//     await t.rollback();
//     ErrorLogger.write({ type: "register/final error", error });
//     return serverError(res, error.message || "Failed to finalize registration.");
//   }
// });

// final
// router.post("/register/final", async (req: Request, res: Response) => {
//   const t = await dbInstance.transaction();

//   try {
//     const { userId, noOfClientsRange, selectedModules } = req.body;

//     console.log("[/register/final] BODY:", req.body);

//     // Basic validation
//     if (!userId || !noOfClientsRange || !Array.isArray(selectedModules)) {
//       await t.rollback();
//       return res.status(400).json({
//         success: false,
//         message: "userId, noOfClientsRange, selectedModules[] are required",
//       });
//     }

//     // 1. Get user
//     const user: any = await User.findByPk(userId, { transaction: t });
//     if (!user) {
//       await t.rollback();
//       return notFound(res, "User not found");
//     }

//     // Must already have a company from /register/company step
//     if (!user.companyId) {
//       await t.rollback();
//       return serverError(res, "Company not linked to this user.");
//     }

//     // 2. Get company
//     const company: any = await Company.findByPk(user.companyId, {
//       transaction: t,
//     });
//     if (!company) {
//       await t.rollback();
//       return notFound(res, "Company not found");
//     }

//     // 3. Parse "0-5", "5-15", "15-20", "50+" etc.
//     const rangeStr = String(noOfClientsRange).trim();

//     let upperBound: number;

//     if (rangeStr.includes("-")) {
//       // e.g. "15-20" -> 20
//       const parts = rangeStr.split("-");
//       const upperStr = parts[parts.length - 1];
//       upperBound = parseInt(upperStr, 10);
//     } else if (rangeStr.endsWith("+")) {
//       // e.g. "50+"
//       upperBound = parseInt(rangeStr.replace("+", ""), 10);
//     } else {
//       // fallback, treat as single number
//       upperBound = parseInt(rangeStr, 10);
//     }

//     if (Number.isNaN(upperBound)) {
//       await t.rollback();
//       return res.status(400).json({
//         success: false,
//         message:
//           "Invalid noOfClientsRange. Expected like '0-5', '5-15', '15-20' or '50+'.",
//       });
//     }

//     // 4. Normalize selectedModules → numeric IDs
//     const moduleIds: number[] = (selectedModules as any[])
//       .map((m) => Number(m))
//       .filter((n) => !Number.isNaN(n));

//     if (moduleIds.length === 0) {
//       await t.rollback();
//       return res.status(400).json({
//         success: false,
//         message: "selectedModules must be an array of numeric IDs",
//       });
//     }

//     // 5. Optional validation against PremiumModule
//     //    - If table is empty -> skip validation (to allow testing)
//     //    - If there are modules, but some IDs don't exist -> throw error
//     let existingModules: any[] = [];

//     try {
//       existingModules = await PremiumModule.findAll({
//         where: { id: moduleIds },
//         transaction: t,
//       });
//     } catch (e) {
//       console.log("[/register/final] PremiumModule lookup error:", e);
//       // don't fail just because of validation DB error
//     }

//     if (existingModules.length > 0 && existingModules.length !== moduleIds.length) {
//       await t.rollback();
//       return res.status(400).json({
//         success: false,
//         message:
//           "One or more premium module IDs are invalid. Please use valid modules.",
//       });
//     }

//     // 6. Store upperBound & module IDs (comma separated) on company
//     const modulesStr = moduleIds.join(",");
//     company.no_of_clients = upperBound;
//     company.selectedModules = modulesStr;
//     await company.save({ transaction: t });

//     // 7. Finish user registration
//     user.isRegistering = false;
//     user.isActive = true;
//     user.registrationStep = 6;
//     await user.save({ transaction: t });

//     await t.commit();

//     console.log("[/register/final] SUCCESS for user:", userId, "company:", company.id);

//     return res.status(200).json({
//       success: true,
//       message: "Registration successful.",
//     });
//   } catch (error: any) {
//     await t.rollback();
//     console.error("[/register/final] ERROR:", error);
//     ErrorLogger.write({ type: "register/final error", error });
//     return serverError(res, error.message || "Failed to finalize registration.");
//   }
// });

// latest 
router.post("/register/final", async (req: Request, res: Response) => {
  const t = await dbInstance.transaction();

  try {
    const { userId, noOfClientsRange, selectedModules } = req.body;

    console.log("[/register/final] BODY:", req.body);

    // 1) Basic validation
    if (!userId || !noOfClientsRange || !Array.isArray(selectedModules) || selectedModules.length === 0) {
      await t.rollback();
      return res.status(400).json({
        success: false,
        message: "userId, noOfClientsRange and non-empty selectedModules[] are required",
      });
    }

    // 2) Load user
    const user: any = await User.findByPk(userId, { transaction: t });
    if (!user) {
      await t.rollback();
      return notFound(res, "User not found");
    }

    if (!user.companyId) {
      await t.rollback();
      return serverError(res, "Company not linked to this user.");
    }

    // 3) Load company
    const company: any = await Company.findByPk(user.companyId, { transaction: t });
    if (!company) {
      await t.rollback();
      return notFound(res, "Company not found");
    }

    // 4) Parse "0-5" / "15-20" / "50+"
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
      return res.status(400).json({
        success: false,
        message:
          "Invalid noOfClientsRange. Expected like '0-5', '5-15', '15-20' or '50+'.",
      });
    }

    // 5) Build / create premium modules
    const moduleIds: number[] = [];

    for (const item of selectedModules) {
      // Case 1: numeric ID -> must exist
      if (typeof item === "number") {
        const existing = await PremiumModule.findByPk(item, { transaction: t });
        if (existing) {
          moduleIds.push(existing.id);
        }
        continue;
      }

      let name: string | undefined;
      let icon: string | null = null;

      // Case 2: string "Campaign"
      if (typeof item === "string") {
        name = item;
      }
      // Case 3: object { name, icon }
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
          },
          { transaction: t }
        );
      }

      moduleIds.push(module.id);
    }

    const distinctModuleIds = [...new Set(moduleIds)];

    if (distinctModuleIds.length === 0) {
      await t.rollback();
      return res.status(400).json({
        success: false,
        message: "No valid premium modules provided.",
      });
    }

    // 6) Save on company (only IDs, comma separated)
    company.no_of_clients = upperBound;
    company.selectedModules = distinctModuleIds.join(",");
    await company.save({ transaction: t });

    // 7) Finish user registration
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

    return res.status(200).json({
      success: true,
      message: "Registration successful.",
    });
  } catch (error: any) {
    await t.rollback();
    console.error("[/register/final] ERROR:", error);
    ErrorLogger.write({ type: "register/final error", error });
    return serverError(res, error.message || "Failed to finalize registration.");
  }
});

// Get user by ID
router.get("/getUserID/:id", async (req: Request, res: Response) => {
  try {

    const { id } = req.params;
    const user: any = await getUserByid(id);

    if (!user) {
      return notFound(res, "User not found");
    }
    return res.status(200).json({
      success: true,
      message: "User retrieved successfully.",
      data: user,
    });
  } catch (error: any) {
    console.error({ type: "getUserById error", error });
    return serverError(res, error);
  }
});

// Get all Users
router.get("/getAllUser", async (req, res) => {
  try {
    const allUser = await getAllUser(req.query);
    sendEncryptedResponse(res, allUser, "Got all users");
  } catch (error: any) {
    ErrorLogger.write({ type: "getAllUser error", error });
    serverError(res, error);
  }
});

// Update user 
router.post("/updateById", async (req, res) => {
  const t = await dbInstance.transaction();
  try {
    const user = await updateUser(Number(req.body.id), req.body, t);
    await t.commit();
    return res.status(200).json({
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
      return res.status(409).json({
        success: false,
        message: 'This email is already registered.',
        field: 'email'
      });
    }
    console.error("Users update Error:", error);
    return serverError(res, "Something went wrong during user update.");
  }
});

// Delete User
router.delete("/deleteUser/:id", async (req: Request, res: Response) => {
  const { id } = req.params;

  // Convert 'id' to number
  const userId = parseInt(id, 10);

  if (isNaN(userId)) {
    return res.status(400).send("Invalid user ID");
  }

  const t = await dbInstance.transaction();

  try {
    const user = await deleteUser(userId, t);

    if (!user) {
      await t.rollback();
      return notFound(res, "User not found");
    }

    await t.commit();
    return res.status(200).json({
      success: true,
      message: "User deleted successfully.",
      data: user,
    });
    return sendEncryptedResponse(res, user, "User deleted successfully (soft delete).");
  } catch (error: any) {
    await t.rollback();
    ErrorLogger.write({ type: "deleteUser error", error });
    return serverError(res, error.message || "Something went wrong while deleting user.");
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

router.post("/login", async (req: Request, res: Response) => {
  try {
    const bodyData = req.body;
    const { email, contact, fcmToken } = bodyData;

    // Validation
    if (!email && !contact) {
      return serverError(res, "Email or mobile number is required for login.");
    }

    // User Lookup
    const findCondition: any = {};
    if (email) findCondition.email = email;
    if (contact) findCondition.contact = contact;

    const user = await User.findOne({ where: findCondition });
    if (!user) {
      return serverError(res, "User not found. Please register first.");
    }

    // OTP Verification Check
    const isVerified =
      (email && user.isEmailVerified) ||
      (contact && user.isMobileVerified);

    if (!isVerified) {
      return serverError(
        res,
        "OTP not verified. Please verify your email or mobile number before login."
      );
    }

    // JWT Token
    const authToken = generateToken(user);

    // Optional: Save/update FCM token
    // if (fcmToken) {
    //   await user.update({ fcmToken });
    // }

    // Final Response
    const nameData = user.email || user.contact || `User ID ${user.id}`;
    return sendEncryptedResponse(
      res,
      {
        userId: user.id,
        authToken,
      },
      `Login successful for ${nameData}.`
    );
  } catch (error) {
    console.error("Error in /login:", error);
    return serverError(res, "Something went wrong during login.");
  }
});

export default router;
import express from "express";
import jwt from "jsonwebtoken";
import { Request, Response } from "express";
import { other, notFound } from "../../../services/response"
import { sendEncryptedResponse } from "../../../services/encryptResponse-service";
import dbInstance from "../../../db/core/control-db";
import {
  addUser,
  checkUserData,
  updateUser,
  deleteUser,
  getUserByid,
  getAllUser,
  updateTheme,
  UserData,
  generateUniqueSecretCode,
  getUserByMbMo,
} from "./user-handler";
import { alreadyExist, serverError, unauthorized, } from "../../../utils/responseHandler";
import { User } from "../../api-webapp/user/user-model";import {
  hashPassword,
  checkPassword,
  generateRandomPassword,
  generateOTP
} from "../../../services/password-service";
import { sendEmail } from "../../../services/mailService";
import { sendOTP } from "../../../services/otp-service";
import { generateToken } from "../../../services/jwtToken-service";
import { tokenMiddleWare } from "../../../services/jwtToken-service";
// import { ErrorLogger } from "../../../db/core/logger/error-logger";
import ErrorLogger from "../../../db/core/logger/error-logger";
// import { responseEncoding } from "axios";


const router = express.Router();
// type Params = { id: string };

// User Registration
router.post("/register", async (req, res) => {
  const t = await dbInstance.transaction();
  try {
    let bodyData = req.body;
    const {
      referId,
      firstName,
      lastName,
      email,
      contact,
      userType,
      secretCode,
      isthemedark,
    } = bodyData;


    // Validation
    if (!referId || !firstName || !lastName || !email || !contact || !userType || !secretCode) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields",
      });
    }

    //duplicate check for Email,contact and secret Code 

    const existingUser = await checkUserData({ email, contact, secretCode });

    if (existingUser?.emailExists) {
      return alreadyExist(res, "Email already exists");
    }

    if (existingUser?.contactExists) {
      return alreadyExist(res, "Contact already exists");
    }

    if (existingUser?.secretCodeExists) {
      return alreadyExist(res, "Secret code already exists");
    }


    let finalSecretCode = secretCode;

    if (!finalSecretCode) {
      finalSecretCode = await generateUniqueSecretCode();
    }

    // user data 
    bodyData = {
      referId: referId,
      firstName: firstName,
      lastName: lastName,
      email: email || null,
      contact: contact || null,
      userType: userType || null,
      // secretCode: secretCode || null,
      secretCode: finalSecretCode,
      isthemedark: false,
      isActive: false,
    };

    console.log("Final bodyData before user creation:", bodyData);
    const user: any = await addUser(bodyData, t);

    await t.commit();

    console.log(" user created successfully:", user);
    return res.status(200).json({
      success: true,
      message: "Registration successful.",
      data: {
        userId: user.id,
        secretCode: user.secretCode,
      },

    });

  } catch (error: any) {
    await t.rollback();
    return serverError(res, error.message || "Registration failed.");
  }
});

// Get user by ID
router.get("/getUserID/:id",tokenMiddleWare, async (req: Request, res: Response) => {
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
router.get("/getAllUser",tokenMiddleWare, async (req, res) => {
  try {
    const allUser = await getAllUser(req.query);
    sendEncryptedResponse(res, allUser, "Got all users");
  } catch (error: any) {
    ErrorLogger.write({ type: "getAllUser error", error });
    serverError(res, error);
  }
});

// Update user 
router.post("/updateById", tokenMiddleWare, async (req, res) => {
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
router.delete("/deleteUser/:id", tokenMiddleWare,async (req: Request, res: Response) => {
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

router.post("/login", tokenMiddleWare, async (req: Request, res: Response) => {
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

module.exports = router;
import express from "express";
import jwt from "jsonwebtoken";
import { Request, Response } from "express";
import {
  addUser,
  checkUserData,
  updateUser,
  deleteUser,
  getUserByid,
  getAllUser,
  UserData,
  getUserByMbMo,
  updateUserFromApp,
  signupWithFacebook,
  signupWithGoogle,
  loginWithFacebook,
  loginWithGoogle,
  buildTokenPayload
} from "./user-handler";
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
  hashPassword,
  checkPassword,
  generateRandomPassword,
  generateOTP
} from "../../../services/password-service";
import { sendEmail } from "../../../services/mailService";
import { generateToken } from "../../../services/jwtToken-service";
import { tokenMiddleWare } from "../../../services/jwtToken-service";
import { User } from "./user-model";
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


// Latest Register API - 14 april
router.post("/register", async (req, res) => {
  const t = await dbInstance.transaction();
  try {
    let bodyData = req.body;
    const {
      name,
      email,
      mobile_number,
      password,
      loginType,
      fcmToken,
      deviceId,
    } = bodyData;

    const existingUser: any = await checkUserData({ email, mobile_number });
    if (existingUser) {
      const msg = `${email && existingUser.email === email ? "Email" : "Mobile"} already exists`;
      throw alreadyExist(res, msg);
    }

    // OTP generation
    const registerOTP = generateOTP();
    const currentTime = new Date();
    const expiryTime = new Date(currentTime.getTime() + 10 * 60 * 1000);

    // user data 
    bodyData = {
      name: name,
      email: email || null,
      mobile_number: mobile_number || null,
      password: loginType === "email" ? password : null,
      // role: role || "passenger",
      fcmToken: fcmToken || null,
      deviceId: deviceId || null,
      otp: email ? registerOTP : null,
      otpExpiresAt: email ? expiryTime : null,
      mbOTP: mobile_number ? registerOTP : null,
      mbOTPExpiresAt: mobile_number ? expiryTime : null,
      isEmailVerified: false,
      isMobileVerified: false,
      otpVerify: false,
      loginOTP: null,
      profile_completed: false,
      isActive: false,
    };

    console.log("Final bodyData before user creation:", bodyData);
    const user: any = await addUser(bodyData, t);

    // Send OTP
    const sendResult = await sendOTP(
      email ? { email, otp: registerOTP } : { mobile_number, mbOTP: registerOTP },
      "register"
    );

    if (!sendResult || !sendResult.success) {
      await t.rollback();
      return serverError(res, sendResult?.message || "Failed to send OTP.");
    }


    const token = await generateToken(buildTokenPayload(user));


    await t.commit();

    // return res.status(200).json({
    //   success: true,
    //   message: "OTP sent successfully.",
    //   data: {
    //     userId: user.id,
    //     token: token,
    //   },
    // });

    return sendEncryptedResponse(
      res,
      {
        userId: user.id,
        message: "OTP sent successfully. Please verify to complete registration.",
        data: {
          userId: user.id,
          token: token, // generated token
        },
      },
      "OTP sent successfully."
    );
  } catch (error: any) {
    await t.rollback();
    return serverError(res, error.message || "Registration failed.");
  }
});


// latest api send-otp - 14th april
router.post("/send-otp", tokenMiddleWare, async (req: Request, res: Response) => {
  try {
    const bodyData = req.body;
    const otp = generateOTP();

    // Email or Mobile (provided)
    if (!bodyData.email && !bodyData.mobile_number) {
      return serverError(res, "Email or mobile number is required.");
    }


    const whereCondition: any = {};
    if (bodyData.email) whereCondition.email = bodyData.email;
    if (bodyData.mobile_number) whereCondition.mobile_number = bodyData.mobile_number;

    // Find user
    const user = await User.findOne({ where: whereCondition });

    if (!user) {
      return serverError(res, "User not found. Please register first.");
    }

    // OTP expiry time
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 10 * 60 * 1000);

    // OTP update payload
    const payload: any = {};
    if (bodyData.email) {
      payload.otp = otp;
      payload.otpExpiresAt = expiresAt;
    }
    if (bodyData.mobile_number) {
      payload.mbOTP = otp;
      payload.mbOTPExpiresAt = expiresAt;
    }

    // Update OTP fields
    await user.update(payload);

    // Send OTP - email or mobile
    const sendResult = await sendOTP({ ...bodyData, otp }, "register");

    if (!sendResult.success) {
      return serverError(res, sendResult.message || "Failed to send OTP.");
    }

    const nameData = bodyData.email || bodyData.mobile_number;
    return sendEncryptedResponse(res, null, `OTP sent to ${nameData}`);
  } catch (error) {
    console.error("Error in /send-otp:", error);
    return serverError(res, "Something went wrong while sending OTP.");
  }
});


//latest verify-otp code-14th april
router.post("/verify-otp", async (req: Request, res: Response) => {
  try {
    const bodyData = req.body;
    const { otp } = bodyData;

    //Validation : OTP + either email or mobile
    if (!otp || (!bodyData.email && !bodyData.mobile_number)) {
      return serverError(res, "OTP and either email or mobile number is required.");
    }

    const whereCondition: any = { otp };
    if (bodyData.email) whereCondition.email = bodyData.email;
    if (bodyData.mobile_number) whereCondition.mobile_number = bodyData.mobile_number;

    // Find user
    const user = await User.findOne({ where: whereCondition });
    if (!user) {
      return serverError(res, "Invalid or expired OTP.");
    }

    // Expiry check
    const now = new Date();
    if (bodyData.email && user.otpExpiresAt && user.otpExpiresAt < now) {
      return serverError(res, "Email OTP has expired.");
    }
    if (bodyData.mobile_number && user.mbOTPExpiresAt && user.mbOTPExpiresAt < now) {
      return serverError(res, "Mobile OTP has expired.");
    }

    // update payload
    const payload: any = {
      otpVerify: true,
      otp: null,
      mbOTP: null,
      loginOTP: null,
      otpExpiresAt: null,
      mbOTPExpiresAt: null,
    };

    // Set verification flags
    if (bodyData.email && user.email === bodyData.email) {
      payload.isEmailVerified = true;
    }
    if (bodyData.mobile_number && user.mobile_number === bodyData.mobile_number) {
      payload.isMobileVerified = true;
    }

    // Update user
    await user.update(payload);

    // Reload updated user
    const updatedUser = await User.findOne({ where: { id: user.id } });
    const { isEmailVerified, isMobileVerified, email, mobile_number } = updatedUser!;

    const missingEmailVerify = !!email && !isEmailVerified;
    const missingMobileVerify = !!mobile_number && !isMobileVerified;

    // Check registration completion
    if (!missingEmailVerify && !missingMobileVerify) {
      await updatedUser!.update({ isActive: true });
      const nameData = bodyData.email || bodyData.mobile_number;
      return sendEncryptedResponse(res, null, `OTP verified successfully for ${nameData}. Registration completed.`);
    }

    // Dynamic message for pending verification
    if (missingEmailVerify) {
      return sendEncryptedResponse(res, null, "Please verify your email to complete registration.");
    }
    if (missingMobileVerify) {
      return sendEncryptedResponse(res, null, "Please verify your mobile number to complete registration.");
    }


    // Fallback
    return serverError(res, "OTP verified but registration is incomplete.");

  } catch (error) {
    console.error("Error in /verify-otp:", error);
    return serverError(res, "Something went wrong during OTP verification.");
  }
});


//to resend OTP(delete it if you want )
router.post("/resendOTP", tokenMiddleWare, async (req, res) => {
  let t = await dbInstance.transaction();
  try {
    const bodyData = req.body;

    const user: any = await getUserByMbMo(bodyData);
    if (!user) {
      const msg = "User Not Found";
      throw notFound(res, `{"msg": "${msg}"}`);
    }

    const resendOTP = generateOTP();

    const mailData: any = {
      to: bodyData.email,
      subject: "ZarklyX-New OTP",
      html: `<p> Your zarklyX otp is <strong>${resendOTP}</strong></p>.`,
    };

    await sendEmail(mailData);
    let payLoad = {
      otp: resendOTP,
      mobile_number: user.mobile_number,
    }
    await sendOTP(payLoad, 'register');
    await updateUserFromApp({ otp: resendOTP, otpVerify: false }, { id: user.id }, t);

    await t.commit();
    // success(res, true, "Send OTP Successfully on your Email");
    sendEncryptedResponse(res, true, "Sent OTP successfully on your mail and mobile number");
  } catch (error: any) {
    ErrorLogger.write({ type: "resendOTP error", error });
    await t.rollback();
    serverError(res, error);
  }
});



//latest complete-profile API - 14th April
router.post("/complete-profile", async (req: Request, res: Response) => {
  try {
    const bodyData = req.body;

    // by userId or email/mobile
    const whereCondition: any = {};
    if (bodyData.userId) whereCondition.id = bodyData.userId;
    if (bodyData.email) whereCondition.email = bodyData.email;
    if (bodyData.mobile_number) whereCondition.mobile_number = bodyData.mobile_number;

    if (Object.keys(whereCondition).length === 0) {
      return serverError(res, "User ID or email/mobile number is required.");
    }

    // Find user
    const user = await User.findOne({ where: whereCondition });
    if (!user) {
      return serverError(res, "User not found.");
    }

    // updating of allowed profile fields
    const allowedFields = ["gender", "dob", "address", "city", "state"];
    const payload: any = {};

    allowedFields.forEach((field) => {
      if (bodyData[field]) {
        payload[field] = bodyData[field];
      }
    });

    // If nothing to update
    if (Object.keys(payload).length === 0) {
      return serverError(res, "No profile fields provided to update.");
    }

    // Update user
    await user.update(payload);

    const nameData = user.email || user.mobile_number || `User ID ${user.id}`;
    return sendEncryptedResponse(res, null, `Profile updated successfully for ${nameData}.`);
  } catch (error) {
    console.error("Error in /complete-profile:", error);
    return serverError(res, "Something went wrong while completing profile.");
  }
});


//latest code get all user- 14th april
router.get("/getAllUser", async (req, res) => {
  try {
    const allUser = await getAllUser(req.query);
    sendEncryptedResponse(res, allUser, "Got all users");
  } catch (error: any) {
    ErrorLogger.write({ type: "getAllUser error", error });
    serverError(res, error);
  }
});


// latest cde -get user by id - 14april
router.get("/userByID/:id", async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const user = await getUserByid(id);

    if (!user) {
      return notFound(res, "User not found");
    }

    await sendEncryptedResponse(res, user, "Got user by ID");
  } catch (error: any) {
    ErrorLogger.write({ type: "getUserById error", error });
    return serverError(res, error);
  }
});



//latest update API - 14th april
router.put("/updateUser", async (req, res) => {
  const t = await dbInstance.transaction();
  try {
    console.log("Request body =>", req.body);

    const { id, email, mobile_number } = req.body;

    if (!id) {
      return serverError(res, "User ID is required for update.");
    }

    // Fetch current user
    const existingUser: any = await User.findOne({ where: { id } });
    if (!existingUser) {
      return serverError(res, "User not found.");
    }

    // Check if new email or mobile_number conflicts with another user
    const conflictUser = await checkUserData(req.body);
    if (conflictUser && conflictUser.id !== id) {
      if (email && conflictUser.email === email) {
        return alreadyExist(res, "Email already exists");
      }
      if (mobile_number && conflictUser.mobile_number === mobile_number) {
        return alreadyExist(res, "Phone No. already exists");
      }
    }

    // Prepare dynamic update payload
    const payload: any = {};

    if (req.body.name) payload.name = req.body.name;
    if (email) payload.email = email;
    if (mobile_number) payload.mobile_number = mobile_number;
    if (req.body.gender) payload.gender = req.body.gender;
    if (req.body.dob) payload.dob = req.body.dob;

    // If user completed all required profile fields, mark profile_completed true
    const isProfileComplete =
      (payload.gender || existingUser.gender) &&
      (payload.dob || existingUser.dob);

    if (isProfileComplete) {
      payload.profile_completed = true;
    }

    const updatedUser = await updateUser(payload, id, t);
    console.log("User Updated =>", updatedUser);

    await t.commit();
    sendEncryptedResponse(res, updatedUser, "Data updated successfully");
  } catch (error: any) {
    await t.rollback();
    console.error("Update error:", error);
    ErrorLogger.write({ type: "updateUser error", error });
    serverError(res, error.message || "An unexpected error occurred");
  }
});



//Delete user - extra api
// router.delete("/deleteUser/:id", async (req, res) => {
//   let t = await dbInstance.transaction();
//   try {
//     const id = req.params.id;
//     const deletedUser = await deleteUser(id); // just pass id directly

//     await t.commit();
//     return successResponse(res, "Data Deleted successfully", deletedUser);

//   } catch (error) {
//     await t.rollback();
//     serverError(res, error);
//   }
// });

//deleteUser
// router.delete("/deleteUser/:id", async (req: Request, res: Response) => {
//   const { id } = req.params;
//   const t = await dbInstance.transaction();

//   try {
//     const user = await deleteUser(id, t);

//     if (!user) {
//       await t.rollback();
//       return notFound(res, "User not found");
//     }

//     await t.commit();
//     return sendEncryptedResponse(res, user, "User deleted successfully");
//   } catch (error: any) {
//     await t.rollback();
//     ErrorLogger.write({ type: "deleteUser error", error });
//     return serverError(res, error);
//   }
// });

// latest delete api -14th april
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
    return sendEncryptedResponse(res, user, "User deleted successfully (soft delete).");
  } catch (error: any) {
    await t.rollback();
    ErrorLogger.write({ type: "deleteUser error", error });
    return serverError(res, error.message || "Something went wrong while deleting user.");
  }
});


//forgot password
router.post("/forgotPassword", async (req, res) => {
  let t = await dbInstance.transaction();
  try {
    const { email } = req.body;

    let user = await UserData(req.body);

    if (!user) {
      throw unauthorized(res, "Invalid Email");
    }
    const newPWD = generateRandomPassword();

    //send email - forgot pass
    const mailData: any = {
      to: email,
      subject: "ZarklyX-New Password",
      html: `<p> Your new password is <strong>${newPWD}</strong></p>.`,
    };

    sendEmail(mailData);

    // update newly generated password
    // const usr = await User.update({ password: newPWD }, { where: { email }, transaction: t });

    await t.commit();
    // success(res, user, "New Password Sent via Email");
    sendEncryptedResponse(res, user, "New Password Sent via Email");
  } catch (error: any) {
    ErrorLogger.write({ type: "forgotPassword error", error });
    await t.rollback();
    serverError(res, error);
  }
});

//Update Password
router.post("/changePassword", async (req, res) => {
  let t = await dbInstance.transaction();
  try {
    let { oldPassword } = req.body;
    // @ts-ignore-

    let user = await User.findOne({
      // @ts-ignore-
      where: { id: req.user.id },
      attributes: ["email", "id", "password"],
      raw: true,
    });
    // @ts-ignore-
    if (!checkPassword(oldPassword, user.password)) {
      throw other(res, "Your old Password is wrong");
    }
    //@ts-ignore-
    let newValue = await updateuserPassword(req.body, req.user.id, t);
    await t.commit();
    // success(res, newValue, "Your Password has been successfully updated!!");
    sendEncryptedResponse(
      res,
      newValue,
      "Your Password has been successfully updated!!"
    );
  } catch (error: any) {
    ErrorLogger.write({ type: "changePassword error", error });
    await t.rollback();
    serverError(res, error);
  }
});

//signup with facebook - latest code 14 april
router.post("/signup-facebook", async (req: Request, res: Response) => {
  try {
    const { accessToken, fcmToken, deviceId } = req.body;

    if (!accessToken) {
      return serverError(res, "Access token is required.");
    }

    const user = await signupWithFacebook(accessToken, fcmToken, deviceId);

    // create JWT token
    const token = jwt.sign(
      { id: user.id, name: user.name, email: user.email },
      process.env.JWT_SECRET!,
      { expiresIn: "1d" }
    );

    return sendEncryptedResponse(
      res,
      {
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          mobile_number: user.mobile_number,
          // role: user.role,
          loginType: user.loginType,
          profile_completed: user.profile_completed,
        },
      },
      `Facebook signup successful for ${user.name}.`
    );
  } catch (error) {
    console.error("Facebook Signup Error:", error);
    return serverError(res, "Something went wrong during Facebook signup.");
  }
});


//signup with google
router.post("/signup-google", async (req: Request, res: Response) => {
  try {
    const { accessToken, fcmToken, deviceId } = req.body;

    if (!accessToken) {
      return serverError(res, "Access token is required.");
    }

    const user = await signupWithGoogle(accessToken, fcmToken, deviceId);

    const token = jwt.sign(
      { id: user.id, name: user.name, email: user.email },
      process.env.JWT_SECRET!,
      { expiresIn: "1d" }
    );

    return sendEncryptedResponse(
      res,
      {
        token,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          mobile_number: user.mobile_number,
          // role: user.role,
          loginType: user.loginType,
          profile_completed: user.profile_completed,
        },
      },
      `Google signup successful for ${user.name}.`
    );
  } catch (error) {
    console.error("Google Signup Error:", error);
    return serverError(res, "Something went wrong during Google signup.");
  }
});


router.post("/login", async (req: Request, res: Response) => {
  try {
    const bodyData = req.body;
    const { email, mobile_number, fcmToken } = bodyData;

    // Validation
    if (!email && !mobile_number) {
      return serverError(res, "Email or mobile number is required for login.");
    }

    // User Lookup
    const findCondition: any = {};
    if (email) findCondition.email = email;
    if (mobile_number) findCondition.mobile_number = mobile_number;

    const user = await User.findOne({ where: findCondition });
    if (!user) {
      return serverError(res, "User not found. Please register first.");
    }

    // OTP Verification Check
    const isVerified =
      (email && user.isEmailVerified) ||
      (mobile_number && user.isMobileVerified);

    if (!isVerified) {
      return serverError(
        res,
        "OTP not verified. Please verify your email or mobile number before login."
      );
    }

    // JWT Token
    const authToken = generateToken(user);

    // Optional: Save/update FCM token
    if (fcmToken) {
      await user.update({ fcmToken });
    }

    // Final Response
    const nameData = user.email || user.mobile_number || `User ID ${user.id}`;
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



//Login with facebook 
router.post("/login-facebook", async (req: Request, res: Response) => {
  try {
    const { accessToken } = req.body;

    if (!accessToken) {
      return serverError(res, "Access token is required.");
    }

    const user = await loginWithFacebook(accessToken);

    const token = jwt.sign({ id: user.id, name: user.name, email: user.email }, process.env.JWT_SECRET!, { expiresIn: '1d' });

    return sendEncryptedResponse(res, {
      token,
      user: { id: user.id, name: user.name, email: user.email },
    }, `Facebook login successful for ${user.name}.`);
  } catch (error) {
    console.error("Facebook Login Error:", error);
    return serverError(res, "Something went wrong during Facebook login.");
  }
});

// Login with google
router.post("/login-google", async (req: Request, res: Response) => {
  try {
    const { accessToken } = req.body;

    if (!accessToken) {
      return serverError(res, "Access token is required.");
    }

    const user = await loginWithGoogle(accessToken);

    const token = jwt.sign({ id: user.id, name: user.name, email: user.email }, process.env.JWT_SECRET!, { expiresIn: '1d' });

    return sendEncryptedResponse(res, {
      token,
      user: { id: user.id, name: user.name, email: user.email },
    }, `Google login successful for ${user.name}.`);
  } catch (error) {
    console.error("Google Login Error:", error);
    return serverError(res, "Something went wrong during Google login.");
  }
});


module.exports = router;


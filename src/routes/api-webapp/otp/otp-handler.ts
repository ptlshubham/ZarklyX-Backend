import bcrypt from "bcryptjs";
import { Otp } from "../../api-webapp/otp/otp-model"; // Ensure correct import
import { User } from "../../api-webapp/user/user-model";
import { Op ,Transaction} from "sequelize";
const { MakeQuery } = require("../../../services/model-service");
import axios from "axios";
import { sendOTP } from "../../../services/otp-service"; 

//function a get user by id
// export const getUserByid = (id: string) => {
//   return User.findOne({
//     where: { id },
//     raw: true,
//   });
// }; 

export type OtpType = "email" | "mobile";     
export type OtpFlow = "register" | "login"; 

export interface SendOtpPayload {
  userId: string;
  email?: string;
  contact?: string;
  otpType?: OtpType;   // email / mobile
  otpFlow: OtpFlow;    // register / login
}

export interface ResendOtpPayload {
  userId: string;
  otpType: OtpType;
  otpFlow: OtpFlow;
}

export interface VerifyOtpPayload {
  userId: string;
  otpType: OtpType;
  otp: string;
}

// Rinkal
// List all OTP rows (admin / debug / list API)
export const getAllOtp = (query: any) => {
  const {
    limit: rawLimit,
    offset: rawOffset,
    modelOption,
    orderBy,
    attributes,
    forExcel,
  } = MakeQuery({
    query,
    Model: Otp,
  });

  const limit = Number(rawLimit) || 10;
  const offset = Number(rawOffset) || 0;

  const modalParam: any = {
    where: modelOption,
    attributes,
    order: orderBy,
    raw: true,
  };

  if (!forExcel) {
    modalParam.limit = limit;
    modalParam.offset = offset;
  }

  return Otp.findAndCountAll(modalParam);
};

// Get OTP row by email
export const getOtpByEmail = (email: string, t?: Transaction) => {
  return Otp.findOne({
    where: { email },
    transaction: t,
    raw: true,
  });
};
export const getOtpByContact = (contact: string, t?: Transaction) => {
  return Otp.findOne({
    where: { contact },
    transaction: t,
    raw: true,
  });
};

// Update OTP row by id
export const updateOtpById = (body: any, id: number, t?: Transaction) => {
  return Otp.update(body, {
    where: { id },
    transaction: t,
  });
};

// Create a new OTP row
export const createOtp = (body: any, t?: Transaction) => {
  return Otp.create(body, { transaction: t });
};
// Use this when you want to call otpRecord.update(...)
export const findOneOtp = (where: any, t?: Transaction) => {
  return Otp.findOne({
    where,
    transaction: t,
  });
};

// If you ever need plain object instead of instance
export const findOneOtpRaw = (where: any, t?: Transaction) => {
  return Otp.findOne({
    where,
    transaction: t,
    raw: true,
  });
};
// Login ke liye User by mobile/contact
export const getUserByMobileForLogin = (data: any) => {
  return User.findOne({
    where: {
      contact: data.contact || data.contact,
    },
    attributes: [
      "id",
      "userId",
      "email",
      "contact",
      "isEmailVerified",
      "isMobileVerified",
      "isActive",
      // "deviceId", "loginOTP", "otpVerify" Optional
    ],
    raw: true,
  });
};

// Generic user fetch by email
export const getUserByEmail = (data: any) => {
  return User.findOne({
    where: {
      email: data.email,
    },
    raw: true,
  });
};

// Generic user fetch by mobile/contact
export const getUserByMbMo = (data: any) => {
  return User.findOne({
    where: {
        contact: data.contact || data.contact,
    },
    raw: true,
  });
};


